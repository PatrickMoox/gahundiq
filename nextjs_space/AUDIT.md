# Full Application Audit — Gahundiq (nextjs_space)

**Date:** 2026-09-19 · **Commit:** `69ea33e` (main) + local WIP · **Auditor pass:** full source review

## Scope reviewed

- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) · Firebase (Auth, Firestore, Storage client SDK) · Tailwind · Radix UI · Recharts · Framer Motion
- **Surface:** every route (`app/**`), every component, all of `lib/`, `types/`, `scripts/`, deployment config (Dockerfile, cloudbuild.yaml, firebase.json), and both security-rules files (`firestore.rules`, `storage.rules`)
- **Automated checks:** `tsc --noEmit` ✅ · `eslint` ✅ · `npm audit` (prod deps) ✅ **0 vulnerabilities**

## Executive summary

The application is well-engineered for a backend-less (client + Firebase) architecture: deny-by-default security rules with an admin catch-all, capability-token design for public links (invite / vendor pass / gift page / collab), a thoughtful session-governance system, CSV-injection-safe exports, no XSS sinks, no committed secrets, and strict TypeScript with zero lint errors.

**However, 4 critical issues were found and fixed in this pass** — one of which completely bypassed the paywall, and one which silently broke the vendor-pass feature. All fixes are minimal and additive on top of the current WIP.

---

## 🔴 FIXED — critical issues (this pass)

### 1. Paywall bypass: any user could self-upgrade to Premium (firestore.rules)
- **Before:** the `events` **create** rule ran `validEventPlan()`, which allowed `tier: 'premium'` **unconditionally**. Any user could create a premium event (via a patched client or the console) and unlock seating, budget, gifts and the coordinator for free.
- **Fix:** added `isSubscribed()` — the rules now verify the admin-managed `subscriptions/{uid}` doc directly (tier `premium`, status not `canceled`/`past_due`, `currentPeriodEnd` null/open-ended or a future timestamp). Mirrors `lib/plan-entitlements.isSubscriptionActive()`. Premium at **create** now requires a real subscription; the host **update** path never allowed tier changes (kept) and only re-checks the free-tier guest cap (`validEventPlanForUpdate`) so premium events stay editable if a subscription later lapses (downgrade remains an admin action).

### 2. Vendor access passes were broken — permission-denied on every creation (vendors-tab.tsx)
- **Before:** `generatePass()` wrote `publicVendorPasses/{token}` **without the `token` field**, but the rules require `request.resource.data.token == token` → every write failed with *permission-denied*.
- **Fix:** the doc now includes `token`.

### 3. Public gift pages were spoofable — anyone could impersonate any event (firestore.rules)
- **Before:** `publicGiftPages/{eventId}` create/update only required `eventId == docId` and `hostId == auth.uid`. Any signed-in user could publish an **arbitrary title/venue/currency under someone else's event id** — the public `/gift/{eventId}` page would then show attacker-chosen content (impersonation / fake donation page).
- **Fix:** create/update now also require `isEventHost(eventId)` (ownership verified against `events/{eventId}`) plus a bounded `title`.

### 4. Storage rules trusted client-declared `hostId` metadata (storage.rules)
- **Before:** any signed-in user could upload files into **another event's** `invitations/{eventId}/` namespace (or the reserved `covers/`) by claiming `hostId = own uid` in metadata — namespace squatting / free file hosting.
- **Fix:** create now requires a **cross-service** Firestore lookup: `firestore.get(...events/$(eventId)).data.hostId == request.auth.uid`. Update/delete still keyed on the object's own metadata.
- ⚠️ **Deploy note:** cross-service rules are GA for Firebase Storage. Deploy with `firebase deploy --only storage` and confirm (an upload smoke test is recommended).

## 🟠 FIXED — functional bugs (this pass)

### 5. Dashboard “Current Plan” never loaded the subscription (dashboard-client.tsx)
- `useSubscription()` was called **without `user?.uid`**, so the subscription never loaded and the plan card fell back to event tier. Fixed: `useSubscription(user?.uid)`.

### 6. Broadcast history was erased on every new broadcast (invitation-broadcast-modal.tsx)
- `invitationBroadcasts` was **replaced** with a single-element array each time. Fixed: appends via `arrayUnion`, preserving history.

