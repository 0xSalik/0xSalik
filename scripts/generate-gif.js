/**
 * generate-gif.js
 * 1. Reads stats.json
 * 2. Injects live stats into terminal.html
 * 3. Uses Puppeteer to screenshot each animation frame
 * 4. Assembles frames into assets/terminal.gif via ffmpeg
 */

import puppeteer from 'puppeteer';
import fs        from 'fs';
import path      from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// Load live stats
const stats = JSON.parse(fs.readFileSync(path.join(__dirname, 'stats.json'), 'utf8'));

// Load the terminal HTML template
let html = fs.readFileSync(path.join(ROOT, 'scripts', 'terminal.html'), 'utf8');

// Inject stats as JS variables the template reads
html = html.replace('__REPOS__',   String(stats.repos));
html = html.replace('__COMMITS__', String(stats.commits));
html = html.replace('__STARS__',   String(stats.stars));

// Write a temp resolved file
const tmpHtml = path.join(__dirname, '_terminal_resolved.html');
fs.writeFileSync(tmpHtml, html);

// Output dir for frames
const framesDir = path.join(__dirname, '_frames');
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir);

// Ensure assets dir exists
fs.mkdirSync(path.join(ROOT, 'assets'), { recursive: true });

const WIDTH  = 900;
const HEIGHT = 620;

// How many frames and at what interval (ms) to capture
// Total animation is ~7s; capture at 12fps = ~84 frames
const FPS           = 12;
const DURATION_MS   = 7200;
const FRAME_COUNT   = Math.ceil((DURATION_MS / 1000) * FPS);
const FRAME_DELAY   = Math.floor(1000 / FPS);

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    headless: 'new',
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  await page.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle0' });

  console.log(`Capturing ${FRAME_COUNT} frames at ${FPS}fps...`);

  for (let i = 0; i < FRAME_COUNT; i++) {
    const framePath = path.join(framesDir, `frame_${String(i).padStart(4, '0')}.png`);
    await page.screenshot({ path: framePath, type: 'png' });
    await page.waitForTimeout(FRAME_DELAY);
  }

  await browser.close();
  fs.rmSync(tmpHtml, { force: true });

  console.log('Frames captured. Assembling GIF with ffmpeg...');

  // Build a high-quality palette-based GIF
  const paletteFile = path.join(framesDir, 'palette.png');
  const gifOut      = path.join(ROOT, 'assets', 'terminal.gif');

  execSync(
    `ffmpeg -y -framerate ${FPS} -i "${framesDir}/frame_%04d.png" \
     -vf "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,palettegen=stats_mode=full" \
     "${paletteFile}"`,
    { stdio: 'inherit' }
  );

  execSync(
    `ffmpeg -y -framerate ${FPS} -i "${framesDir}/frame_%04d.png" \
     -i "${paletteFile}" \
     -filter_complex "fps=${FPS},scale=${WIDTH}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5" \
     "${gifOut}"`,
    { stdio: 'inherit' }
  );

  // Clean up frames
  fs.rmSync(framesDir, { recursive: true, force: true });

  console.log(`GIF written to ${gifOut}`);
})();
