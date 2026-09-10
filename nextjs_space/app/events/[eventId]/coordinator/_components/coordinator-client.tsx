'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useEvent, useTimeline, useVendors } from '@/lib/hooks/use-firestore-data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { TimelineItem, Vendor } from '@/types/firestore';
import {
  ArrowLeft, Clock, Phone, MessageCircle, Radio, CheckCircle2,
  ChevronRight, Filter
} from 'lucide-react';
import { ClientOnly } from '@/components/client-only';
import { PlanFeatureGate } from '@/components/plan-feature-gate';

const TRACKS = ['Main Stage', 'Catering & Kitchen', 'Photo/Video Crew', 'VIP Party'];

function timeToMinutes(t: string): number {
  const [h, m] = (t ?? '00:00').split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function CoordinatorClient({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { event } = useEvent(eventId);
  const { items } = useTimeline(eventId);
  const { vendors } = useVendors(eventId);
  const [now, setNow] = useState(() => new Date(0));

  // Hydrate to real time on mount
  useEffect(() => { setNow(new Date()); }, []);
  const [activeTracks, setActiveTracks] = useState<Set<string>>(new Set(TRACKS));

  // Auto-refresh clock every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const sortedItems = useMemo(() =>
    [...(items ?? [])]
      .filter((i: TimelineItem) => activeTracks.has(i?.track ?? ''))
      .sort((a: TimelineItem, b: TimelineItem) => timeToMinutes(a?.startTime ?? '') - timeToMinutes(b?.startTime ?? '')),
    [items, activeTracks]
  );

  // Determine active/upcoming/completed based on current time
  const categorized = useMemo(() => {
    const active: TimelineItem[] = [];
    const upcoming: TimelineItem[] = [];
    const completed: TimelineItem[] = [];
    (sortedItems ?? []).forEach((item: TimelineItem) => {
      const start = timeToMinutes(item?.startTime ?? '');
      const end = timeToMinutes(item?.endTime ?? '');
      if (currentMinutes >= start && currentMinutes < end) active.push(item);
      else if (currentMinutes < start) upcoming.push(item);
      else completed.push(item);
    });
    return { active, upcoming, completed };
  }, [sortedItems, currentMinutes]);

  // Progress
  const totalItems = sortedItems?.length ?? 0;
  const completedCount = categorized?.completed?.length ?? 0;
  const progressPct = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

  const toggleTrack = useCallback((track: string) => {
    setActiveTracks((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(track)) next.delete(track); else next.add(track);
      return next;
    });
  }, []);

  const formatCountdown = (startTime: string) => {
    const diff = timeToMinutes(startTime) - currentMinutes;
    if (diff <= 0) return 'Now';
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  if (event && event.tier !== 'premium') {
    return <div className="min-h-screen bg-background p-6"><div className="mx-auto max-w-2xl pt-16"><PlanFeatureGate event={event} feature="coordinator" /></div></div>;
  }

  return (
    <div className="min-h-screen bg-[#0F0F1A] text-white">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-[#0F0F1A]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/events/${eventId}`)} className="gap-1 text-white/70 hover:text-white hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-red-500 animate-pulse" />
            <span className="text-sm font-semibold">LIVE</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-4 py-6">
        {/* Digital Clock */}
        <div className="mb-6 text-center">
          <ClientOnly fallback={<p className="font-mono text-6xl font-bold md:text-8xl">--:--</p>}>
            <p className="font-mono text-6xl font-bold md:text-8xl">
              {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Africa/Kigali' })}
            </p>
          </ClientOnly>
          <p className="mt-1 text-sm text-white/50">{event?.title}</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="mb-1 flex justify-between text-xs text-white/50">
            <span>Event Progress</span>
            <span>{progressPct}% complete</span>
          </div>
          <Progress value={progressPct} className="h-2 bg-white/10" />
        </div>

        {/* Track Filters */}
        <div className="mb-6 flex flex-wrap gap-2">
          <Filter className="h-4 w-4 self-center text-white/40" />
          {TRACKS.map((track: string) => (
            <Button
              key={track}
              variant={activeTracks.has(track) ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleTrack(track)}
              className={activeTracks.has(track) ? '' : 'border-white/20 text-white/60 hover:text-white hover:bg-white/10'}
            >
              {track}
            </Button>
          ))}
        </div>

        {/* Current Active Step */}
        {(categorized?.active?.length ?? 0) > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase text-emerald-400">Now Playing</p>
            {(categorized?.active ?? []).map((item: TimelineItem) => (
              <motion.div
                key={item?.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl border-2 border-emerald-500/50 bg-emerald-500/10 p-5"
              >
                <div className="flex items-center gap-2 text-emerald-400">
                  <span className="font-mono text-sm">{item?.startTime} – {item?.endTime}</span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-xs">{item?.track}</Badge>
                </div>
                <h2 className="mt-1 text-2xl font-bold">{item?.title}</h2>
                {item?.description && <p className="mt-1 text-white/60">{item?.description}</p>}
                {item?.assignedTo && <p className="mt-1 text-sm text-white/40">Assigned: {item?.assignedTo}</p>}
              </motion.div>
            ))}
          </div>
        )}

        {/* Upcoming */}
        {(categorized?.upcoming?.length ?? 0) > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase text-amber-400">Up Next</p>
            <div className="space-y-2">
              {(categorized?.upcoming ?? []).slice(0, 3).map((item: TimelineItem) => (
                <motion.div
                  key={item?.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-white/50">{item?.startTime}</span>
                      <Badge variant="outline" className="border-white/20 text-white/60 text-xs">{item?.track}</Badge>
                    </div>
                    <p className="font-semibold">{item?.title}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-amber-400">{formatCountdown(item?.startTime ?? '')}</p>
                    <p className="text-[10px] text-white/40">until start</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Crew Contacts */}
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase text-white/40">Crew Contacts</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(vendors ?? []).map((v: Vendor) => (
              <div key={v?.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="flex-1">
                  <p className="font-semibold text-sm">{v?.contactName}</p>
                  <p className="text-xs text-white/40">{v?.name} · {v?.category}</p>
                </div>
                <div className="flex gap-1">
                  <a href={`tel:${v?.phone ?? ''}`}>
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-white/20 hover:bg-white/10">
                      <Phone className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  <a href={`https://wa.me/${(v?.phone ?? '').replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                      <MessageCircle className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Full Timeline */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-white/40">Full Timeline</p>
          <div className="space-y-1">
            {(sortedItems ?? []).map((item: TimelineItem) => {
              const start = timeToMinutes(item?.startTime ?? '');
              const end = timeToMinutes(item?.endTime ?? '');
              const isCompleted = currentMinutes >= end;
              const isActive = currentMinutes >= start && currentMinutes < end;
              return (
                <div key={item?.id} className={`flex items-center gap-3 rounded-lg p-2.5 text-sm transition-all ${
                  isActive ? 'bg-emerald-500/10 border border-emerald-500/30' :
                  isCompleted ? 'opacity-40' : 'bg-white/5 border border-transparent'
                }`}>
                  {isCompleted ? <CheckCircle2 className="h-4 w-4 shrink-0 text-white/30" /> :
                   isActive ? <Radio className="h-4 w-4 shrink-0 text-emerald-400 animate-pulse" /> :
                   <Clock className="h-4 w-4 shrink-0 text-white/30" />}
                  <span className="w-24 shrink-0 font-mono text-xs text-white/50">{item?.startTime} – {item?.endTime}</span>
                  <span className="h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: item?.color }} />
                  <span className={`flex-1 ${isCompleted ? 'line-through' : ''}`}>{item?.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
