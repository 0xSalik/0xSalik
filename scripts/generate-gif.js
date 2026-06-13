/**
 * generate-gif.js
 *
 * Renders scripts/terminal.html in headless Chromium and captures the
 * animation as PNG frames at 2x DPR, then assembles assets/terminal.gif
 * via a two-pass palette-based ffmpeg pipeline (lanczos + sierra2_4a
 * dither) and finally optimises with gifsicle.
 *
 * Frame timing uses CDP's Emulation.setVirtualTimePolicy so the browser
 * clock is paused and advanced deterministically by FRAME_DELAY_MS
 * between each screenshot. This makes captures completely independent of
 * how long page.screenshot() actually takes — no more "everything done in
 * the first 0.5s of the gif" problem.
 *
 * The script also wipes the previous output GIF, frames dir, and resolved
 * HTML before each run, so stale artefacts from a previous run can never
 * leak into the current output.
 */

import puppeteer        from 'puppeteer';
import fs               from 'fs';
import path             from 'path';
import { execSync }     from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

const stats = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'stats.json'), 'utf8')
);

let html = fs.readFileSync(path.join(ROOT, 'scripts', 'terminal.html'), 'utf8');
html = html.replace('__REPOS__',   String(stats.repos));
html = html.replace('__COMMITS__', String(stats.commits));
html = html.replace('__STARS__',   String(stats.stars));

const tmpHtml   = path.join(__dirname, '_terminal_resolved.html');
const framesDir = path.join(__dirname, '_frames');
const assetsDir = path.join(ROOT, 'assets');
const gifOut    = path.join(assetsDir, 'terminal.gif');

fs.writeFileSync(tmpHtml, html);
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
fs.mkdirSync(assetsDir, { recursive: true });
fs.rmSync(gifOut, { force: true });

const LOGICAL_WIDTH    = 1100;
const DPR              = 2;
const FPS              = 20;
const ANIM_MS          = 6500;
const HOLD_MS          = 1800;
const TOTAL_MS         = ANIM_MS + HOLD_MS;
const FRAME_DELAY_MS   = 1000 / FPS;
const FRAME_COUNT      = Math.round(TOTAL_MS / FRAME_DELAY_MS);
const OUTPUT_WIDTH     = 1000;

function advanceVirtualTime(client, budgetMs) {
  return new Promise(async (resolve, reject) => {
    const onExpired = () => {
      client.off('Emulation.virtualTimeBudgetExpired', onExpired);
      resolve();
    };
    client.on('Emulation.virtualTimeBudgetExpired', onExpired);
    try {
      await client.send('Emulation.setVirtualTimePolicy', {
        policy: 'pauseIfNetworkFetchesPending',
        budget: budgetMs,
      });
    } catch (err) {
      client.off('Emulation.virtualTimeBudgetExpired', onExpired);
      reject(err);
    }
  });
}

(async () => {
  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--font-render-hinting=none',
      '--force-color-profile=srgb',
      '--hide-scrollbars',
    ],
    headless: 'new',
    defaultViewport: null,
  });

  const page = await browser.newPage();
  const client = await page.target().createCDPSession();

  await page.evaluateOnNewDocument(() => {
    window.__MANUAL_START__ = true;
  });

  await page.setViewport({
    width: LOGICAL_WIDTH,
    height: 800,
    deviceScaleFactor: DPR,
  });

  await page.goto(`file://${tmpHtml}`, { waitUntil: 'load' });

  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  });

  await client.send('Emulation.setVirtualTimePolicy', { policy: 'pause' });

  await page.evaluate(() => window.__startAnim());

  const contentHeight = await page.evaluate(() => {
    const f = document.querySelector('.frame');
    const r = f.getBoundingClientRect();
    return Math.ceil(r.bottom + 16);
  });

  await page.setViewport({
    width: LOGICAL_WIDTH,
    height: contentHeight,
    deviceScaleFactor: DPR,
  });

  console.log(
    `Capturing ${FRAME_COUNT} frames @ ${FPS}fps  ` +
    `(${LOGICAL_WIDTH}×${contentHeight} logical, ${DPR}x DPR, virtual time)`
  );

  for (let i = 0; i < FRAME_COUNT; i++) {
    const framePath = path.join(
      framesDir,
      `frame_${String(i).padStart(4, '0')}.png`
    );
    await page.screenshot({
      path: framePath,
      type: 'png',
      omitBackground: false,
      captureBeyondViewport: false,
    });
    if (i < FRAME_COUNT - 1) {
      await advanceVirtualTime(client, FRAME_DELAY_MS);
    }
  }

  await browser.close();
  fs.rmSync(tmpHtml, { force: true });

  console.log('Frames captured. Encoding GIF (two-pass ffmpeg palette)…');

  const paletteFile = path.join(framesDir, 'palette.png');
  const filterScale = `scale=${OUTPUT_WIDTH}:-1:flags=lanczos`;

  execSync(
    `ffmpeg -y -hide_banner -loglevel error ` +
      `-framerate ${FPS} -i "${framesDir}/frame_%04d.png" ` +
      `-vf "${filterScale},palettegen=stats_mode=full:max_colors=256" ` +
      `"${paletteFile}"`,
    { stdio: 'inherit' }
  );

  execSync(
    `ffmpeg -y -hide_banner -loglevel error ` +
      `-framerate ${FPS} -i "${framesDir}/frame_%04d.png" ` +
      `-i "${paletteFile}" ` +
      `-lavfi "${filterScale} [x]; ` +
      `[x][1:v] paletteuse=dither=sierra2_4a:diff_mode=rectangle:new=0" ` +
      `-loop 0 ` +
      `"${gifOut}"`,
    { stdio: 'inherit' }
  );

  fs.rmSync(framesDir, { recursive: true, force: true });

  const rawKB = (fs.statSync(gifOut).size / 1024).toFixed(1);
  console.log(`Encoded GIF: ${rawKB} KB`);

  try {
    execSync('gifsicle --version', { stdio: 'ignore' });
    const tmpOpt = `${gifOut}.opt`;
    execSync(
      `gifsicle -O3 --lossy=80 --no-warnings -o "${tmpOpt}" "${gifOut}"`,
      { stdio: 'inherit' }
    );
    fs.renameSync(tmpOpt, gifOut);
    const optKB = (fs.statSync(gifOut).size / 1024).toFixed(1);
    console.log(`Optimised with gifsicle: ${optKB} KB`);
  } catch {
    console.warn('gifsicle not available — skipping size optimisation.');
  }

  console.log(`GIF written: ${gifOut}`);
})().catch((err) => {
  console.error('generate-gif failed:', err);
  process.exit(1);
});
