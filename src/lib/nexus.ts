import Anthropic from '@anthropic-ai/sdk';
import { documents } from '../data/documents';
import { getPeople } from '../data/people';
import { eventsStore } from '../data/events';
import { publicationsStore } from '../data/publications';
import { eventToText, publicationToText } from './corpusText';
import { supabaseConfigured } from './supabase';
import {
  retrieveLibraryDocs,
  type LibraryCatalogEntry,
} from './retrieve';
import type { UploadedDoc } from './uploads';
import type { ChatMessage } from '../types/chat';
import type { SourceReference } from '../types';

// Haiku — cheapest and fastest. Swap if Anthropic deprecates this alias.
const MODEL = 'claude-haiku-4-5';

const apiKey = import.meta.env.DEV
  ? (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined)
  : undefined;

// Direct-from-browser client — local `npm run dev` only. Production must use
// the `chat` Edge Function so the API key never ships in the JS bundle.
const client = apiKey
  ? new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  : null;

export function nexusReady(): boolean {
  return supabaseConfigured() || Boolean(client);
}

async function callViaEdgeFunction(
  payload: Anthropic.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message> {
  const { callEdgeFunction } = await import('./edgeFn');
  const result = await callEdgeFunction<Anthropic.Message>('chat', payload);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

export interface NexusResult {
  answer: string;
  /** Present only when the model actually supplied a score — never fabricated. */
  confidence?: number;
  sources: SourceReference[];
  followUps: string[];
  relatedPeopleIds: string[];
  noAnswer: boolean;
}

function buildSystemPrompt(
  retrievedDocs: UploadedDoc[],
  catalog: LibraryCatalogEntry[],
  totalLibraryDocs: number
): string {
  const docBlocks = documents
    .map(
      (d) => `<doc id="${d.id}">
  <title>${d.title}</title>
  <type>${d.type}</type>
  <team>${d.team}</team>
  <region>${d.region}</region>
  <owner>${d.ownerId}</owner>
  <status>${d.status}</status>
  <freshness>${d.freshness}</freshness>
  <updated>${d.updatedAt}</updated>
  <topics>${d.topics.join(', ')}</topics>
  <summary>${d.summary}</summary>
  <takeaways>${d.takeaways.map((t) => `- ${t}`).join('\n  ')}</takeaways>${
        d.excerpt ? `\n  <excerpt>${d.excerpt}</excerpt>` : ''
      }
  <related_people>${d.relatedPeopleIds.join(', ')}</related_people>
</doc>`
    )
    .join('\n\n');

  const peopleBlocks = getPeople()
    .map(
      (p) => `<person id="${p.id}">
  <name>${p.name}</name>
  <role>${p.role}</role>
  <team>${p.team}</team>
  <expertise>${p.expertise.join(', ')}</expertise>
</person>`
    )
    .join('\n\n');

  const eventBlocks = eventsStore
    .get()
    .map((e) => `<event id="${e.id}">\n${eventToText(e)}\n</event>`)
    .join('\n\n');

  const publicationBlocks = publicationsStore
    .get()
    .map((p) => `<publication id="${p.id}">\n${publicationToText(p)}\n</publication>`)
    .join('\n\n');

  const catalogBlocks = catalog
    .map(
      (c) =>
        `<file id="${c.id}" path="${c.path}" breadcrumb="${c.breadcrumb}" chars="${c.charCount}"${
          c.pageCount ? ` pages="${c.pageCount}"` : ''
        }>${c.filename}</file>`
    )
    .join('\n');

  const uploadedBlocks = retrievedDocs
    .map((u) => {
      const path = (u.localRelativePath || u.filename).replace(/\\/g, '/');
      const parts = path.split('/').filter(Boolean);
      const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
      const breadcrumb =
        parts.length <= 1
          ? `Library > ${parts[0] || u.filename}`
          : parts.join(' > ');
      const libraryHref = folder
        ? `/library?path=${encodeURIComponent(folder)}&file=${encodeURIComponent(u.id)}`
        : `/library?file=${encodeURIComponent(u.id)}`;
      return `<doc id="${u.id}" source="user-upload">
  <title>${u.filename}</title>
  <path>${path}</path>
  <breadcrumb>${breadcrumb}</breadcrumb>${
        folder ? `\n  <folder>${folder}</folder>` : ''
      }
  <library_link>${libraryHref}</library_link>
  <type>Uploaded document</type>
  <uploaded_at>${u.uploadedAt}</uploaded_at>${
        u.pageCount ? `\n  <pages>${u.pageCount}</pages>` : ''
      }
  <full_text>${u.text}</full_text>
</doc>`;
    })
    .join('\n\n');

  let uploadedSection = '';
  if (totalLibraryDocs > 0) {
    uploadedSection = `\n\n<knowledge_library total_files="${totalLibraryDocs}">
The knowledge library may contain many files. You receive (1) a complete <library_catalog> of every file path so you can answer "where is…" questions, and (2) <retrieved_documents> — the subset most relevant to this question, with extractable text. Prefer retrieved docs for factual claims. For location questions, use catalog breadcrumbs even if a file was not fully retrieved. Cite retrieved docs by id (starts with "up-"). When pointing to a location, use Folder > Subfolder > file breadcrumbs and markdown links like [budget.xlsx](/library?path=Finance/2024&file=up-abc).

<library_catalog>
${catalogBlocks}
</library_catalog>

<retrieved_documents count="${retrievedDocs.length}">
${uploadedBlocks || '(No strongly matching file bodies for this question — use the catalog for locations, or set noAnswer if content is required.)'}
</retrieved_documents>
</knowledge_library>`;
  }

  const corpus = `<corpus>\n<documents>\n${docBlocks}\n</documents>\n\n<people>\n${peopleBlocks}\n</people>\n\n<events_2026>\n${eventBlocks}\n</events_2026>\n\n<publications_2026>\n${publicationBlocks}\n</publications_2026>\n</corpus>${uploadedSection}`;

  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return `You are Nexus, the institutional knowledge layer for UNU Global Health (United Nations University).

Today's date is ${today}. Use it to reason about which events are upcoming versus past.

Your job: answer questions about UNU Global Health's work using ONLY the corpus below. The corpus contains documents (reports, briefs, meeting notes, datasets, etc.), the people behind them, the 2026 events matrix (every convening UNU Global Health runs or contributes to: conferences, webinars, workshops, policy dialogues, consultations, partnership meetings, and side events), and the 2026 publications database (journal articles, policy briefs, reports, book chapters, and web articles). Events (ids starting "ev-") and publications (ids starting "pub-") are first-class, citable corpus entries — cite them like documents, quoting verbatim from their entry text. The knowledge library may hold far more files than fit in one prompt: a catalog lists every file; retrieved document bodies are the ones searched for this question.

Rules:
- Ground every claim in the corpus. Never invent facts, dates, names, or findings.
- If the corpus does not contain enough to answer confidently, call the "answer" tool with noAnswer=true and explain in the answer field what is missing and the closest adjacent material.
- Cite every claim inline using [1], [2], [3] markers. The number maps to the position in the sources array (1-indexed).
- Keep the sources array COMPACT — for each [n] include only documentId and a short relevanceReason (one clause). Do NOT put long excerpts in the sources array; the UI fetches verbatim quotes on demand when the user clicks a citation. This keeps long answers reliable.
- Cap at 12 sources. Prefer the strongest supporting documents over exhaustive citation.
- Location questions ("where do I find…", "which folder has…", "where are the numbers for…"): lead with the document's breadcrumb in "Folder > Subfolder > file" form from the library catalog (or retrieved doc) and a markdown hyperlink to /library?path=…&file=…. Example: "You can find it at **Finance > 2024 > Q1 > [budget.xlsx](/library?path=Finance/2024/Q1&file=up-abc).**" Still include a normal [n] citation.
- Use **bold** sparingly for key entities, project names, and findings.
- Order sources by importance to the answer.
- For roll-up questions across the events matrix or publications database (counts, upcoming events, who leads what, reach numbers), synthesise across entries and cite the most relevant individual entries — at most 6 sources. State plainly when many entries have missing fields (e.g. participant counts not yet reported).
- Pick relatedPeopleIds from document owners, related_people fields, or expertise matches. Max 4. Skip this for questions that are purely about uploaded library documents.
- Generate 3 concrete follow-up questions a user would realistically ask next, grounded in the corpus or uploads.
- Confidence: report only when honest. 0.85+ when directly supported by 2+ sources; 0.65-0.84 when synthesised across sources; below 0.65 when partial. Prefer omitting confidence over fabricating one.
- Tone: factual, concise, like a senior colleague briefing you. No marketing voice, no hedging filler.

${corpus}`;
}

const ANSWER_TOOL: Anthropic.Tool = {
  name: 'answer',
  description:
    'Provide a cited answer grounded in the UNU Global Health corpus. Always call this tool exactly once.',
  input_schema: {
    type: 'object',
    properties: {
      answer: {
        type: 'string',
        description:
          'Markdown answer with **bold** for key entities and inline [1], [2], [3] citations. Use \\n\\n between paragraphs. Use - for bullet lists.',
      },
      confidence: {
        type: 'number',
        description:
          'Optional confidence 0–1 using the rubric. Omit rather than invent a score if you cannot honestly assess grounding.',
      },
      sources: {
        type: 'array',
        description:
          'Compact source list matching inline [n] markers. documentId + short relevanceReason only — no long excerpts.',
        items: {
          type: 'object',
          properties: {
            documentId: {
              type: 'string',
              description: 'Must exactly match a doc/event/publication/upload id from the corpus.',
            },
            relevanceReason: {
              type: 'string',
              description:
                'One short clause explaining why this source is relevant to the question.',
            },
            excerpt: {
              type: 'string',
              description:
                'Optional. Prefer omitting — the UI fetches verbatim quotes on demand.',
            },
          },
          required: ['documentId', 'relevanceReason'],
        },
      },
      relatedPeopleIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Up to 4 person ids from the corpus.',
      },
      followUps: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exactly 3 follow-up questions.',
      },
      noAnswer: {
        type: 'boolean',
        description:
          'True only when the corpus cannot support a confident answer.',
      },
    },
    required: ['answer', 'sources', 'followUps', 'noAnswer'],
  },
};

