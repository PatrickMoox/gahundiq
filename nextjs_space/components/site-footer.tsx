import Link from 'next/link';
import { Logo } from '@/components/logo';

interface FooterLink {
  href: string;
  label: string;
}

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Product',
    links: [
      { href: '/#features', label: 'Features' },
      { href: '/#how-it-works', label: 'How it works' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/help', label: 'Help & FAQ' },
      { href: '/help#budget-guide', label: 'Budget guide' },
      { href: '/help#currency', label: 'Currency support' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/about#contact', label: 'Contact' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
];

/**
 * Site-wide footer shown on every page. Stacks to a 2-up grid on mobile,
 * then 4 columns on desktop (brand + Product / Resources / Company).
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/50 bg-background/40">
      <div className="mx-auto max-w-[1200px] px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2" aria-label="Gahundiq home">
              <Logo className="h-7 w-7" />
              <span className="font-display text-base font-bold tracking-tight">Gahundiq<span className="text-primary">.</span></span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              The all-in-one command center for planning, coordinating, and celebrating weddings, birthdays, and corporate events.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">{col.title}</h3>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((l) => (
                  <li key={`${col.title}-${l.href}`}>
                    <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-primary">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border/40 pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>© 2026 Gahundiq. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="transition-colors hover:text-primary">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-primary">Terms</Link>
            <Link href="/help" className="transition-colors hover:text-primary">Help</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}