### 7. Zero/negative gift pledges produced a misleading error (cash-gift-modal.tsx)
- Rules require `amount > 0`; the modal allowed `0`/invalid input and the failure surfaced as a misleading “paid ceremonies” toast. Fixed: validated up-front with a clear message (also added the missing `toast` import).

---

## 🟡 Remaining findings — recommended (not auto-fixed)

### Metering / monetization gaps (architectural — need backend)
1. **Invite quota is UI-only.** The rules comment says invites are “metered by the plan's invite quota” but the `invites` create rule doesn't enforce it (rules can't count subcollection docs). Free users can generate unlimited invite tokens.
2. **Free guest limit is UI-only** for the `guests` subcollection (the `events.guestCount` field *is* capped, but actual guest docs aren't counted in rules).
3. **Free event-count limit (1 ceremony) is UI-only** — `events` create doesn't check how many events the user has (and `new-event-client` counts *all* events, not “active” ones, when checking).
   → All three need a Cloud Function (or a counter-field + stricter rules) once payments go live; the subscription/paywall fix in #1 already blocks the big bypass.

### Hardening (nice-to-have)
4. **Client-clock timestamps:** `useCollection.addItem/updateItem`, event/gift-page creation use `new Date()` instead of `serverTimestamp()`. Rules don't type-check most of them; a device with a skewed clock distorts sorts. Migrate writes to `serverTimestamp()` + validate `createdAt is timestamp` in rules.
5. **Gift spam bounds:** now bounded (name ≤100, message ≤1000, amount ≤10M, known `giftType`), but there is no rate-limiting — guests can spam pledges on a paid event's gift page. Needs a backend or App Check.
6. **Reviews:** admin-only writes, but no length bounds on `author`/`quote`.
7. **`reviews` read is unbounded** on landing/auth (`limit(200)` fetched per visit) — consider a single aggregate doc.
8. **Session governance is client-enforced only** (documented in `session-policy.ts`). Revocation of *other* devices lands within Firebase's token-refresh window (~1h). Acceptable and documented; a token-claims refresh via Cloud Function would make it instant.
9. **Dockerfile runs as root** — add a non-root `USER node` in the runner stage; consider `NEXT_TELEMETRY_DISABLED=1` in builds.
10. **Vendor passes expose vendor contact info to any token holder** (by design, 32+ char capability token). Note: event *collaborators* can also generate passes (rules use `canManageEvent`) — if passes should be host-only, narrow the rule.

### Quality / UX / SEO
11. **SEO:** `metadataBase` falls back to `localhost:3000` in prod unless `NEXT_PUBLIC_SITE_URL` is set; no `robots.txt`/`sitemap.xml` (add `app/robots.ts`, `app/sitemap.ts`); gift/invite/pass pages could use per-page `generateMetadata`.
12. **A11y:** icon-only buttons without `aria-label` (budget/guest/vendor delete, vendor edit/pass); some dialogs use `<Label>` without `htmlFor`.
13. **UX:** `event-hub-client` does `window.location.reload()` after invitation upload (heavy; state could update in place).
14. **Pagination:** dashboard loads max 50 events; reports max 20 — add pagination or orderBy-paging when users exceed that.
15. **`publicGiftPages.isActive`** is written but never checked on the gift page — hosts currently can't disable a gift page.
16. **Free event-count check** counts all events ever (past events included) rather than “active” ones.

### Dependency / build status
- `npm audit` (production deps): **0 vulnerabilities**. Dev deps unreviewed for advisories (`firebase-admin` as a *dev* dependency for the admin script is fine).
- Next 16 / React 19 / framer-motion 13 are current; keep an eye on major bumps.
- **.env hygiene:** ✅ `.env.local` not committed, only `NEXT_PUBLIC_*` values, real secrets absent; `serviceAccountKey.json` gitignored; Stripe/Twilio/Gemini keys are placeholders.

---

## Verification after fixes

- `npx tsc --noEmit` ✅ EXIT 0
- `npx eslint -c eslint.ssr.config.mjs app components lib` ✅ EXIT 0
- **Systematic write-path sweep** (all 50+ Firestore write calls grepped and mapped to rules): every legit writer still passes —
  - `events` create (wizard): free unchanged; premium now correctly requires `isSubscribed()` · admin tier writes use the `isAdmin()` branch (checked first)
  - `events` update (invitation upload/broadcast, collaborator manage, accept/join): tier never present in payloads → `validEventPlanForUpdate()` is behavior-identical to before for free tiers, and premium events stay editable
  - `publicGiftPages` create (wizard, right after event create): `isEventHost()` passes because the same user just created the event
  - `publicVendorPasses` create/update (vendors-tab): now includes `token` (36-char uuid ≥ 32)
  - `gifts` create (gift page modal; `useCashGifts.addGift`): both writers validated — modal blocks ≤0 up-front, and `addGift` (currently uncalled) now throws a clear error instead of writing `amount: 0` that the rules would reject
  - `invites` guest RSVP update: sends `respondedAt` as a JS `Date` → timestamp on the wire ✓
  - Storage upload (invitation-upload-modal): passes `hostId = event.hostId`; only the event host could satisfy it before *and* after (collaborators were already denied by the host-only event update) — no regression
  - Unchanged paths (sessions, users, subscriptions-admin, admin registry, collabInvites/claims, reviews) are untouched by the edits
- Spoofing/bypass paths are now denied; Firebase CLI is not installed locally, so rules compile-validation happens at deploy time (deploy is atomic — an invalid rules file is rejected without affecting the live rules).

## Suggested deploy steps for the rule changes

```bash
firebase deploy --only firestore:rules,storage --project invitematic
# then smoke-test: create free event (should work), create premium event as
# a non-subscriber via console (should be denied), vendor pass generation,
# RSVP from an invite link, gift pledge on a premium event, invitation upload.
```

---

# Pass 2 — Responsiveness · Google Cloud readiness · follow-up audit

**Date:** 2026-09-30 · **Commit:** `69ea33e` (main) + local WIP · **Auditor pass:** full source review, mobile-first

## 1. Responsiveness (phone-first)

Guests open invite/gift pages almost exclusively on phones, so every route and
component was reviewed at a ~360px viewport. Nine real defects were found and fixed.

| # | Defect | Where | Fix |
|---|--------|-------|-----|
| R1 | `TabsList` had a **fixed `h-10`** while the event hub passes `flex-wrap` for its 7 tabs → on a phone the wrapped rows rendered **outside** the pill background and overlapped the content below | `components/ui/tabs.tsx` + `event-hub-client` | `h-10` → `min-h-[2.5rem]` (grows when wrapping, identical for single-row lists) — **not** `min-h-10`, which Tailwind v3 does not generate (see note below) |
| R2 | `DialogContent` is centered with `fixed` and had **no max-height** → a tall form was taller than the viewport with no scroll, so its buttons were unreachable | `components/ui/dialog.tsx` | base class now `max-h-[90dvh] overflow-y-auto` |
| R3 | `tailwind-merge` treats `overflow-hidden` as overriding `overflow-y-auto`, so the two `p-0 overflow-hidden` modals **cancelled R2** — a guest on a small phone could not reach “Record Pledge” | `cash-gift-modal`, `ceremony-addon-modal` | `p-0 overflow-y-auto` (+ explicit `max-h-[90dvh]`) |
| R4 | Floor-plan tables spawned at `x: 100 + Math.random()*400` inside an `overflow-hidden` canvas that is only ~340px wide on a phone → new tables appeared **off-canvas and could not be dragged back**; dragging could also push a table out of view; and with no `touch-action`, a finger drag **scrolled the page** instead of moving the table | `seating-tab.tsx` | shared `tableSize()` helper + `canvasRef`/`canvasBounds()`; placement **and** drag are clamped to the visible canvas (`clampToCanvas`); `touch-none` on the draggable wrapper; `onPointerCancel` handled |
| R5 | Task move/delete buttons were `opacity-0 group-hover:opacity-100` → on touch there is no hover, so they were invisible **and** undiscoverable; tap targets were ~16px | `tasks-tab.tsx` | touch-safe `opacity-100 sm:opacity-0 sm:group-hover:opacity-100` (matching the timeline tab), `p-1.5` targets, `aria-label`s |

| R6 | Seven-column money table with only `w-full` → columns squashed into unreadable slivers instead of scrolling | `budget-tab.tsx` | `min-w-[640px]` inside the existing `overflow-x-auto` wrapper |
| R7 | Two native time inputs in a fixed `grid-cols-2` inside a `p-6` dialog → ~110px each on a 320px screen | `timeline-tab.tsx` | `grid-cols-1 sm:grid-cols-2` |
| R8 | Fixed `text-4xl` page titles (no breakpoint) overflowed narrow phones: invite, pricing, privacy, terms (+ `text-4xl md:text-5xl` on about/help) | 6 pages | `text-3xl` base with `sm:text-4xl` / `md:text-5xl`, matching the landing/dashboard/gift pages |
| R9 | Icon-only controls with no accessible name (budget delete, guest remove, vendor edit/pass/delete, timeline edit/delete, seating remove-table, task actions) | 6 files | `aria-label` naming the target object |

**Verified already correct (no change needed):** every chart uses
`ResponsiveContainer width="100%"`; the navbar has a working mobile menu and a
consistent `md:` split; no `h-screen`/`100vh` misuse (all `min-h-screen`); the
public invite/gift/vendor-pass pages already wrap their metadata rows and use the
right heading scale; `reports-client`'s `/events/{scope}` link is correctly guarded
by `scope !== 'all'`, so `/events/all` is unreachable.

## 2. Google Cloud readiness

| # | Finding | Fix |
|---|---------|-----|
| G1 | **No health endpoint.** Cloud Run's only default probe is TCP, so a revision can serve traffic while the server is still warming up | `app/api/health/route.ts` (`no-store`, echoes `K_REVISION`); DEPLOY-GCP.md documents the `--startup-probe` usage |
| G2 | `metadataBase` fell back to **`http://localhost:3000` in production** (wrong OG/canonical URLs) | `NEXT_PUBLIC_SITE_URL` is now threaded deploy-script → `--substitutions _SITE_URL` → `cloudbuild.yaml` build arg → `Dockerfile` ARG; the script warns loudly when it is unset |
| G3 | No `robots.txt`/`sitemap.xml` — an SEO gap *and* a privacy gap, since capability links (`/invite/…`, `/gift/…`, `/vendor-pass/…`) must never be indexed | `app/robots.ts` (disallows capability + auth + `/api`) and `app/sitemap.ts` (public routes only) |
| G4 | Container ran as **root** | runner stage is now `USER node` (uid 1000) with `--chown=node:node` copies and a pre-created `.next/cache` |
| G5 | No HTTP security headers | `next.config.js` `headers()`: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS. COOP/CSP deliberately **not** set (Firebase Auth popups need the opener reference) and documented as such |
| G6 | Deploy relied on Cloud Run defaults (512 Mi, unbounded instances) | explicit `--memory 1Gi --cpu 1 --cpu-boost --concurrency 80 --min-instances 0 --max-instances 10 --timeout 60 --port 8080` |
| G7 | Build hygiene | `NEXT_TELEMETRY_DISABLED=1` in every stage; `logging: CLOUD_LOGGING_ONLY` + `timeout: 1800s` in `cloudbuild.yaml` |
| G8 | No preflight | the deploy script exits with a clear message when `gcloud` is missing |
| G9 | `browserslist` targeted `ie >= 11` although Next 16 has no IE support (needless legacy transpilation) | modern targets: chrome/firefox/edge ≥ 100, safari ≥ 15.4 |

**Verified already correct:** `.dockerignore`/`.gcloudignore` exclude `.env.local`,
`.git`, `node_modules` and `.next` (no secrets in image layers); `output: standalone`
matches the Dockerfile copy paths; `PORT`/`HOSTNAME` match Cloud Run's expectations;
only `NEXT_PUBLIC_*` values are baked into the bundle; `firestore.rules` /
`storage.rules` remain deny-by-default with the Pass-1 fixes intact.

## 3. Follow-ups fixed in this pass

- **`publicGiftPages.isActive` was written but never read** (Pass 1, item 15): a gift
  page the host disabled still accepted pledges. `/gift/{eventId}` now treats
  `isActive === false` as unavailable — using the *same* message as a missing page, so
  it cannot be used to probe whether an event exists.
- Removed a redundant `Cache-Control` override for `/_next/static` that made
  `next build` warn that development behaviour can break (Next already serves those
  content-hashed assets as immutable).
- **Documentation drift:** `STYLE_GUIDE.md` documented `Card`, `Textarea` and
  `Checkbox` primitives that do not exist, and its layout table omitted
  `AuthProvider`, `FirebaseAnalytics` and `ConnectivityStatus`. Both corrected, plus a
  new “Responsiveness — mobile-first conventions” section recording the rules above.

## 4. Validation

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ EXIT 0 |
| `npx eslint -c eslint.ssr.config.mjs app components lib` | ✅ EXIT 0 |
| `bash -n scripts/gcp-deploy.sh` | ✅ syntax OK |
| `next build` (production, Turbopack) | ✅ **Compiled successfully**, 21 routes incl. `/api/health` (ƒ dynamic), `/robots.txt` and `/sitemap.xml` (○ static); zero errors, **zero warnings** (2.3 min cold, 114 s warm) |
| Generated CSS (proof the responsive fixes are not no-ops) | ✅ the emitted stylesheet contains `min-height:2.5rem` (R1), `max-height:90dvh` (R2/R3), `touch-action:none` (R4) and `min-width:640px` (R6) |
| Runtime smoke test (`next start`, port 3000) | ✅ `/`, `/pricing`, `/gift/nope`, `/api/health`, `/robots.txt`, `/sitemap.xml` → **all 200** |
| `/api/health` body | ✅ `{"status":"ok","service":"gahundiq","revision":null,"timestamp":"…"}` |
| `/robots.txt` | ✅ `Allow: /` plus disallow for `/dashboard`, `/events/`, `/reports`, `/admin`, `/auth`, `/invite/`, `/gift/`, `/vendor-pass/`, `/collab/accept/`, `/api/` |
| `/sitemap.xml` | ✅ valid XML, public routes only |
| Security headers on `/` | ✅ `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` all present |
| Build/config sanity | ✅ `cloudbuild.yaml` carries the `_SITE_URL` build arg + substitutions default; `Dockerfile` has `ARG NEXT_PUBLIC_SITE_URL`, `USER node`, `NEXT_TELEMETRY_DISABLED=1`; `scripts/gcp-deploy.sh` passes `_SITE_URL` and prints the health check |

**Live evidence for G2/G3:** `NEXT_PUBLIC_SITE_URL` is currently **empty** in
`.env.local`, so the smoke-test sitemap correctly fell back to
`http://localhost:3000`. That is precisely the misconfiguration the new
deploy-script warning catches — set the variable before the production build.

## 5. Still open (deliberately not fixed — need a product/ops decision)

1. **Free-plan event counting** (Pass 1, item 16): the wizard counts *all* events ever
   created while the UI speaks of “active” ceremonies. Changing it changes what users
   are charged for → product decision.
2. **Pagination** (Pass 1, item 14): the dashboard caps at 50 events; reports slice
   guests to 50 rows.
3. **`event-hub-client` reloads the whole page** after an invitation upload (Pass 1,
   item 13) instead of updating state in place.
4. **Payments are not wired:** Stripe/Twilio/Gemini keys are placeholders and
   `PAYMENTS_ENABLED = false` correctly refuses to simulate a purchase.
5. **CSP** should be added report-only first, with real-browser testing of Firebase
   Auth popups, Analytics and Framer Motion's inline styles.
6. **Dev-environment risk:** the repo lives on the external `/Volumes/MOOX` volume,
   which Next logs as a slow filesystem. Turbopack's persistent cache crashed with an
   internal panic (`Restore of All for task … failed`) mid-session and took the dev
   server down; the workaround that restored a clean state was deleting `.next` and
   rebuilding. Moving the workspace to local disk — or pointing `NEXT_DIST_DIR` at a
   local path (already supported by `next.config.js`) — removes that failure class.




---

## Pass 3 — bug hunt + fixes (2026-10-04)

A follow-up review of the full surface (`app/**`, `components/**`, `lib/**`,
`types/**`, `firestore.rules`, `storage.rules`) focused on **functional
correctness** rather than the security / paywall work of Passes 1–2. Automated
checks remained green (`tsc --noEmit` ✅, `eslint` ✅, `next build` ✅). Five
genuine defects were found and fixed; three more are documented but left open
(product / product-copy decisions).

### 🔴 FIXED — high impact

#### P3-1. Seating chart was never persisted — every edit was lost on reload (`seating-tab.tsx`)
- **Before:** every seating mutation — add/remove table, assign/remove a guest,
  drag — called the **local** React `setChart` only. The Firestore writer
  `updateChart` returned by `useSeatingChart` was **dead code** (defined but
  never called anywhere in the repo), so the whole floor plan lived in component
  state and was silently discarded on reload — and never visible to a collaborator.
- **Fix:** added a `persistTables()` helper that (a) updates local state for
  immediate feedback and (b) writes `{ tables }` through `updateChart` (merge)
  with a toast on failure. Discrete actions call it directly; drags persist once
  on pointer-up (moves stay local for smoothness). `updateChart` is no longer
  dead code.

#### P3-2. `detectCurrency()` was a no-op — always returned USD (`lib/currency.ts`)
- **Before:** the wizard auto-detects a currency from `navigator.language`, but
  the code compared the **locale region** (ISO-3166 alpha-2, e.g. `RW`, `KE`,
  `FR`) against the list of **ISO-4217 currency codes** (`RWF`, `KES`, `EUR`).
  A region can never equal a currency code, so `isSupported(region)` was always
  false and the function returned **USD for every visitor** — the advertised
  “auto-detected from your region” never worked.
- **Fix:** added a `REGION_TO_CURRENCY` map plus `currencyForRegion()`.
  Verified at runtime: `en-RW → RWF`, `sw-KE → KES`, `fr-FR → EUR`,
  `en-GB → GBP`, unknown region → `USD`.

### 🟠 FIXED — correctness / consistency

#### P3-3. Dashboard “Current Plan” could show Premium when it wasn’t (`dashboard-client.tsx`)
- **Before:** `activePlan = subscription?.tier || (events.find(e => e.tier === 'premium') ? 'premium' : 'free')`.
  Two problems: (a) `subscription?.tier` reported Premium even for a
  `canceled`/`past_due` subscription, and (b) the fallback matched **any**
  premium event in the list — which since collaboration includes events the user
  only **co-plans** — so a free user helping with someone’s premium wedding saw
  “Premium Active · Everything unlocked”.
- **Fix:** use `isSubscriptionActive(subscription)` (the app-wide entitlement
  check) and restrict the owned-event fallback to events the user actually hosts
  (`e.hostId === user.uid`).

#### P3-4. Reports guest table ignored invite-link RSVPs (`reports-client.tsx`)
- **Before:** the RSVP **KPI** and the **CSV export** both used `effectiveRsvp()`
  (public invite-link responses win over the host-set `guest.rsvp`), but the
  guest **table** rendered the raw `g.rsvp`. A guest who accepted via their
  invite link was counted confirmed in the KPI yet displayed “pending” in the table.
- **Fix:** the table now uses `effectiveRsvp(g, invites)` for the avatar colour,
  badge styling and label — consistent with the KPI and the export.

#### P3-5. Broadcast “Copy share link” produced a 404 (`invitation-broadcast-modal.tsx`)
- **Before:** the share link was `${origin}/invite/${eventId}` and the recorded
  `reference` was `/invite/${eventId}`. There is **no** `/invite/[eventId]`
  route — guest invites are per-token (`/invite/[eventId]/[token]`) — so the
  copied link 404’d for every recipient.
- **Fix:** the share link is now the host’s real public invitation artifact
  (uploaded file URL or external link, passed in as `invitationUrl`); the copy
  button is disabled with a clear hint until one exists, and the recorded
  `reference` uses that URL (falling back to the in-app `/events/{id}` hub —
  never a dead public link).

### Validation (Pass 3)

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ EXIT 0 |
| `npx eslint -c eslint.ssr.config.mjs app components lib` | ✅ EXIT 0 |
| `detectCurrency()` runtime test | ✅ `en-RW→RWF`, `sw-KE→KES`, `fr-FR→EUR`, `en-GB→GBP`, `xx→USD` |
| `next build` (production, Turbopack) | ✅ **Compiled successfully**, 21 routes incl. `/api/health` (ƒ), `/robots.txt` & `/sitemap.xml` (○); zero errors |
| Post-fix `tsc` + `eslint` re-run | ✅ EXIT 0 (build’s regenerated `tsconfig.json`/`next-env.d.ts` reverted) |

### Still open (Pass 3 additions)

7. **`gifts-tab` “Total Received” includes `pending` pledges.** With payments
   unwired every gift is `pending`, so the headline figure overstates money
   actually received. Reports already separates received vs pledged; aligning the
   tab is a product decision.
8. **Gift-page error copy** (`gift-page-client`) reports gifts as “available on
   paid ceremonies” when a write fails — misleading (free events can receive
   pledges too). It should surface the real error.
9. **Collaborator re-opening an accepted invite** lands on the “Finish joining”
   (partial) panel even when they are already a member; the self-join write is
   then rejected by the rules. Reading membership before showing that panel
   would close the loop.

