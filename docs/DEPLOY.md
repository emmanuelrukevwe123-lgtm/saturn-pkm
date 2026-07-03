# Deploying Saturn to Vercel (free Hobby plan)

Saturn is a pure static site — three files in `public/`, no build step — which
makes it a perfect fit for Vercel's free tier. `vercel.json` at the repo root
already tells Vercel to skip building and serve `public/`.

## What the free (Hobby) plan gives you

- Unlimited static deployments, global CDN, automatic HTTPS
- 100 GB bandwidth/month (far more than this app will use)
- A free `your-project.vercel.app` URL; custom domains supported
- Automatic redeploys on every git push (with the GitHub flow)
- Limits that don't matter here: serverless function caps, one concurrent build

**Note:** the Hobby plan is for personal, non-commercial use.

## Option A — GitHub + Vercel dashboard (recommended)

Best flow: every `git push` auto-deploys.

1. **Make the folder a git repo and push it to GitHub** (from WSL):
   ```bash
   cd ~/Learning\ Software
   git init -b main
   git add .
   git commit -m "Saturn PKM"
   gh repo create saturn-pkm --private --source=. --push
   # (or create the repo on github.com and: git remote add origin <url> && git push -u origin main)
   ```
2. **Sign in at [vercel.com](https://vercel.com)** with your GitHub account (free "Hobby" plan).
3. Click **Add New… → Project** and **Import** the `saturn-pkm` repository.
4. Configure:
   - **Framework Preset:** `Other`
   - Build settings are picked up from `vercel.json` automatically
     (no build command, output directory `public`). If you set them manually:
     Build Command *empty*, Output Directory `public`.
5. Click **Deploy**. In ~10 seconds you'll get `https://saturn-pkm-<something>.vercel.app`.

From then on, every push to `main` deploys automatically; pull requests get
preview URLs.

## Option B — Vercel CLI (no GitHub needed)

```bash
cd ~/Learning\ Software
npx vercel login          # sign in / create free account
npx vercel                # first deploy → answer the prompts, accept defaults
npx vercel --prod         # promote to the production URL
```

The CLI reads `vercel.json`, uploads the folder, and prints the live URL.

## After deploying

- Visit the URL and confirm: the ring renders, theme toggle works, creating a
  note persists after a refresh.
- If you enabled Google sign-in, add the deployed Vercel domain to your Firebase
  Authentication authorized domains before testing login.
- Optional: **Settings → Domains** in the Vercel dashboard to attach a custom
  domain (free plan supports this).

## Things to know

- **Notes do NOT travel with the deploy.** Data lives in each visitor's browser
  localStorage — your local notes won't appear on the live site, and every
  visitor gets their own private notebook. Nothing is shared or uploaded.
- Google Fonts are loaded from the CDN, so the deployed app needs internet to
  show Baloo 2 / Quicksand (system fallbacks apply offline).
- To take a deployment down: Vercel dashboard → Project → Settings → Delete Project.

## Troubleshooting

| Symptom | Fix |
|---|---|
| 404 after deploy | Output Directory isn't `public` — check `vercel.json` was committed, or set it in Project Settings → Build & Development |
| Vercel tries to run a build | Framework Preset should be `Other`; Build Command empty |
| Old version showing | Vercel deploys are immutable — hard-refresh (Ctrl+Shift+R), or check you promoted with `--prod` |
| Google sign-in says unauthorized domain | Add the current domain in Firebase Authentication settings |
