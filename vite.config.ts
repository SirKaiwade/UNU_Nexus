import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SUPPORTED_EXT = new Set(['.pdf', '.docx', '.txt', '.md', '.markdown']);

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
};

function localLibraryPlugin(libraryPath: string): Plugin {
  const resolvedRoot = path.resolve(libraryPath);

  function safePath(relative: string): string | null {
    const decoded = decodeURIComponent(relative);
    const resolved = path.resolve(resolvedRoot, decoded);
    if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
      return null;
    }
    return resolved;
  }

  function listFiles(
    dir: string,
    prefix = ''
  ): Array<{ name: string; relativePath: string; size: number; modifiedAt: string }> {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: Array<{
      name: string;
      relativePath: string;
      size: number;
      modifiedAt: string;
    }> = [];

    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        files.push(...listFiles(full, rel));
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (!SUPPORTED_EXT.has(ext)) continue;
        const stat = fs.statSync(full);
        files.push({
          name: ent.name,
          relativePath: rel.replace(/\\/g, '/'),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }

    return files;
  }

  return {
    name: 'nexus-local-library',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/local-library')) return next();

        const url = new URL(req.url, 'http://localhost');

        if (req.method === 'GET' && url.pathname === '/api/local-library/list') {
          if (!fs.existsSync(resolvedRoot)) {
            fs.mkdirSync(resolvedRoot, { recursive: true });
          }
          const files = listFiles(resolvedRoot);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ path: resolvedRoot, files }));
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/local-library/file') {
          const rel = url.searchParams.get('path');
          if (!rel) {
            res.statusCode = 400;
            res.end('Missing path');
            return;
          }
          const full = safePath(rel);
          if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          const ext = path.extname(full).toLowerCase();
          res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
          fs.createReadStream(full).pipe(res);
          return;
        }

        next();
      });
    },
  };
}

const LOCAL_COLLECTIONS = new Set(['events', 'publications', 'directory']);

function localDataPlugin(dataPath: string): Plugin {
  const resolvedRoot = path.resolve(dataPath);

  function collectionPath(collection: string): string | null {
    if (!LOCAL_COLLECTIONS.has(collection)) return null;
    return path.join(resolvedRoot, `${collection}.json`);
  }

  function readBody(req: import('node:http').IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  return {
    name: 'nexus-local-data',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/local-data')) return next();

        const url = new URL(req.url, 'http://localhost');

        if (req.method === 'GET' && url.pathname === '/api/local-data/status') {
          if (!fs.existsSync(resolvedRoot)) {
            fs.mkdirSync(resolvedRoot, { recursive: true });
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ available: true, path: resolvedRoot }));
          return;
        }

        const match = url.pathname.match(/^\/api\/local-data\/([^/]+)$/);
        if (!match) {
          next();
          return;
        }

        const collection = match[1];
        const filePath = collectionPath(collection);
        if (!filePath) {
          res.statusCode = 404;
          res.end('Unknown collection');
          return;
        }

        if (req.method === 'GET') {
          if (!fs.existsSync(filePath)) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          res.setHeader('Content-Type', 'application/json');
          fs.createReadStream(filePath).pipe(res);
          return;
        }

        if (req.method === 'PUT') {
          try {
            const body = await readBody(req);
            const parsed = JSON.parse(body);
            if (!Array.isArray(parsed)) {
              res.statusCode = 400;
              res.end('Expected JSON array');
              return;
            }
            fs.mkdirSync(resolvedRoot, { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2));
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, count: parsed.length }));
          } catch (err) {
            res.statusCode = 400;
            res.end(err instanceof Error ? err.message : 'Invalid JSON');
          }
          return;
        }

        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (mode === 'production') {
    if (env.VITE_ANTHROPIC_API_KEY) {
      throw new Error(
        'VITE_ANTHROPIC_API_KEY must not be set for production builds. Use the chat Edge Function (ANTHROPIC_API_KEY secret).'
      );
    }
    if (env.VITE_DEV_BYPASS_AUTH === 'true') {
      throw new Error('VITE_DEV_BYPASS_AUTH cannot be enabled in production.');
    }
  }
  const libraryPath =
    env.NEXUS_LIBRARY_PATH || path.join(os.homedir(), 'Desktop', 'UNUNexus');
  const dataPath = env.NEXUS_DATA_PATH || path.join(process.cwd(), 'data', 'local');

  return {
    plugins: [react(), localLibraryPlugin(libraryPath), localDataPlugin(dataPath)],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
