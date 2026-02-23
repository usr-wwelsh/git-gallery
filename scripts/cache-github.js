/**
 * Build-time script: fetch GitHub data and write to public/github-data.json
 * so the gallery can load without hitting the API at runtime.
 *
 * Usage:  node scripts/cache-github.js
 * Env:    VITE_GITHUB_TOKEN (optional, raises rate limit from 60 to 5000/hr)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
//  Load env vars (VITE_GITHUB_TOKEN) from .env if present
// ---------------------------------------------------------------------------
const envPath = resolve(ROOT, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

// ---------------------------------------------------------------------------
//  Read CONFIG.username from src/main.js
// ---------------------------------------------------------------------------
const mainSrc = readFileSync(resolve(ROOT, 'src/main.js'), 'utf-8');
const usernameMatch = mainSrc.match(/username:\s*['"]([^'"]+)['"]/);
if (!usernameMatch) {
  console.error('Could not parse CONFIG.username from src/main.js');
  process.exit(1);
}
const USERNAME = usernameMatch[1];
console.log(`Caching GitHub data for user: ${USERNAME}`);

// ---------------------------------------------------------------------------
//  GitHub API helpers
// ---------------------------------------------------------------------------
const GH_API = 'https://api.github.com';
const CONTRIB_API = 'https://github-contributions-api.jogruber.de/v4';
const GH_TOKEN = process.env.VITE_GITHUB_TOKEN || '';
const GH_HEADERS = {
  Accept: 'application/vnd.github.v3+json',
  ...(GH_TOKEN ? { Authorization: `token ${GH_TOKEN}` } : {}),
};

async function ghFetch(url) {
  const res = await fetch(url, { headers: GH_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// ---------------------------------------------------------------------------
//  Fetch all data (mirrors src/github.js fetchAllData)
// ---------------------------------------------------------------------------
async function fetchAll() {
  // 1. Repos
  console.log('  Fetching repositories…');
  let repos = [];
  try {
    const all = await ghFetch(
      `${GH_API}/users/${USERNAME}/repos?per_page=100&sort=updated&type=public`
    );
    repos = all
      .filter(r => !r.fork)
      .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
      .slice(0, 20);
    console.log(`  Found ${repos.length} repos`);
  } catch (err) {
    console.warn('  Failed to fetch repos:', err.message);
    return null;
  }

  // 2. Languages (batched in chunks of 5)
  console.log('  Fetching language data…');
  const languages = {};
  const chunks = [];
  for (let i = 0; i < repos.length; i += 5) chunks.push(repos.slice(i, i + 5));

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async repo => {
        try {
          languages[repo.name] = await ghFetch(repo.languages_url);
        } catch (err) {
          console.warn(`  Failed languages for ${repo.name}: ${err.message}`);
          languages[repo.name] = {};
        }
      })
    );
  }
  console.log(`  Fetched languages for ${Object.keys(languages).length} repos`);

  // 3. Contributions
  console.log('  Fetching contribution history…');
  let contributions = [];
  try {
    const res = await fetch(`${CONTRIB_API}/${USERNAME}?y=last`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    contributions = data.contributions || [];
    console.log(`  Got ${contributions.length} contribution days`);
  } catch (err) {
    console.warn('  Failed contributions:', err.message);
  }

  return { repos, languages, contributions };
}

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------
try {
  const data = await fetchAll();
  if (!data) {
    console.warn('Failed to fetch data — skipping cache (build will use live API)');
    process.exit(0);
  }

  const outPath = resolve(ROOT, 'public/github-data.json');
  writeFileSync(outPath, JSON.stringify(data));
  const sizeKB = (Buffer.byteLength(JSON.stringify(data)) / 1024).toFixed(1);
  console.log(`Wrote ${outPath} (${sizeKB} KB)`);
} catch (err) {
  console.error('Cache script failed:', err.message);
  // Exit 0 so the build can still proceed with live API fallback
  process.exit(0);
}
