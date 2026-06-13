/**
 * fetch-stats.js
 * Pulls public repo count + total commit count for GITHUB_USERNAME
 * and writes stats.json consumed by the other scripts.
 */

import fetch from 'node-fetch';
import fs    from 'fs';

const USERNAME = process.env.GITHUB_USERNAME || '0xSalik';
const TOKEN    = process.env.GITHUB_TOKEN;

const headers = {
  'Accept':        'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {}),
};

async function ghFetch(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${url}`);
  return res.json();
}

async function getRepoCount() {
  const user = await ghFetch(`https://api.github.com/users/${USERNAME}`);
  return user.public_repos;
}

async function getTotalCommits() {
  // GitHub's search API gives commit count per author across all public repos.
  // It's approximate but accurate enough for a profile badge.
  const url = `https://api.github.com/search/commits?q=author:${USERNAME}&per_page=1`;
  const data = await ghFetch(url);
  return data.total_count;
}

async function getStars() {
  let page = 1, stars = 0;
  while (true) {
    const repos = await ghFetch(
      `https://api.github.com/users/${USERNAME}/repos?per_page=100&page=${page}`
    );
    if (!repos.length) break;
    stars += repos.reduce((sum, r) => sum + r.stargazers_count, 0);
    if (repos.length < 100) break;
    page++;
  }
  return stars;
}

(async () => {
  try {
    const [repos, commits, stars] = await Promise.all([
      getRepoCount(),
      getTotalCommits(),
      getStars(),
    ]);

    const stats = { repos, commits, stars, updatedAt: new Date().toISOString() };
    fs.writeFileSync('scripts/stats.json', JSON.stringify(stats, null, 2));
    console.log('Stats fetched:', stats);
  } catch (err) {
    console.error('Failed to fetch stats:', err.message);
    // Write fallback so downstream scripts don't crash
    fs.writeFileSync('scripts/stats.json', JSON.stringify(
      { repos: 27, commits: 0, stars: 0, updatedAt: new Date().toISOString() }
    ));
    process.exit(0); // don't fail the whole workflow
  }
})();
