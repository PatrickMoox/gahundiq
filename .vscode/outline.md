# Gahundiq — Project Outline

> Ceremony Planning & Coordination Hub

---

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **UI Runtime:** React 19
- **Styling:** Tailwind CSS + CSS variables (design tokens)
- **Backend:** Firebase (Firestore, Auth, Storage) — optional, falls back to empty states
- **Charts:** Recharts
- **Animations:** Framer Motion
- **UI Primitives:** Radix UI
- **Notifications:** Sonner (toasts)
- **QR Codes:** qrcode.react
- **Confetti:** canvas-confetti
- **Theme:** next-themes (dark mode default, light mode toggle)

---

## Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page — aurora hero, glass mockups, marquee, bento features |
| `/auth` | Sign in / Sign up — split-screen brand panel + glass form |
| `/dashboard` | Overview — countdown, stat cards, event list with capacity bars |
| `/events/new` | 2-step event creation wizard |
| `/events/[eventId]` | Event hub — 7 tabs (Timeline, Vendors, Guests, Seating, Tasks, Budget, Gifts) |
| `/events/[eventId]/coordinator` | Live day-of coordinator |
| `/reports` | Insights & reports — KPIs, charts, CSV export |
| `/vendor-pass/[token]` | Public vendor access pass |
| `/gift/[eventId]` | Public guest gift page |
| `/invite/[eventId]/[token]` | Public digital invitation + RSVP |
| `/pricing` | 3-tier pricing + feature comparison |
| `/admin` | Admin console (admin role only) |

---

## Project Structure

```
gahundiq/
├── .project_instructions.md
└── nextjs_space/
    ├── app/                          # Next.js App Router
    │   ├── layout.tsx                # Root layout
    │   ├── page.tsx                  # Landing page
    │   ├── globals.css               # Design system CSS
    │   ├── _components/              # Shared page components
    │   ├── auth/
    │   │   ├── page.tsx
    │   │   └── _components/auth-client.tsx
    │   ├── admin/
    │   │   ├── page.tsx
    │   │   └── _components/admin-client.tsx
    │   ├── dashboard/
    │   │   ├── page.tsx
    │   │   └── _components/dashboard-client.tsx
    │   ├── events/
    │   │   ├── new/
    │   │   │   ├── page.tsx
    │   │   │   └── _components/new-event-client.tsx
    │   │   └── [eventId]/
    │   │       ├── page.tsx
    │   │       ├── loading.tsx
    │   │       ├── _components/
    │   │       │   ├── event-hub-client.tsx
    │   │       │   ├── timeline-tab.tsx
    │   │       │   ├── vendors-tab.tsx
    │   │       │   ├── guests-tab.tsx
    │   │       │   ├── seating-tab.tsx
    │   │       │   ├── tasks-tab.tsx
    │   │       │   ├── budget-tab.tsx
    │   │       │   ├── budget-charts.tsx
    │   │       │   └── gifts-tab.tsx
    │   │       └── coordinator/
    │   │           ├── page.tsx
    │   │           └── _components/coordinator-client.tsx
    │   ├── gift/
    │   │   └── [eventId]/
    │   │       ├── page.tsx
    │   │       └── _components/gift-page-client.tsx
    │   ├── invite/
    │   │   └── [eventId]/[token]/
    │   │       ├── page.tsx
    │   │       └── _components/invite-client.tsx
    │   ├── pricing/
    │   │   ├── page.tsx
    │   │   └── _components/pricing-client.tsx
    │   ├── reports/
    │   │   ├── page.tsx
    │   │   └── _components/
    │   │       ├── reports-client.tsx
    │   │       └── report-charts.tsx
    │   └── vendor-pass/
    │       └── [token]/
    │           ├── page.tsx
    │           └── _components/vendor-pass-client.tsx
```
    ├── components/                   # Shared components
    │   ├── ui/                       # UI primitives
    │   │   ├── badge.tsx
    │   │   ├── button.tsx
    │   │   ├── dialog.tsx
    │   │   ├── input.tsx
    │   │   ├── label.tsx
    │   │   ├── progress.tsx
    │   │   ├── select.tsx
    │   │   ├── sheet.tsx
    │   │   ├── sonner.tsx
    │   │   ├── switch.tsx
    │   │   └── tabs.tsx
    │   ├── cash-gift-modal.tsx
    │   ├── ceremony-addon-modal.tsx
    │   ├── chunk-load-error-handler.tsx
    │   ├── client-only.tsx
    │   ├── firebase-analytics.tsx
    │   ├── invitation-broadcast-modal.tsx
    │   ├── invitation-upload-modal.tsx
    │   ├── logo.tsx
    │   ├── navbar.tsx
    │   ├── plan-feature-gate.tsx
    │   ├── review-badge.tsx
    │   ├── safe-format.tsx
    │   ├── session-governance-panel.tsx
    │   ├── theme-provider.tsx
    │   └── theme-toggle.tsx
    ├── lib/                          # Utilities & hooks
    │   ├── auth-context.tsx           # Auth state management
    │   ├── firebase.ts               # Firebase initialization
    │   ├── plan-entitlements.ts      # Tier/limit logic
    │   ├── session-policy.ts         # Session governance rules
    │   ├── utils.ts
    │   └── hooks/
    │       ├── use-firestore-data.ts # onSnapshot CRUD
    │       ├── use-sessions.ts
    │       └── use-subscription.ts
    ├── types/
    │   └── firestore.ts              # TypeScript type definitions
    ├── scripts/
    │   └── set-admin-claim.ts        # Admin bootstrap script
    ├── firestore.rules               # Firestore security rules
    ├── storage.rules                 # Firebase Storage rules
    ├── public/                       # Static assets
    ├── .env.example
    ├── .env.local
    ├── .firebaserc
    ├── next.config.js
    ├── tailwind.config.ts
    ├── tsconfig.json
    ├── package.json
    └── STYLE_GUIDE.md
