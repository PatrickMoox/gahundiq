# Deploying Gahundiq to Google Cloud (Cloud Run)

Your usual flow: **Cloud Build → Artifact Registry → Cloud Run**, wrapped in
one script. The Firebase `NEXT_PUBLIC_*` config is baked into the client
bundle at build time from your local `.env.local` (never committed).

## Step 0 — Prerequisites

- `gcloud` CLI installed and signed in: `gcloud auth login`
- Your **Firebase project is a Google Cloud project** — use the SAME project
  ID (the app reads Firestore/Storage/Auth from it). Find it in
  `.env.local` → `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- Billing enabled on the project (Cloud Run + Cloud Build need it; hobby
  traffic typically stays inside the free tiers — the service scales to zero)

## Step 1 — Deploy (one command)

```bash
cd nextjs_space
GCP_PROJECT=<your-project-id> bash scripts/gcp-deploy.sh
# Optional overrides:
#   GCP_REGION=europe-west1 GCP_SERVICE=gahundiq
```

The script is idempotent and does, in order:

1. Loads `.env.local` and validates the Firebase config is present — and that
   it matches `GCP_PROJECT` (a mismatched pair deploys fine but shows empty
   data, so it fails loudly instead)
2. Enables the APIs: `run`, `cloudbuild`, `artifactregistry`
3. Creates the Artifact Registry repo `gahundiq` (once)
4. Grants the Cloud Build service account `artifactregistry.writer` (once)
5. Builds via **Cloud Build** (`cloudbuild.yaml`) with the `NEXT_PUBLIC_*`
   values as build args (`Dockerfile`), pushes to Artifact Registry
6. Deploys to **Cloud Run** (`--allow-unauthenticated` — the app is public;
   data security comes from Firestore rules + Firebase Auth)
7. Prints your URL and the two follow-ups below

## Step 2 — Add the domain to Firebase Auth (critical)

Firebase Auth only allows sign-in redirect from pre-registered domains:

> Firebase Console → **Authentication → Settings → Authorized domains →
> Add domain** → the `*.run.app` URL the script printed

Without this, Google sign-in fails from the Cloud Run URL. The `localhost`
entries already there cover local dev.

## Step 3 — Ship the security rules (first deploy + after every rules change)

```bash
cd nextjs_space
npx firebase-tools@latest deploy --only firestore:rules,storage --project <your-project-id>
```

First time: `npx firebase-tools@latest login` (browser sign-in). This ships
the collaboration, session-governance, and gift rules that the app depends on.

## Step 4 — Custom domain (optional)

- **Cloud Run**: `gcloud beta run domain-mappings create --service gahundiq --domain www.example.com --region us-central1` (or Console → Cloud Run → Manage custom domains) — SSL is automatic
- Remember to add the custom domain to **Firebase Auth authorized domains** too (Step 2)

## Day-2 commands

```bash
# Redeploy after changes (same one command)
GCP_PROJECT=<id> bash scripts/gcp-deploy.sh

# Watch logs
gcloud run services logs tail gahundiq --region us-central1

# Roll back to a previous image
gcloud run services update-traffic gahundiq --to-revisions=<revision>=100 --region us-central1
```

## Relationship to the other deploy paths in this repo

| Path | Command | Notes |
|---|---|---|
| **Google Cloud Run (this guide)** | `GCP_PROJECT=… bash scripts/gcp-deploy.sh` | Your usual flow; you own the service |
| Firebase Hosting (frameworks-aware) | push to `main` (`.github/workflows/deploy.yml`) or `npx firebase-tools deploy` | Also runs on Cloud Run, but managed by Firebase; needs Blaze |
| GitHub Pages | — | ❌ Not viable: static export fails on the app's runtime-dynamic routes (see `DEPLOY.md`) |

All three can coexist (different URLs). Pick **one** as the canonical URL you
share with users, and add it to Firebase Auth authorized domains.

## Cost notes

- Cloud Run: scales to zero (`minInstances: 0`); free tier covers ~2M
  requests/month
- Cloud Build: 120 build-minutes/day free
- Artifact Registry: 0.5 GB storage free
- The container is a small standalone Next.js server (~200 MB)
