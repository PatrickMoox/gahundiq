#!/usr/bin/env bash
# ============================================================================
# One-command Google Cloud deploy: Cloud Build → Artifact Registry → Cloud Run.
#
# Usage:
#   GCP_PROJECT=my-project bash scripts/gcp-deploy.sh
#   GCP_PROJECT=my-project GCP_REGION=europe-west1 bash scripts/gcp-deploy.sh
#
# Reads NEXT_PUBLIC_* Firebase config from .env.local (never committed) and
# bakes it into the client bundle at build time — see Dockerfile + cloudbuild.yaml.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."   # nextjs_space/

PROJECT="${GCP_PROJECT:?Set GCP_PROJECT to your Google Cloud project ID (the same project as Firebase).}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${GCP_SERVICE:-gahundiq}"
REPO="$SERVICE"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/app"

# ── 1. Load the Firebase web config from the uncommitted .env.local ─────────
if [ ! -f .env.local ]; then
  echo "✗ .env.local not found — copy .env.example and fill in the Firebase config first." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env.local
set +a
: "${NEXT_PUBLIC_FIREBASE_API_KEY:?NEXT_PUBLIC_FIREBASE_API_KEY missing in .env.local}"
: "${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:?NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN missing in .env.local}"
: "${NEXT_PUBLIC_FIREBASE_PROJECT_ID:?NEXT_PUBLIC_FIREBASE_PROJECT_ID missing in .env.local}"
: "${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:?NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET missing in .env.local}"
: "${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:?NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID missing in .env.local}"
: "${NEXT_PUBLIC_FIREBASE_APP_ID:?NEXT_PUBLIC_FIREBASE_APP_ID missing in .env.local}"
DB_URL="${NEXT_PUBLIC_FIREBASE_DATABASE_URL:-}"
MEASUREMENT_ID="${NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:-}"

# Sanity: the config must belong to the project being deployed to.
if [ "$NEXT_PUBLIC_FIREBASE_PROJECT_ID" != "$PROJECT" ]; then
  echo "⚠ NEXT_PUBLIC_FIREBASE_PROJECT_ID ($NEXT_PUBLIC_FIREBASE_PROJECT_ID) ≠ GCP_PROJECT ($PROJECT)." >&2
  echo "  Gahundiq reads Firestore from the config's project — deploying to a different one shows empty data." >&2
  echo "  Set GCP_PROJECT=$NEXT_PUBLIC_FIREBASE_PROJECT_ID (or fix .env.local) and retry." >&2
  exit 1
fi

# ── 2. One-time Google Cloud setup (idempotent) ─────────────────────────────
echo "▸ Enabling APIs (run, cloudbuild, artifactregistry)…"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$PROJECT" --quiet

echo "▸ Ensuring Artifact Registry repo '$REPO' in $REGION…"
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker --location "$REGION" --project "$PROJECT" --quiet 2>/dev/null || \
  echo "  (already exists)"

echo "▸ Granting Cloud Build write access to the registry (one-time)…"
CB_SA="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')@cloudbuild.gserviceaccount.com"
gcloud artifacts repositories add-iam-policy-binding "$REPO" \
  --location "$REGION" --project "$PROJECT" \
  --member "serviceAccount:${CB_SA}" --role "roles/artifactregistry.writer" --quiet >/dev/null 2>&1 || \
  echo "  (already granted)"

# ── 3. Build & push via Cloud Build (NEXT_PUBLIC_* baked in as build args) ──
TAG="$(date +%Y%m%d-%H%M%S)"
echo "▸ Building image $IMAGE:$TAG via Cloud Build…"
gcloud builds submit \
  --config cloudbuild.yaml \
  --project "$PROJECT" \
  --substitutions "_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY},_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN},_DB_URL=${DB_URL},_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID},_STORAGE_BUCKET=${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET},_SENDER_ID=${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID},_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID},_MEASUREMENT_ID=${MEASUREMENT_ID},_REGION=${REGION},_TAG=${TAG}" \
  .

# ── 4. Deploy to Cloud Run (public app — Firebase Auth secures the data) ────
echo "▸ Deploying Cloud Run service '$SERVICE'…"
gcloud run deploy "$SERVICE" \
  --image "$IMAGE:$TAG" \
  --region "$REGION" \
  --project "$PROJECT" \
  --allow-unauthenticated \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" --format='value(status.url)')"
echo ""
echo "✓ Deployed: $URL"
echo ""
echo "NEXT — two follow-ups:"
echo "  1. Add this domain to Firebase Auth → Settings → Authorized domains:"
echo "     $(echo "$URL" | sed 's|https://||')"
echo "     (without it, Google sign-in rejects the domain)"
echo "  2. Ship the security rules (first deploy, and after every rules change):"
echo "     npx firebase-tools@latest deploy --only firestore:rules,storage --project \"$PROJECT\""