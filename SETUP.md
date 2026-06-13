# Setup Guide — 0xSalik Profile README

## Step 1: Create the special repo

GitHub profile READMEs live in a repo named exactly after your username:

```
github.com/0xSalik/0xSalik
```

If it doesn't exist yet, create it at https://github.com/new with the name `0xSalik`.
Check "Add a README file" and make it **Public**.

## Step 2: Push these files

```bash
# Clone your new profile repo
git clone https://github.com/0xSalik/0xSalik.git
cd 0xSalik

# Copy everything from this bundle in
cp -r /path/to/this/bundle/* .

# Commit and push
git add .
git commit -m "feat: terminal profile README with auto-updating stats"
git push origin main
```

## Step 3: Enable Actions write permissions

In your **0xSalik/0xSalik** repo settings:

1. Go to **Settings → Actions → General**
2. Under "Workflow permissions" → select **"Read and write permissions"**
3. Save

This lets the workflow commit the generated GIF and updated stats back.

## Step 4: First run

Go to **Actions → Update README Terminal GIF → Run workflow** (the "workflow_dispatch" trigger).

This does:
1. Fetches your live repo count, commit count, and stars via the GitHub API
2. Renders `scripts/terminal.html` in headless Chromium (Puppeteer)
3. Captures frames and assembles them into `assets/terminal.gif` via ffmpeg
4. Injects live stats into the stat table in `README.md`
5. Commits everything back

After the first run you'll see the GIF in your profile. After that it auto-runs every day at midnight UTC.

## Step 5: Customise

### Change the animation timing
Edit `scripts/generate-gif.js`:
```js
const DURATION_MS = 7200;  // total capture window in ms
const FPS         = 12;    // frames per second
```

### Change the terminal content
Edit `scripts/terminal.html` — it's self-contained HTML/CSS/JS.
The three tokens `__REPOS__`, `__COMMITS__`, `__STARS__` get replaced at build time.

### Change schedule
Edit `.github/workflows/update-readme.yml`:
```yaml
- cron: '0 0 * * *'   # daily midnight UTC
```
Any valid cron expression works (https://crontab.guru).

## File layout

```
0xSalik/
├── README.md                          ← your profile page
├── assets/
│   └── terminal.gif                   ← auto-generated, committed by CI
├── scripts/
│   ├── package.json
│   ├── terminal.html                  ← the animated terminal (source of truth)
│   ├── fetch-stats.js                 ← hits GitHub API, writes stats.json
│   ├── generate-gif.js                ← Puppeteer + ffmpeg → terminal.gif
│   └── inject-stats.js                ← patches README.md stat table
└── .github/
    └── workflows/
        └── update-readme.yml          ← orchestrates everything
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Workflow fails with 403 | Enable read+write permissions (Step 3) |
| GIF not showing in README | Check `assets/terminal.gif` was committed; path is case-sensitive |
| Puppeteer fails | The workflow installs Chromium deps — ensure `ubuntu-latest` runner |
| Stats show `—` | Commit count requires `GITHUB_TOKEN` with `repo` scope; Actions token is sufficient for public repos |
| Font not rendering in GIF | The HTML loads Google Fonts at capture time; ensure the runner has internet access (it does by default) |
