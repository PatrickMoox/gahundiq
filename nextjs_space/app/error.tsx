'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Route-level error boundary (app/error.tsx). Catches render/data errors in
 * any route segment below the root layout and offers a retry, so a failed
 * Firestore read never leaves a blank screen.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Unhandled route error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-2xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        An unexpected error occurred while loading this page. Try again — if it keeps happening, head back and reopen it from your dashboard.
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Link href="/"><Button variant="outline">Go home</Button></Link>
      </div>
    </div>
  );
}