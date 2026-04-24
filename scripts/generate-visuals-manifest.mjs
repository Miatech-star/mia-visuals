#!/usr/bin/env node
/**
 * generate-visuals-manifest.mjs
 *
 * Scans ../visuals for .html files and emits ../visuals.json, which the
 * index portal consumes at runtime. Runs at deploy time (Vercel "build"
 * step, GitHub Action, or locally via `npm run build`).
 *
 * Manifest shape:
 * {
 *   "generatedAt": "2026-04-23T12:00:00.000Z",
 *   "count": 3,
 *   "visuals": [
 *     {
 *       "fileName": "wave-field.html",
 *       "title":    "Wave Field",
 *       "path":     "visuals/wave-field.html",
 *       "preview":  "visuals/wave-field.html",
 *       "modified": "2026-04-21T09:31:00.000Z"
 *     }
 *   ]
 * }
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const VISUALS_DIR  = path.join(PROJECT_ROOT, 'visuals');
const OUTPUT_FILE  = path.join(PROJECT_ROOT, 'visuals.json');

/** Pull the contents of the first <title> tag, if any. */
async function extractTitle(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const match = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (match) {
      const title = match[1].replace(/\s+/g, ' ').trim();
      if (title) return title;
    }
  } catch {
    /* ignore and fall through to filename */
  }
  return null;
}

/** Turn "wave-field_v2.html" into "Wave Field V2". */
function titleFromFilename(fileName) {
  return fileName
    .replace(/\.html?$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function buildManifest() {
  let entries = [];
  try {
    entries = await fs.readdir(VISUALS_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`[visuals] No /visuals directory found — writing empty manifest.`);
    } else {
      throw err;
    }
  }

  const htmlEntries = entries.filter(
    (e) => e.isFile() && /\.html?$/i.test(e.name) && !e.name.startsWith('.')
  );

  const visuals = await Promise.all(
    htmlEntries.map(async (entry) => {
      const fullPath = path.join(VISUALS_DIR, entry.name);
      const stat     = await fs.stat(fullPath);
      const rawTitle = await extractTitle(fullPath);

      return {
        fileName: entry.name,
        title:    rawTitle || titleFromFilename(entry.name),
        path:     `visuals/${entry.name}`,
        preview:  `visuals/${entry.name}`,
        modified: stat.mtime.toISOString(),
      };
    })
  );

  // Default order: most recently modified first.
  visuals.sort((a, b) => new Date(b.modified) - new Date(a.modified));

  return {
    generatedAt: new Date().toISOString(),
    count: visuals.length,
    visuals,
  };
}

async function main() {
  const manifest = await buildManifest();
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const rel = path.relative(PROJECT_ROOT, OUTPUT_FILE);
  console.log(`[visuals] Wrote ${rel} — ${manifest.count} visual${manifest.count === 1 ? '' : 's'}.`);
  manifest.visuals.forEach((v) => console.log(`          · ${v.title}  (${v.fileName})`));
}

main().catch((err) => {
  console.error('[visuals] Failed to generate manifest:', err);
  process.exit(1);
});
