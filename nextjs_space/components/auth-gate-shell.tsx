'use client';

import { Navbar } from '@/components/navbar';

/**
 * Neutral shell for a signed-in page while the session resolves — or while
 * `AuthProvider` is redirecting a signed-out visitor away (lib/auth-context).
 *
 * Rendering this instead of the page's private UI means nothing leaks and
 * nothing flashes during the hand-off. Note this is a *render* gate only:
 * the redirect itself belongs to AuthProvider, which is the single owner of
 * signed-out routing.
 */
export function AuthGateShell() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    </div>
  );
}