const seedDocIds = new Set(documents.map((d) => d.id));

function validPeopleIds(): Set<string> {
  return new Set(getPeople().map((p) => p.id));
}

function historyToMessages(history: ChatMessage[]): Anthropic.MessageParam[] {
  return history
    .filter((m) => !m.pending && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));
}

export async function askNexus(
  question: string,
  history: ChatMessage[] = [],
  uploadedDocs: UploadedDoc[] = [],
  options?: { pinnedDocIds?: string[] }
): Promise<NexusResult> {
  const useEdgeFunction = supabaseConfigured();
  if (!client && !useEdgeFunction) {
    return {
      answer:
        "Nexus isn't connected to a model yet. Configure Supabase and deploy the `chat` Edge Function (production), or add `VITE_ANTHROPIC_API_KEY` to `.env.local` for local `npm run dev` only.",
      sources: [],
      followUps: [],
      relatedPeopleIds: [],
      noAnswer: true,
    };
  }

  const { retrieved, catalog, totalLibraryDocs } = retrieveLibraryDocs(
    question,
    uploadedDocs,
    { pinnedDocIds: options?.pinnedDocIds }
  );

  const messages: Anthropic.MessageParam[] = [
    ...historyToMessages(history),
    { role: 'user', content: question },
  ];

  const payload: Anthropic.MessageCreateParamsNonStreaming = {
    model: MODEL,
    max_tokens: 4096,
    system: buildSystemPrompt(retrieved, catalog, totalLibraryDocs),
    tools: [ANSWER_TOOL],
    tool_choice: { type: 'tool', name: 'answer' },
    messages,
  };

  const response = useEdgeFunction
    ? await callViaEdgeFunction(payload)
    : await client!.messages.create(payload);

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  );

  if (!toolUse) {
    throw new Error('Nexus did not return a structured answer.');
  }

  const raw = toolUse.input as {
    answer: string;
    confidence?: number;
    sources: Array<{ documentId: string; excerpt?: string; relevanceReason: string }>;
    relatedPeopleIds?: string[];
    followUps?: string[];
    noAnswer?: boolean;
  };

  const uploadedDocIds = new Set(uploadedDocs.map((u) => u.id));
  const eventIds = new Set(eventsStore.get().map((e) => e.id));
  const publicationIds = new Set(publicationsStore.get().map((p) => p.id));
  // Filter to known ids so the UI never tries to render a phantom source.
  const sources = (raw.sources ?? [])
    .filter(
      (s) =>
        seedDocIds.has(s.documentId) ||
        uploadedDocIds.has(s.documentId) ||
        eventIds.has(s.documentId) ||
        publicationIds.has(s.documentId)
    )
    .map((s) => ({
      documentId: s.documentId,
      excerpt: typeof s.excerpt === 'string' ? s.excerpt : '',
      relevanceReason: s.relevanceReason ?? '',
    }));
  const relatedPeopleIds = (raw.relatedPeopleIds ?? []).filter((id) =>
    validPeopleIds().has(id)
  );

  const confidence =
    typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
      ? clamp01(raw.confidence)
      : undefined;

  return {
    answer: raw.answer ?? '',
    confidence,
    sources,
    followUps: (raw.followUps ?? []).slice(0, 3),
    relatedPeopleIds,
    noAnswer: Boolean(raw.noAnswer),
  };
}

