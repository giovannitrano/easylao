# Easy LAO — Trademark Lookup

A tool to retrieve trademark information from the Lao PDR IP Office
(online.dip.gov.la), deployable on Netlify.

## How it works

The site uses a **Netlify serverless function** running a headless Chromium
browser (Puppeteer) to load the Lao IP Office page server-side. This bypasses
the CORS restrictions and IP allowlist that block direct browser requests.
Extracted text is then parsed with the Claude API for reliable field extraction.

## Deploy to Netlify

### 1. Push to GitHub (or connect a folder)

Option A — via GitHub:
```
git init
git add .
git commit -m "initial"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USER/easy-lao.git
git push -u origin main
```
Then go to app.netlify.com → "Add new site" → "Import an existing project" → pick your repo.

Option B — drag and drop:
Zip this entire folder and drag it to app.netlify.com/drop.

### 2. Set environment variable

In Netlify: Site configuration → Environment variables → Add variable:
- Key:   `ANTHROPIC_API_KEY`
- Value: your Anthropic API key (from console.anthropic.com)

### 3. Deploy

Netlify will run `npm install` automatically (see netlify.toml) and deploy.
The function timeout is set to 30 seconds to allow Chromium to load.

## Local development

```bash
npm install
npm install -g netlify-cli
netlify dev
```

Then open http://localhost:8888

## Notes

- The `@sparticuz/chromium` package (~50MB) is a pre-built Chromium binary
  optimised for AWS Lambda / Netlify Functions.
- On first cold start, the function may take 5–10 seconds.
- The Anthropic API key is only used when DOM extraction doesn't yield enough
  data (it is called client-side from the browser, so it's visible in the
  network tab — for a production tool, proxy the Claude API call through a
  second Netlify function to keep the key server-side).