```

---

## Firestore Collections

| Collection | Description |
|------------|-------------|
| `users/{userId}` | User profiles |
| `admin/{uid}` | Admin registry |
| `events/{eventId}` | Event documents |
| `events/{eventId}/timeline` | Timeline items |
| `events/{eventId}/vendors` | Vendor records |
| `events/{eventId}/seating` | Seating charts (premium) |
| `events/{eventId}/tasks` | Task items |
| `events/{eventId}/budget` | Budget items (premium) |
| `events/{eventId}/guests` | Guest records |
| `events/{eventId}/invites` | Token-keyed invitations |
| `events/{eventId}/gifts` | Cash gifts (premium) |
| `sessions/{uid}/{deviceId}` | Session governance |
| `publicVendorPasses/{token}` | Public vendor passes |
| `publicGiftPages/{eventId}` | Public gift pages |
| `reviews/{reviewId}` | Public reviews |
| `subscriptions` | User subscriptions |

## Key Features

1. **Authentication** — Custom AuthContext with Firebase; email verification for password accounts; Google sign-in pre-verified
2. **Session Governance** — Per-device sessions: 14-day lifetime, 30-min idle timeout, max 3 devices (LRU eviction), remote revocation
3. **Subscription Tiers** — Free vs Premium with plan entitlements gating features
4. **Event Management** — Full CRUD with 7 management tabs
5. **Digital Invitations** — Token-based public invites with RSVP
6. **Cash Gifts** — 4-step gift-pledge flow (payments not connected)
7. **Seating Chart** — Interactive pointer-based table dragging
8. **Budget Tracking** — Recharts donut + bar charts
9. **Reports** — KPI dashboards with CSV export
10. **Admin Console** — User management, subscription overrides

---

## Architecture Patterns

- **Thin server pages** — All interactivity in `_components/*-client.tsx` with `'use client'`
- **Dynamic Firebase imports** — Via Function constructor to avoid TS errors
- **Client-side sorting** — Avoids composite Firestore indexes
- **SSR safety** — `ClientOnly`, `SafeDate`, `SafeTime`, `SafeNumber` primitives
- **Design tokens** — All colors via CSS variables in `globals.css`
- **Custom utilities** — `.aurora`, `.glass`, `.text-gradient`, `.border-glow`, `.spotlight`, `.marquee`, `.btn-shimmer`, `.float-a/b/c`

---

## Important Notes

- Payments not connected — Cash gifts record `pending` status only
- No email backend — Invitation broadcasts are link-based
- Firebase optional — App falls back to empty states when not configured
- SSR lint — `eslint.ssr.config.mjs` runs after every build
- Admin bootstrap — First admin via `admin/{uid}` document in Firebase Console
