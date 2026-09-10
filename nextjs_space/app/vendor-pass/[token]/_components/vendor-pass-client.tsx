'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { Badge } from '@/components/ui/badge';
import type { Vendor, TimelineItem } from '@/types/firestore';
import {
  Calendar, MapPin, Clock, Phone, Mail, Sparkles, CheckCircle2
} from 'lucide-react';

export function VendorPassClient({ token }: { token: string }) {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [event, setEvent] = useState<any>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreClient();
    if (!db || token.length < 32) { setLoading(false); return; }
    getDoc(doc(db, 'publicVendorPasses', token)).then((snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : null;
      setVendor(data?.vendor ?? null);
      setEvent(data?.event ?? null);
      setTimeline(data?.timeline ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading access pass...</div>;
  if (!vendor || !event) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold">Access Pass Not Found</h1>
          <p className="mt-2 text-muted-foreground">This vendor access link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  const relevantTimeline = timeline.filter((t: TimelineItem) =>
    t?.assignedTo?.toLowerCase()?.includes(vendor?.name?.toLowerCase()?.split(' ')?.[0] ?? '---') ||
    t?.assignedTo?.toLowerCase()?.includes(vendor?.contactName?.toLowerCase()?.split(' ')?.[0] ?? '---')
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-primary/5">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-primary">Vendor Access Pass</span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{event?.title}</h1>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{event?.date instanceof Date ? event.date.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'TBD'}</span>
            <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{event?.venue}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Vendor Info */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 rounded-xl border border-border/50 bg-card p-5" style={{ boxShadow: 'var(--shadow-md)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Badge variant="default">{vendor?.category}</Badge>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-sm text-emerald-500">Confirmed</span>
          </div>
          <h2 className="font-display text-xl font-bold">{vendor?.name}</h2>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            <p className="flex items-center gap-2"><Phone className="h-4 w-4" />{vendor?.contactName} · {vendor?.phone}</p>
            <p className="flex items-center gap-2"><Mail className="h-4 w-4" />{vendor?.email}</p>
            {vendor?.arrivalTime && <p className="flex items-center gap-2"><Clock className="h-4 w-4" />Arrival: {vendor?.arrivalTime}</p>}
          </div>
          {vendor?.notes && <p className="mt-3 text-sm">{vendor?.notes}</p>}
        </motion.div>

        {/* Schedule */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h3 className="mb-3 font-display text-lg font-semibold">Your Schedule</h3>
          {relevantTimeline.length > 0 ? (
            <div className="space-y-2">
              {relevantTimeline.map((item: TimelineItem) => (
                <div key={item?.id} className="flex items-center gap-3 rounded-lg border border-border/50 bg-card p-3" style={{ boxShadow: 'var(--shadow-sm)' }}>
                  <span className="h-8 w-1 rounded-full" style={{ backgroundColor: item?.color }} />
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{item?.startTime} – {item?.endTime}</p>
                    <p className="font-medium">{item?.title}</p>
                    {item?.description && <p className="text-xs text-muted-foreground">{item?.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No specific timeline items assigned. Check with the event coordinator for details.</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
