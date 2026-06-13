/**
 * inject-stats.js
 * Replaces <!-- STATS:* --> marker comments in README.md
 * with live values from stats.json so the plain-text README
 * also shows current numbers.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

const stats  = JSON.parse(fs.readFileSync(path.join(__dirname, 'stats.json'), 'utf8'));
let readme   = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

// Replace placeholder tokens like <!-- STAT:repos --> 27 <!-- /STAT:repos -->
function replaceBlock(content, key, value) {
  const re = new RegExp(
    `(<!-- STAT:${key} -->)[\\s\\S]*?(<!-- /STAT:${key} -->)`,
    'g'
  );
  return content.replace(re, `$1 ${value} $2`);
}

readme = replaceBlock(readme, 'repos',   stats.repos);
readme = replaceBlock(readme, 'commits', stats.commits > 0 ? `${stats.commits}+` : '—');
readme = replaceBlock(readme, 'stars',   stats.stars);
readme = replaceBlock(readme, 'updated', new Date(stats.updatedAt).toLocaleDateString('en-US', {
  month: 'short', day: 'numeric', year: 'numeric'
}));

fs.writeFileSync(path.join(ROOT, 'README.md'), readme);
console.log('README.md stats updated.');