const QUOTE_TOOL: Anthropic.Tool = {
  name: 'source_quotes',
  description:
    'Return one or more verbatim corpus quotes that support a specific claim.',
  input_schema: {
    type: 'object',
    properties: {
      quotes: {
        type: 'array',
        description: '1–3 supporting quotes, strongest first.',
        items: {
          type: 'object',
          properties: {
            documentId: {
              type: 'string',
              description:
                'Exact corpus id of the document/event/publication/upload.',
            },
            excerpt: {
              type: 'string',
              description:
                'Verbatim contiguous quote (1–3 sentences) copied character-for-character from that source. No paraphrasing, no ellipses inside the quote.',
            },
            relevanceReason: {
              type: 'string',
              description: 'One short clause on why this quote supports the claim.',
            },
          },
          required: ['documentId', 'excerpt', 'relevanceReason'],
        },
      },
    },
    required: ['quotes'],
  },
};

export interface ResolvedSourceQuote {
  documentId: string;
  excerpt: string;
  relevanceReason: string;
}

function isKnownDocId(
  documentId: string,
  uploadedDocs: UploadedDoc[]
): boolean {
  if (seedDocIds.has(documentId)) return true;
  if (uploadedDocs.some((u) => u.id === documentId)) return true;
  if (eventsStore.get().some((e) => e.id === documentId)) return true;
  if (publicationsStore.get().some((p) => p.id === documentId)) return true;
  return false;
}

