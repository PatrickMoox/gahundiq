'use client';

import Link from 'next/link';
import { LockKeyhole, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PaidFeature } from '@/lib/plan-entitlements';
import type { EventData } from '@/types/firestore';
import { canUseFeature } from '@/lib/plan-entitlements';

const FEATURE_LABELS: Record<PaidFeature, string> = {
  seating: 'Seating Chart Builder',
  budget: 'Budget Tracker',
  gifts: 'Digital Gifts',
  coordinator: 'Day-of Coordinator',
  watermarkFree: 'Watermark-free Exports',
};

export function PlanFeatureGate({ event, feature, children }: { event: EventData; feature: PaidFeature; children?: React.ReactNode }) {
  if (canUseFeature(event, feature)) return <>{children}</>;

  return (
    <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-10 text-center">
      <LockKeyhole className="mx-auto mb-3 h-8 w-8 text-primary" />
      <h2 className="font-display text-xl font-bold">{FEATURE_LABELS[feature]} is a paid feature</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Upgrade this ceremony to unlock this workspace and keep all of your planning in one place.</p>
      <Link href="/pricing">
        <Button className="mt-5 gap-2"><Sparkles className="h-4 w-4" /> View paid plans</Button>
      </Link>
    </div>
  );
}
