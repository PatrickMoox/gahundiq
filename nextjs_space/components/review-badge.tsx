'use client';

import React, { useEffect, useState } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { Star } from 'lucide-react';
import { ClientOnly } from '@/components/client-only';

interface ReviewSummary {
  average: number;
  count: number;
}

/**
 * Social-proof badge driven by REAL reviews from the public `reviews`
 * collection (`reviews/{id}.rating` 1–5). Renders nothing — no stars, no
 * claim — until at least one review exists (admin-managed via the dashboard,
 * see firestore.rules: only admins write). Once reviews are added, the
 * hero/auth badge lights up automatically with the real average + count.
 *
 * SSR-safe: renders nothing on the server and before reviews load, so the
 * hero/auth layouts collapse cleanly with zero gap. Once a review exists,
 * the stars mount in place automatically (a normal, expected layout growth —
 * the badge is empty-state-first by design).
 */
function ReviewBadgeInner({ className }: { className?: string }) {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);

  useEffect(() => {
    const db = getFirestoreClient();
    if (!db) { setSummary(null); return; }
    getDocs(query(collection(db, 'reviews'), limit(200)))
      .then((snap) => {
        const ratings = snap.docs
          .map((d) => Number((d.data() as { rating?: unknown })?.rating ?? 0))
          .filter((r: number) => r >= 0.5 && r <= 5);
        if (ratings.length === 0) { setSummary(null); return; }
        setSummary({
          average: ratings.reduce((s: number, r: number) => s + r, 0) / ratings.length,
          count: ratings.length,
        });
      })
      .catch(() => setSummary(null));
  }, []);

  // Pre-mount render matches the SSR output exactly (nothing) so hydration is
  // clean; only real review data lights the badge up.
  if (!summary) return null;

  // Nearest half-star for the fill (e.g. 4.6 → 4.5 rendered as floor(2x)/2)
  const filled = Math.floor(summary.average * 2) / 2;

  return (
    <div className={`flex items-center justify-center gap-2 text-sm text-muted-foreground ${className ?? ''}`}>
      <span className="flex" aria-label={`Rated ${summary.average.toFixed(1)} out of 5 by ${summary.count} reviewer${summary.count === 1 ? '' : 's'}`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${i <= Math.round(filled) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
          />
        ))}
      </span>
      <span>
        {summary.average.toFixed(1)} · loved by {summary.count} {summary.count === 1 ? 'host' : 'hosts'} &amp; planners
      </span>
    </div>
  );
}

export function ReviewBadge({ className }: { className?: string }) {
  // Renders nothing on the server and before reviews load — the parent
  // reserves no space, so the hero collapses cleanly with zero gap.
  // Once a review exists in Firestore, the stars mount here automatically.
  return (
    <ClientOnly fallback={null}>
      <ReviewBadgeInner className={className} />
    </ClientOnly>
  );
}