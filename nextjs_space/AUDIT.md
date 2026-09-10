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
