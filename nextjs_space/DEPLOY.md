# Deploying Gahundiq

The app deploys **from GitHub to Firebase Hosting** — every push to `main`
builds the Next.js app and ships it (plus Firestore + Storage rules) to
Firebase. The code lives on GitHub; Firebase serves it.

## Why not GitHub Pages?

GitHub Pages can only serve static files, and this app cannot be exported
statically today:

1. **Runtime dynamic routes** — `/events/[eventId]`, `/collab/accept/[token]`,
   `/gift/[eventId]`, `/invite/[eventId]/[token]`, `/vendor-pass/[token]` are
   created by users at runtime. Next.js static export **fails the build** on
   dynamic routes without `generateStaticParams()`, and a static host could
   never serve those URLs anyway (Next.js docs list "Dynamic Routes without
   generateStaticParams()" as unsupported with `output: 'export'`).
2. **Project-site sub-path** — `user.github.io/gahundiq/` would need
   `basePath`/`assetPrefix`, otherwise every `/_next/*` asset 404s (the
   "file can't be found" you saw).
3. **Env vars** — `.env.local` is not committed, so a CI build has no
   Firebase config unless it's provided as secrets.

Firebase Hosting solves all three: it runs the app as a real Next.js backend
(frameworks-aware hosting), serves dynamic URLs, and deploys the security
rules from the same `firebase.json`.

## One-time setup

1. **Upgrade the Firebase project to Blaze** (pay-as-you-go). Framework-aware
   Next.js hosting runs on Cloud Run, which requires a billing account even
   though a small hobby app typically stays within the free allowances.
   `minInstances: 0` in `firebase.json` keeps idle cost at zero.
2. **Create a service-account key**: Firebase Console → ⚙️ Project settings →
   Service accounts → *Generate new private key* (JSON). This key has project
   admin rights — never commit it.
3. **Add GitHub secrets** (Repo → Settings → Secrets and variables → Actions):

   | Secret | Value |
   |---|---|
   | `FIREBASE_SERVICE_ACCOUNT` | Full contents of the service-account JSON |
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | From Firebase web-app config |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | e.g. `my-app.firebaseapp.com` |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | e.g. `my-app` |
   | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | e.g. `my-app.appspot.com` |
   | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | From config |
   | `NEXT_PUBLIC_FIREBASE_APP_ID` | From config |
   | `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Optional (Analytics) |
   | `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | Optional (unused) |

   The config values come from Firebase Console → ⚙️ Project settings →
   General → *Your apps* → SDK setup and configuration. They are already in
   your local `.env.local` — copy them across.

4. **Push to `main`** (or use *Run workflow*). The workflow:
   installs → typechecks → builds → deploys hosting + Firestore rules +
   Storage rules, then deletes the key file from the runner.

## What you get

- **URL**: `https://<project-id>.web.app` (also `<project-id>.firebaseapp.com`)
- **Deploy on every push** to `main`; manual runs via *Run workflow*
- **Rules deploy with every release** — collaboration + session + gift rules
  stay in sync with the app
- **Custom domain**: Hosting → Add custom domain (free, auto-SSL)

## Deploying locally

```bash
cd nextjs_space
npx firebase-tools@latest deploy --only hosting,firestore,storage --project <project-id>
```

(First time: `npx firebase-tools@latest login`, and the project needs Blaze.)

## If you later want pure static hosting

`next.config.js` already supports `NEXT_OUTPUT_MODE=export`, but that path
requires converting the five runtime-dynamic pages to client-param routes
(plus `basePath` for GitHub Pages) — a real refactor, only worth it if you
specifically need a fully static target. Not recommended now.
