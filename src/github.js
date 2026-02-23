const CONTRIB_API = 'https://github-contributions-api.jogruber.de/v4';
const GH_API = 'https://api.github.com';
const GH_TOKEN = import.meta.env.VITE_GITHUB_TOKEN || '';
const GH_HEADERS = GH_TOKEN
  ? { Accept: 'application/vnd.github.v3+json', Authorization: `token ${GH_TOKEN}` }
  : { Accept: 'application/vnd.github.v3+json' };

// Build-time cached data — Vite bundles this into the JS if the file exists,
// otherwise the glob returns an empty object and we fall through to live API.
const cachedModules = import.meta.glob('./github-data.json', { eager: true });
const CACHED_DATA = cachedModules['./github-data.json']?.default || null;

/**
 * Fetch all data needed for the gallery.
 * @param {string} username
 * @param {(status: string, pct: number) => void} onProgress
 * @returns {{ repos: object[], languages: Record<string,Record<string,number>>, contributions: object[] }}
 */
export async function fetchAllData(username, onProgress = () => {}) {
  // Use build-time cached data if available and username matches
  if (CACHED_DATA && Array.isArray(CACHED_DATA.repos) && CACHED_DATA.username === username) {
    onProgress('Loaded cached data', 90);
    return CACHED_DATA;
  }

  onProgress('Fetching repositories…', 5);

  // 1. Repos (sorted by stars, most popular first)
  let repos = [];
  try {
    const res = await fetch(
      `${GH_API}/users/${username}/repos?per_page=100&sort=updated&type=public`,
      { headers: GH_HEADERS }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const all = await res.json();
    repos = all
      .filter(r => !r.fork)
      .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
      .slice(0, 30);
  } catch (err) {
    console.warn('Failed to fetch repos:', err);
  }

  onProgress(`Found ${repos.length} repositories`, 20);

  // 2. Languages (batched in chunks of 5)
  const languages = {};
  const chunks = chunkArray(repos, 5);
  let done = 0;

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async repo => {
        try {
          const res = await fetch(repo.languages_url, { headers: GH_HEADERS });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          languages[repo.name] = await res.json();
        } catch (err) {
          console.warn(`Failed to fetch languages for ${repo.name}:`, err);
          languages[repo.name] = {};
        }
        done++;
        const pct = 20 + Math.round((done / repos.length) * 50);
        onProgress(`Loading language data… (${done}/${repos.length})`, pct);
      })
    );
  }

  onProgress('Fetching contribution history…', 75);

  // 3. Contributions
  let contributions = [];
  try {
    const res = await fetch(`${CONTRIB_API}/${username}?y=last`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // API returns { contributions: [...], total: {...} }
    contributions = data.contributions || [];
  } catch (err) {
    console.warn('Failed to fetch contributions (lobby will be flat):', err);
  }

  onProgress('Building world…', 90);

  return { repos, languages, contributions };
}

/**
 * Fetch the README markdown for a repo via raw.githubusercontent.com.
 * This bypasses the GitHub API rate limit entirely and returns raw UTF-8 text.
 * @param {string} owner
 * @param {string} repoName
 * @returns {Promise<string|null>} raw markdown text, or null on failure
 */
export async function fetchReadme(owner, repoName) {
  // Check build-time cache first
  if (CACHED_DATA?.readmes && repoName in CACHED_DATA.readmes) {
    return CACHED_DATA.readmes[repoName];
  }

  const RAW = 'https://raw.githubusercontent.com';
  // Try common README filenames (HEAD resolves to default branch)
  for (const name of ['README.md', 'readme.md', 'Readme.md', 'README.rst', 'README.txt', 'README']) {
    try {
      const res = await fetch(`${RAW}/${owner}/${repoName}/HEAD/${name}`);
      if (res.ok) return await res.text();
    } catch { /* try next */ }
  }
  return null;
}

/**
 * Fetch the top-level file tree for a repo via the Contents API.
 * @returns {Promise<Array<{path:string,type:string}>|null>}
 */
export async function fetchFileTree(owner, repoName) {
  // Check build-time cache first
  if (CACHED_DATA?.fileTrees && repoName in CACHED_DATA.fileTrees) {
    return CACHED_DATA.fileTrees[repoName];
  }

  try {
    const res = await fetch(`${GH_API}/repos/${owner}/${repoName}/contents/`, {
      headers: GH_HEADERS,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    // Normalize to same shape as Trees API (type: 'tree' for dirs, 'blob' for files)
    return data.map(e => ({ path: e.name, type: e.type === 'dir' ? 'tree' : 'blob' }));
  } catch {
    return null;
  }
}

/**
 * Fetch recent commits for a repo.
 * @param {string} owner
 * @param {string} repoName
 * @param {number} limit
 * @returns {Promise<Array<{sha:string, message:string, date:string, author:string}>|null>}
 */
export async function fetchCommits(owner, repoName, limit = 10) {
  // Check build-time cache first
  if (CACHED_DATA?.commits && repoName in CACHED_DATA.commits) {
    return CACHED_DATA.commits[repoName];
  }

  try {
    const res = await fetch(
      `${GH_API}/repos/${owner}/${repoName}/commits?per_page=${limit}`,
      { headers: GH_HEADERS }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.map(c => ({
      sha: c.sha.slice(0, 7),
      message: (c.commit.message || '').split('\n')[0].slice(0, 80),
      date: c.commit.author?.date || '',
      author: c.commit.author?.name || c.author?.login || '',
    }));
  } catch {
    return null;
  }
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
