# ── deps ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
# Telemetry off: keeps build output clean and avoids outbound calls in CI.
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

# ── build ───────────────────────────────────────────────────────────────────
# NEXT_PUBLIC_* values are baked into the client bundle at BUILD time, so they
# arrive as build args (see cloudbuild.yaml — sourced from .env.local by
# scripts/gcp-deploy.sh; never committed).
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_DATABASE_URL
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
# Public site URL: baked into the client bundle so metadata (OG/canonical URLs),
# robots.txt and sitemap.xml point at the real host instead of the localhost
# fallback in app/layout.tsx.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_DATABASE_URL=$NEXT_PUBLIC_FIREBASE_DATABASE_URL
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
# Standalone output → a small self-contained server for the runner image.
ENV NEXT_OUTPUT_MODE=standalone
RUN npm run build

# ── run ─────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run injects PORT (8080 by default) and requires binding 0.0.0.0.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
# node:20-alpine already ships an unprivileged `node` user (uid 1000). Dropping
# root costs nothing (the app listens on 8080, not a privileged port) and limits
# the blast radius if the server is ever compromised.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# The standalone server writes its runtime cache here; create it up front so the
# unprivileged user owns it (otherwise a first write as `node` fails).
RUN mkdir -p .next/cache && chown -R node:node .next
USER node
EXPOSE 8080
CMD ["node", "server.js"]