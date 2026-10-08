## Layout

The root layout, `app/layout.tsx`, is the single place for app-wide providers and global infrastructure.

**Do not remove any existing entries without a reason.** Current infrastructure in the layout:

| Entry | Purpose |
|-------|---------|
| `ThemeProvider` | Light/dark mode via `next-themes` |
| `AuthProvider` | Firebase Auth context (`@/lib/auth-context`) — wraps all app pages |
| `Toaster` | Global toast notifications via Sonner |
| `ChunkLoadErrorHandler` | Required — prevents known ChunkLoadError race condition bug |
| `ConnectivityStatus` | Surfaces offline/degraded connectivity via a shared Sonner toast |
| `FirebaseAnalytics` | Client-only, dynamically imported Analytics initialisation |

---

## Typography

| Role | Font | Tailwind Class | Default Usage |
|------|------|---------------|-------|
| Body | DM Sans | `font-sans` | All body text, labels, descriptions |
| Display | Plus Jakarta Sans | `font-display` | Page titles, hero headings, section headers |
| Mono | JetBrains Mono | `font-mono` | Code snippets, numeric data, IDs, timestamps |

**Size hierarchy:** Use Tailwind's scale. Headings: `text-4xl`→`text-3xl`→`text-2xl`→`text-xl`. Body: `text-base`→`text-sm`. Captions: `text-xs`.

Always use `tracking-tight` on large headings (`text-2xl` and above).

---

## Color System (Design Tokens)

All colors use CSS variables — **never hardcode color values**.

| Token | Purpose |
|-------|---------|
| `background` / `foreground` | Page-level bg and text |
| `card` / `card-foreground` | Card surfaces |
| `primary` / `primary-foreground` | Brand buttons, links, accents |
| `secondary` / `secondary-foreground` | Secondary buttons, subtle highlights |
| `muted` / `muted-foreground` | Disabled states, helper text, subtle backgrounds |
| `accent` / `accent-foreground` | Hover states, active nav items |
| `destructive` / `destructive-foreground` | Errors, delete actions |
| `border` | Borders and dividers |
| `input` | Form input borders |
| `ring` | Focus rings |

Usage: `bg-primary`, `text-muted-foreground`, `border-border`, etc.

---

## Spacing Scale

Based on an 8px grid. Use these CSS variables or Tailwind equivalents:

| Token | Value | Tailwind |
|-------|-------|----------|
| `--spacing-xs` | 4px | `p-1`, `gap-1` |
| `--spacing-sm` | 8px | `p-2`, `gap-2` |
| `--spacing-md` | 16px | `p-4`, `gap-4` |
| `--spacing-lg` | 24px | `p-6`, `gap-6` |
| `--spacing-xl` | 32px | `p-8`, `gap-8` |
| `--spacing-2xl` | 48px | `p-12`, `gap-12` |
| `--spacing-3xl` | 64px | `p-16`, `gap-16` |

**Vary spacing rhythm** — don't use the same gap everywhere. Hero → large gap → content → medium gap → footer.

---

## Shadow Scale

| Token | Default Usage |
|-------|-------|
| `--shadow-sm` | Subtle card lift, input focus |
| `--shadow-md` | Cards, dropdowns, popovers |
| `--shadow-lg` | Modals, elevated panels |

These are CSS variables only — use them directly in inline styles or custom CSS as `var(--shadow-sm)` etc. They are not mapped to Tailwind's `shadow-*` utilities.

---

## Border Radius

| Token | Value | Default Usage |
|-------|-------|-------|
| `--radius` | 0.625rem | Default (buttons, inputs, cards) |
| `--radius-sm` | calc(var(--radius) - 4px) | Small elements (badges, chips) |
| `--radius-lg` | calc(var(--radius) + 4px) | Large containers, hero cards |
| `--radius-full` | 9999px | Avatars, pills, circular buttons |

---

## Animation Timing

| Token | Value | Tailwind Class | Default Usage |
|-------|-------|---------------|-------|
| `--duration-fast` | 150ms | `duration-fast` | Hover states, toggles |
| `--duration-normal` | 250ms | `duration-normal` | Page transitions, reveals |
| `--duration-slow` | 350ms | `duration-slow` | Complex animations, modals |

---

## Animation — framer-motion (direct)

Use `framer-motion` directly. (The old `components/ui/animate` wrappers and
`components/layouts/*` layout wrappers were removed as unused dead code.)

```tsx
const fadeUp = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } };
const stagger = { visible: { transition: { staggerChildren: 0.08 } } };
<motion.div initial="hidden" animate="visible" variants={stagger}>...</motion.div>
```

Design-system CSS utilities live in `app/globals.css`: `.aurora` + `.aurora-orb`,
`.glass` / `.glass-strong`, `.text-gradient`, `.border-glow`, `.spotlight`,
`.marquee`, `.btn-shimmer`, `.float-a/b/c`. Reduced-motion is handled globally.

---

## UI Components — `@/components/ui/`

Only these exist now (dead primitives were removed in the audit):

