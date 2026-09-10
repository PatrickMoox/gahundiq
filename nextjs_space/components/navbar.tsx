'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Logo } from '@/components/logo';
import { Menu, X, Sparkles, LogOut, LayoutDashboard, ShieldCheck, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Navbar() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = user
    ? [
        { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/reports', label: 'Reports', icon: BarChart3 },
        { href: '/pricing', label: 'Pricing', icon: Sparkles },
        ...(user.role === 'admin' ? [{ href: '/admin', label: 'Admin', icon: ShieldCheck }] : []),
      ]
    : [
        { href: '/pricing', label: 'Pricing', icon: Sparkles },
      ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/60 backdrop-blur-xl transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-gradient-to-r after:from-transparent after:via-primary/40 after:to-transparent">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4">
        <Link href="/" className="group flex items-center gap-2">
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
                variant={pathname === l?.href ? 'secondary' : 'ghost'}
                size="sm"
                className="gap-1.5"
              >
                {l?.icon && <l.icon className="h-4 w-4" />}
                {l?.label}
              </Button>
            </Link>
          ))}
          <ThemeToggle />
          {user ? (
            <div className="ml-2 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{user?.displayName ?? user?.email ?? ''}</span>
              <Button variant="ghost" size="sm" onClick={() => signOut?.()}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Link href="/auth">
              <Button size="sm" className="ml-2">Sign In</Button>
            </Link>
          )}
        </nav>

        {/* Mobile toggle */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={() => setMobileOpen(!mobileOpen)}>
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
              {links.map((l: any) => (
                <Link key={l?.href} href={l?.href ?? '#'} onClick={() => setMobileOpen(false)}>
                  <Button variant="ghost" className="w-full justify-start gap-2">
                    {l?.icon && <l.icon className="h-4 w-4" />}
                    {l?.label}
                  </Button>
                </Link>
              ))}
              {user ? (
                <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => { signOut?.(); setMobileOpen(false); }}>
                  <LogOut className="h-4 w-4" /> Sign Out
                </Button>
              ) : (
                <Link href="/auth" onClick={() => setMobileOpen(false)}>
                  <Button className="w-full">Sign In</Button>
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
