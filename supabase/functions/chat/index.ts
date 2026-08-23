import Anthropic from 'npm:@anthropic-ai/sdk@0.104.1';
import { corsPreflight, json } from '../_shared/cors.ts';
import { requireUser, type SupabaseClient } from '../_shared/auth.ts';

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 4096;
const MAX_SYSTEM_CHARS = 400_000;
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 20_000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 40;

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
const client = apiKey ? new Anthropic({ apiKey }) : null;

function clipText(value: unknown, max: number): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return s.length > max ? s.slice(0, max) : s;
}

function sanitizePayload(raw: unknown): Anthropic.MessageCreateParamsNonStreaming {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid request body');
  }
  const p = raw as Record<string, unknown>;
  const maxTokens = Math.min(
    Math.max(1, Number(p.max_tokens) || 1024),
    MAX_TOKENS
  );

  const messagesIn = Array.isArray(p.messages) ? p.messages.slice(-MAX_MESSAGES) : [];
  const messages = messagesIn.map((m) => {
    const msg = m as { role?: string; content?: unknown };
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    return { role, content: clipText(msg.content, MAX_MESSAGE_CHARS) };
  }) as Anthropic.MessageParam[];

  if (messages.length === 0) {
    throw new Error('messages required');
  }

  const tools = Array.isArray(p.tools)
    ? (p.tools as Anthropic.Tool[]).filter(
        (t) => t && (t.name === 'answer' || t.name === 'source_quotes')
      )
    : undefined;

  const toolChoice = p.tool_choice as Anthropic.MessageCreateParamsNonStreaming['tool_choice'];

  return {
    model: MODEL,
    max_tokens: maxTokens,
    system: clipText(p.system, MAX_SYSTEM_CHARS),
    messages,
    ...(tools && tools.length > 0 ? { tools, tool_choice: toolChoice } : {}),
  };
}

async function consumeRateLimit(admin: SupabaseClient, userId: string): Promise<boolean> {
  const now = Date.now();
  const { data } = await admin
    .from('chat_rate_buckets')
    .select('window_start, hit_count')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) {
    const { error } = await admin.from('chat_rate_buckets').insert({
      user_id: userId,
      window_start: new Date(now).toISOString(),
      hit_count: 1,
    });
    return !error;
  }

  const start = new Date(data.window_start).getTime();
  if (now - start > RATE_WINDOW_MS) {
    await admin
      .from('chat_rate_buckets')
      .update({ window_start: new Date(now).toISOString(), hit_count: 1 })
      .eq('user_id', userId);
    return true;
  }
  if (data.hit_count >= RATE_MAX) return false;
  await admin
    .from('chat_rate_buckets')
    .update({ hit_count: data.hit_count + 1 })
    .eq('user_id', userId);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflight(req);
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);
  if (!client) {
    return json(req, { error: 'ANTHROPIC_API_KEY is not set for this Supabase project.' }, 500);
  }

  const auth = await requireUser(req);
  if ('error' in auth) return json(req, { error: auth.error }, auth.status);

  const allowed = await consumeRateLimit(auth.admin, auth.user.id);
  if (!allowed) {
    return json(req, { error: 'Too many chat requests. Try again in a few minutes.' }, 429);
  }

  try {
    const payload = sanitizePayload(await req.json());
    const response = await client.messages.create(payload);
    return json(req, response);
  } catch (err) {
    console.error('[Nexus chat function]', err);
    const message = err instanceof Error ? err.message : 'Unknown error calling Anthropic.';
    return json(req, { error: message }, 500);
  }
});