| Component | Import |
|-----------|--------|
| `Button` | `@/components/ui/button` — variants incl. `glass-dark`/`glass-light`; sizes `xs`-`icon`, `icon-sm` |
| `Badge` | `@/components/ui/badge` |
| `Input` | `@/components/ui/input` |
| `Label` | `@/components/ui/label` |
| `Select` | `@/components/ui/select` — Radix select; always add an `aria-label` or `<Label htmlFor>` |
| `Dialog` | `@/components/ui/dialog` — centered modal; the primitive already caps height at `max-h-[90dvh]` and scrolls |
| `Sheet` | `@/components/ui/sheet` — side-panel overlay |
| `Progress` | `@/components/ui/progress` |
| `Switch` | `@/components/ui/switch` |
| `Tabs` | `@/components/ui/tabs` — `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`; `TabsList` uses `min-h-[2.5rem]` so `flex-wrap` works |
| `Toaster` (Sonner) | `@/components/ui/sonner` — use `import { toast } from 'sonner'` |
| `ThemeToggle` | `@/components/theme-toggle` — light/dark switch |

There is **no `Card`, `Textarea` or `Checkbox` primitive** (earlier doc revisions listed them;
they were removed as dead code). Compose card surfaces from `rounded-* border bg-card p-*` divs.
Icons come from `lucide-react` only.

---

## Responsiveness — mobile-first conventions

The app is used by hosts on phones and by guests almost exclusively on phones.
These rules are load-bearing; they were each added to fix a real mobile defect:

- **Breakpoints:** style the 360px case first, then widen with `sm:` (640), `md:` (768), `lg:` (1024).
  Never start a grid at 2+ columns without a breakpoint (`grid-cols-2` alone is a bug).
- **Headings:** page `h1`s go `text-3xl` then `sm:text-4xl`/`md:text-5xl`. `text-4xl` and up
  only behind a breakpoint — a fixed `text-4xl` overflows narrow phones.
- **Tables:** wrap in `overflow-x-auto` **and** give the `<table>` a `min-w-[…]`; `w-full` alone
  squashes money columns into unreadable slivers instead of scrolling.
- **Dialogs:** tall content must stay reachable. The `DialogContent` primitive supplies
  `max-h-[90dvh] overflow-y-auto`; if you override `overflow` in a consumer
  (`p-0 overflow-hidden`), you re-break it — use `overflow-y-auto`.
- **Touch targets:** interactive controls are ≥ ~40px (`h-10`, `size="icon"`). Avoid `p-0.5`
  icon buttons.
- **Never hide actions behind hover alone** (`opacity-0 group-hover:opacity-100`): touch devices
  have no hover, so the control is invisible *and* undiscoverable. Use the touch-safe pattern
  `opacity-100 sm:opacity-0 sm:group-hover:opacity-100`.
- **Drag surfaces:** pair pointer handlers with `touch-none` (`touch-action: none`) or a finger
  drag scrolls the page instead of dragging; and clamp positions to the container, because
  clipped (`overflow-hidden`) canvases make off-canvas items unrecoverable.
- **Icon-only controls** need an `aria-label` naming the target (e.g. `` aria-label={`Delete ${item?.name}`} ``).
- **Tailwind v3 pitfall:** `min-w-*`/`min-h-*` are **not** on the spacing scale here
  (`minHeight` is not extended in `tailwind.config.ts`), so `min-h-10` silently emits
  *no CSS*. Use an arbitrary value (`min-h-[2.5rem]`) or extend the config. `min-w-0`
  and `min-h-screen` are core defaults and fine.

App-level components worth knowing:
`Navbar` (`components/navbar.tsx`), `Logo` (`components/logo.tsx`),
`PlanFeatureGate` (`components/plan-feature-gate.tsx`), `ClientOnly` / `useMounted`
(`components/client-only.tsx`), `CashGiftModal`, `CeremonyAddonModal`,
`InvitationUploadModal`, `InvitationBroadcastModal` (`components/`).
`ReviewBadge` (`components/review-badge.tsx`) — SSR-safe, real-data social-proof
stars; renders nothing until a review exists in the public `reviews` collection
(admin-managed via the admin Reviews tab, per firestore.rules).

---

## SSR / Hydration Safety — `@/components/client-only`
Server-rendered HTML must match the client's first render. An automated SSR lint
(`eslint.ssr.config.mjs` — do not delete) runs after every build and fails it on unsafe
patterns. Use these patterns instead of hand-rolling fixes:
| Primitive | Import | Use for |
|-----------|--------|---------|
| `ClientOnly` | `@/components/client-only` | Anything browser-only or non-deterministic: `window`/`localStorage` reads, live clocks, random values, third-party widgets. Pass a `fallback` sized like the content. |
| `useMounted()` | `@/components/client-only` | Hook variant when you need the boolean directly. |
| Explicit locale/time zone | `Intl` formatting APIs | Dates, times, and numbers rendered on both server and client; specify the same locale and (for dates/times) time zone in both environments. Defer visitor-specific formatting until after mount. |
Rules of thumb: never touch `window`/`document` at module scope; never seed `useState` with
`Date.now()`/`Math.random()`/`new Date()`; never call `toLocaleString`-style methods without
an explicit locale (and `timeZone` for dates).