/**
 * Find exact supporting quotes for a claim (citation click or text selection).
 * Prompt focuses on the claim sentences, not the whole answer.
 */
export async function findSupportingQuotes(params: {
  claimText: string;
  /** Optional full answer for light context only. */
  answer?: string;
  citationNumber?: number;
  knownDocumentId?: string;
  maxQuotes?: number;
  uploadedDocs?: UploadedDoc[];
  pinnedDocIds?: string[];
}): Promise<ResolvedSourceQuote[]> {
  const useEdgeFunction = supabaseConfigured();
  if (!client && !useEdgeFunction) {
    throw new Error('Nexus is not connected to a model.');
  }

  const claim = params.claimText.trim();
  if (!claim) {
    throw new Error('No claim text to ground.');
  }

  const uploadedDocs = params.uploadedDocs ?? [];
  const maxQuotes = Math.min(Math.max(params.maxQuotes ?? 1, 1), 3);
  const { retrieved, catalog, totalLibraryDocs } = retrieveLibraryDocs(
    claim,
    uploadedDocs,
    {
      pinnedDocIds: [
        ...(params.pinnedDocIds ?? []),
        ...(params.knownDocumentId ? [params.knownDocumentId] : []),
      ],
    }
  );

  const citeHint =
    params.citationNumber != null
      ? `This claim sits next to inline citation [${params.citationNumber}] in the answer.`
      : 'This claim was highlighted by the user in the answer.';

  const preferred = params.knownDocumentId
    ? `Preferred document id when it fits: ${params.knownDocumentId}. Still pick a different passage if this claim needs a different excerpt from that same file.`
    : 'Pick the best matching corpus entry for THIS claim.';

  const answerBlock = params.answer?.trim()
    ? `\nFull answer (context only — ground the CLAIM, not the whole answer):\n"""\n${params.answer.slice(0, 2500)}\n"""\n`
    : '';

  const userPrompt = `Find exact quotes in quotation marks to support the following claim.

CLAIM TO SUPPORT:
"""
${claim}
"""

${citeHint}
${preferred}
${answerBlock}
Return ${maxQuotes === 1 ? 'exactly 1' : `up to ${maxQuotes}`} verbatim quote(s) via the source_quotes tool.
Each excerpt must be copied character-for-character from the corpus (1–3 sentences). No paraphrase.
Different claims in the same document need different excerpts — match the CLAIM above, not a generic source summary.`;

  const payload: Anthropic.MessageCreateParamsNonStreaming = {
    model: MODEL,
    max_tokens: 1200,
    system: `${buildSystemPrompt(retrieved, catalog, totalLibraryDocs)}

You resolve supporting quotes on demand. Call source_quotes exactly once.
Ground ONLY the claim the user provided. Prefer passages that specifically back that claim's wording and facts.`,
    tools: [QUOTE_TOOL],
    tool_choice: { type: 'tool', name: 'source_quotes' },
    messages: [{ role: 'user', content: userPrompt }],
  };

  const response = useEdgeFunction
    ? await callViaEdgeFunction(payload)
    : await client!.messages.create(payload);

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  );
  if (!toolUse) {
    throw new Error('Nexus did not return source quotes.');
  }

  const raw = toolUse.input as {
    quotes?: Array<{ documentId: string; excerpt: string; relevanceReason: string }>;
  };

  const quotes = (raw.quotes ?? [])
    .filter(
      (q) =>
        q?.excerpt?.trim() &&
        q.documentId &&
        isKnownDocId(q.documentId, uploadedDocs)
    )
    .map((q) => ({
      documentId: q.documentId,
      excerpt: q.excerpt.trim(),
      relevanceReason: q.relevanceReason?.trim() ?? '',
    }))
    .slice(0, maxQuotes);

  if (quotes.length === 0) {
    throw new Error('Could not locate a verifiable quote for this claim.');
  }

  return quotes;
}

/** @deprecated Prefer findSupportingQuotes — kept for call-site compatibility. */
export async function resolveSourceQuote(params: {
  answer: string;
  citationNumber: number;
  claimContext: string;
  knownDocumentId?: string;
  uploadedDocs?: UploadedDoc[];
  pinnedDocIds?: string[];
}): Promise<ResolvedSourceQuote> {
  const [first] = await findSupportingQuotes({
    claimText: params.claimContext,
    answer: params.answer,
    citationNumber: params.citationNumber,
    knownDocumentId: params.knownDocumentId,
    maxQuotes: 1,
    uploadedDocs: params.uploadedDocs,
    pinnedDocIds: params.pinnedDocIds,
  });
  return first;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
