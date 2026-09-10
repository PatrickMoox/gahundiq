'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';
import { Menu, X, Sparkles, LogOut, LayoutDashboard, ShieldCheck, BarChart3, ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Navigation shown to visitors who are not signed in. */
const PUBLIC_LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
];

/** Primary workspace links for signed-in users. */
const APP_LINKS = [
  { href: '/dashboard', label: 'My events', icon: LayoutDashboard },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/pricing', label: 'Pricing', icon: Sparkles },
];

function isActiveLink(href: string, pathname: string): boolean {
  // Anchor links (e.g. /#features) are active while the home page is open.
  return href.startsWith('/#') ? pathname === '/' : pathname === href;
}

function getInitials(user: { displayName?: string | null; email?: string | null }): string {
  const name = user?.displayName?.trim();
  if (name) return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  return user?.email?.charAt(0)?.toUpperCase() ?? '?';
}

export function Navbar() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const isAdmin = user?.role === 'admin';
  const links = user ? APP_LINKS : PUBLIC_LINKS;
  const initials = user ? getInitials(user) : '';

  const accountItems = [
    { href: '/dashboard', label: 'My events', desc: 'See and manage your ceremonies' },
    { href: '/reports', label: 'Reports', desc: 'Guests, budget, gifts and RSVPs' },
    { href: '/pricing', label: 'Plan & billing', desc: 'Upgrade plans, add-ons and extras' },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin console', desc: 'Platform management tools' }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/60 backdrop-blur-xl transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-gradient-to-r after:from-transparent after:via-primary/40 after:to-transparent">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4">
        <Link href="/" className="group flex items-center gap-2" aria-label="Gahundiq home">
          <div className="rotate-0 transition-transform duration-300 group-hover:rotate-6">
            <Logo className="h-8 w-8" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">Gahundiq<span className="text-primary">.</span></span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l: any) => (
            <Link key={l?.href} href={l?.href ?? '#'}>
              <Button
                variant={isActiveLink(l?.href, pathname) ? 'secondary' : 'ghost'}
                size="sm"
                className="gap-1.5"
              >
                {l?.icon && <l.icon className="h-4 w-4" />}
                {l?.label}
              </Button>
            </Link>
          ))}
          <div className="ml-2 flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <>
                {/* Primary action for signed-in users */}
                <Link href="/events/new">
                  <Button size="sm" className="btn-shimmer gap-1.5">
                    <Plus className="h-4 w-4" /> Create event
                  </Button>
                </Link>

                {/* Account menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setAccountOpen((o) => !o)}
                    aria-haspopup="menu"
                    aria-expanded={accountOpen}
                    className="flex items-center gap-1.5 rounded-full border border-border/60 py-1 pl-1 pr-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-xs font-bold text-white">
                      {initials}
                    </span>
                    <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', accountOpen && 'rotate-180')} />
                  </button>

                  <AnimatePresence>
                    {accountOpen && (
                      <>
                        <button
                          type="button"
                          aria-label="Close account menu"
                          onClick={() => setAccountOpen(false)}
                          className="fixed inset-0 z-40 cursor-default"
                        />
                        <motion.div
                          role="menu"
                          initial={{ opacity: 0, y: 6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.98 }}
                          transition={{ duration: 0.12 }}
                          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border/60 bg-popover/95 p-1.5 shadow-[var(--shadow-lg)] backdrop-blur-xl"
                        >
                          <div className="border-b border-border/50 px-3 py-2.5">
                            <p className="text-sm font-semibold leading-tight">{user?.displayName ?? 'Your account'}</p>
                            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                          </div>
                          {accountItems.map((item) => (
                            <Link key={item.href} href={item.href} onClick={() => setAccountOpen(false)}>
                              <span className="block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-primary/10 hover:text-primary">
                                <span className="font-medium">{item.label}</span>
                                <span className="block text-xs text-muted-foreground">{item.desc}</span>
                              </span>
                            </Link>
                          ))}
                          <button
                            type="button"
                            onClick={() => { setAccountOpen(false); signOut?.(); }}
                            className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-border/50 px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                          >
                            <LogOut className="h-4 w-4" /> Sign out
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <>
                <Link href="/auth">
                  <Button variant="ghost" size="sm">Sign in</Button>
                </Link>
                <Link href="/auth">
                  <Button size="sm" className="btn-shimmer gap-1.5"><Sparkles className="h-4 w-4" /> Start free</Button>
                </Link>
              </>
            )}
          </div>
        </nav>

        {/* Mobile toggle */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Button variant="ghost" size="sm" aria-label={mobileOpen ? 'Close menu' : 'Open menu'} onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border/40 md:hidden"
          >
            <div className="flex flex-col gap-1 p-4">
              {user && (
                <Link href="/events/new" onClick={() => setMobileOpen(false)} className="mb-1">
                  <Button className="btn-shimmer w-full gap-2"><Plus className="h-4 w-4" /> Create event</Button>
                </Link>
              )}
              {links.map((l: any) => (
                <Link key={l?.href} href={l?.href ?? '#'} onClick={() => setMobileOpen(false)}>
                  <Button variant="ghost" className={cn('w-full justify-start gap-2', isActiveLink(l?.href, pathname) && 'bg-secondary')}>
                    {l?.icon && <l.icon className="h-4 w-4" />}
                    {l?.label}
                  </Button>
                </Link>
              ))}
              {isAdmin && (
                <Link href="/admin" onClick={() => setMobileOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start gap-2"><ShieldCheck className="h-4 w-4" /> Admin console</Button>
                </Link>
              )}
              {user ? (
                <Button variant="ghost" className="w-full justify-start gap-2 text-destructive" onClick={() => { signOut?.(); setMobileOpen(false); }}>
                  <LogOut className="h-4 w-4" /> Sign out
                </Button>
              ) : (
                <Link href="/auth" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" className="w-full gap-2">Sign in</Button>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
