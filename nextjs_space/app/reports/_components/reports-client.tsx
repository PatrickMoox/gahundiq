'use client';

/**
 * Insights & Reports — aggregates a user's ceremony data (guests/RSVPs,
 * tasks, budget, gifts, invites) into KPIs, charts, and an exportable
 * guest report. All reads are per-event subcollection queries already
 * permitted by the Firestore rules — no new rules needed.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useGuests, useTasks, useBudget, useCashGifts, useVendors, useEventInvites } from '@/lib/hooks/use-firestore-data';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, BarChart3, CheckCircle2, Download, Gift, Hourglass,
  Mail, RefreshCw, TrendingUp, UserCheck, UserX, Users,
} from 'lucide-react';
import type { EventData } from '@/types/firestore';
import { formatMoney } from '@/lib/currency';

const ReportCharts = dynamic(() => import('./report-charts'), { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-2xl bg-muted/50" /> });

const fadeUp = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } };
const stagger = { visible: { transition: { staggerChildren: 0.06 } } };
const MAX_AGGREGATE_EVENTS = 20;

interface ReportSnapshot {
  guestsTotal: number;
  confirmed: number;
  pending: number;
  declined: number;
  invitesSent: number;
  vipCount: number;
  tasksDone: number;
  tasksTotal: number;
  budgetEstimated: number;
  budgetActual: number;
  budgetPaid: number;
  giftsReceived: number;
  giftsPledged: number;
  vendorsTotal: number;
  vendorPaid: number;
}

const EMPTY: ReportSnapshot = { guestsTotal: 0, confirmed: 0, pending: 0, declined: 0, invitesSent: 0, vipCount: 0, tasksDone: 0, tasksTotal: 0, budgetEstimated: 0, budgetActual: 0, budgetPaid: 0, giftsReceived: 0, giftsPledged: 0, vendorsTotal: 0, vendorPaid: 0 };

function eventDate(e: any): Date | null {
  const d = e?.date?.toDate?.() ?? (e?.date ? new Date(e.date) : null);
  return d && !isNaN(d.getTime()) ? d : null;
}

export function ReportsClient() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventData[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [scope, setScope] = useState<string>('all');
  const [agg, setAgg] = useState<ReportSnapshot>(EMPTY);
  const [aggLoading, setAggLoading] = useState(false);

  // Load the user's events (client-side sort — no orderBy, no composite index needed)
  useEffect(() => {
    if (!user?.uid) { setEventsLoading(false); return; }
    const db = getFirestoreClient();
    if (!db) { setEventsLoading(false); return; }
    (async () => {
      try {
        const q = query(collection(db, 'events'), where('hostId', '==', user!.uid), limit(MAX_AGGREGATE_EVENTS));
        const snapshot = await getDocs(q);
        setEvents(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as EventData)));
      } catch { setEvents([]); }
      setEventsLoading(false);
    })();
  }, [user?.uid]);

  const activeEventId = scope === 'all' ? '' : scope;

  // Single-event mode: live hooks (empty eventId → hooks return empty data)
  const { guests } = useGuests(activeEventId);
  const { tasks } = useTasks(activeEventId);
  const { items: budgetItems } = useBudget(activeEventId);
  const { gifts } = useCashGifts(activeEventId);
  const { vendors } = useVendors(activeEventId);
  const { invites } = useEventInvites(activeEventId);

  // Aggregate mode: one-shot counts across all events
  const fetchAggregate = useCallback(async () => {
    const db = getFirestoreClient();
    if (!db || events.length === 0) { setAgg(EMPTY); return; }
    setAggLoading(true);
    const acc: ReportSnapshot = { ...EMPTY };
    for (const ev of events.slice(0, MAX_AGGREGATE_EVENTS)) {
      try {
        const [g, t, b, gi] = await Promise.all([
          getDocs(collection(db, 'events', ev.id, 'guests')),
          getDocs(collection(db, 'events', ev.id, 'tasks')),
          getDocs(collection(db, 'events', ev.id, 'budget')),
          getDocs(collection(db, 'events', ev.id, 'gifts')),
        ]);
        g.forEach((doc) => {
          const d: any = doc.data();
          acc.guestsTotal += 1;
          const rsvp = d?.rsvp ?? 'pending';
          if (rsvp === 'confirmed') acc.confirmed += 1;
          else if (rsvp === 'declined') acc.declined += 1;
          else acc.pending += 1;
          if (d?.inviteSentAt || d?.inviteToken) acc.invitesSent += 1;
          if (d?.isVIP) acc.vipCount += 1;
        });
        t.forEach((doc) => {
          acc.tasksTotal += 1;
          if (doc.data()?.status === 'done') acc.tasksDone += 1;
        });
        b.forEach((doc) => {
          const d: any = doc.data();
          acc.budgetEstimated += Number(d?.estimatedCost) || 0;
          acc.budgetActual += Number(d?.actualCost) || 0;
          acc.budgetPaid += Number(d?.depositPaid) || (d?.isPaid ? Number(d?.actualCost) || 0 : 0);
        });
        gi.forEach((doc) => {
          const d: any = doc.data();
          const amount = Number(d?.amount) || 0;
          if (d?.status === 'completed') acc.giftsReceived += amount;
          else if (d?.status === 'pending') acc.giftsPledged += amount;
        });
      } catch { /* skip unreadable event */ }
    }
    setAgg(acc);
    setAggLoading(false);
  }, [events]);

  useEffect(() => {
    if (scope === 'all' && !eventsLoading) fetchAggregate();
  }, [scope, eventsLoading, fetchAggregate]);

  // Single-event snapshot from live hook data
  const single: ReportSnapshot = useMemo(() => ({
    guestsTotal: guests.length,
    confirmed: guests.filter((g: any) => g.rsvp === 'confirmed').length,
    pending: guests.filter((g: any) => (g.rsvp ?? 'pending') === 'pending').length,
    declined: guests.filter((g: any) => g.rsvp === 'declined').length,
    invitesSent: guests.filter((g: any) => g.inviteSentAt || g.inviteToken).length,
    vipCount: guests.filter((g: any) => g.isVIP).length,
    tasksDone: tasks.filter((t: any) => t.status === 'done').length,
    tasksTotal: tasks.length,
    budgetEstimated: budgetItems.reduce((s: number, b: any) => s + (Number(b.estimatedCost) || 0), 0),
    budgetActual: budgetItems.reduce((s: number, b: any) => s + (Number(b.actualCost) || 0), 0),
    budgetPaid: budgetItems.reduce((s: number, b: any) => s + (Number(b.depositPaid) || (b.isPaid ? Number(b.actualCost) || 0 : 0)), 0),
    giftsReceived: gifts.filter((g: any) => g.status === 'completed').reduce((s: number, g: any) => s + (Number(g.amount) || 0), 0),
    giftsPledged: gifts.filter((g: any) => g.status === 'pending').reduce((s: number, g: any) => s + (Number(g.amount) || 0), 0),
    vendorsTotal: vendors.reduce((s: number, v: any) => s + (Number(v.totalAmount) || 0), 0),
    vendorPaid: vendors.reduce((s: number, v: any) => s + (Number(v.depositPaid) || 0), 0),
  }), [guests, tasks, budgetItems, gifts, vendors]);

  const report = scope === 'all' ? agg : single;
  const loading = eventsLoading || (scope === 'all' && aggLoading);

  // Chart datasets
  const rsvpData = useMemo(() => [
    { name: 'Confirmed', value: report.confirmed },
    { name: 'Pending', value: report.pending },
    { name: 'Declined', value: report.declined },
  ], [report]);

  const taskData = useMemo(() => [
    { name: 'To do', value: Math.max(0, report.tasksTotal - report.tasksDone) },
    { name: 'Completed', value: report.tasksDone },
  ], [report]);

  const budgetData = useMemo(() => {
    if (scope === 'all') return [];
    const map: Record<string, { name: string; Estimated: number; Actual: number }> = {};
    budgetItems.forEach((b: any) => {
      const key = b.category || 'Other';
      map[key] = map[key] || { name: key, Estimated: 0, Actual: 0 };
      map[key].Estimated += Number(b.estimatedCost) || 0;
      map[key].Actual += Number(b.actualCost) || 0;
    });
    return Object.values(map).sort((a, b) => b.Actual - a.Actual).slice(0, 6);
  }, [scope, budgetItems]);

  const giftData = useMemo(() => {
    if (scope === 'all') {
      // No fabricated per-event series — aggregated gift totals aren't available
      // without per-event subcollection reads. The chart shows an honest empty
      // state until a specific event is selected.
      return [];
    }
    const map: Record<string, number> = {};
    gifts.forEach((g: any) => {
      const key = g.giftType || 'cash';
      map[key] = (map[key] || 0) + (Number(g.amount) || 0);
    });
    return Object.entries(map).map(([name, total]) => ({ name, total }));
  }, [scope, events, gifts]);

  const exportCSV = () => {
    if (scope === 'all') return;
    const header = 'Name,Email,RSVP,Dietary,VIP,Invite Sent\n';
    const rows = guests.map((g: any) =>
      [g.name, g.email ?? '', g.rsvp ?? 'pending', g.dietary ?? 'none', g.isVIP ? 'yes' : 'no', g.inviteSentAt || g.inviteToken ? 'yes' : 'no']
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guest-report-${scope}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rsvpRate = report.guestsTotal > 0 ? Math.round((report.confirmed / report.guestsTotal) * 100) : 0;
  const taskRate = report.tasksTotal > 0 ? Math.round((report.tasksDone / report.tasksTotal) * 100) : 0;
  const budgetPct = report.budgetEstimated > 0 ? Math.min(100, Math.round((report.budgetActual / report.budgetEstimated) * 100)) : 0;

  // Money renders in the selected event's currency. "All events" aggregates
  // across events (potentially mixed currencies) — we keep the numeric sum and
  // format with the default USD until per-event conversion exists (see
  // lib/currency.ts). Single-event scope below is always exact.
  const activeEvent = scope === 'all' ? null : events.find((e: any) => e.id === scope) ?? null;
  const reportCurrency = activeEvent?.currency;

  const kpis = [
    { label: 'Guests', value: report.guestsTotal, sub: `${report.vipCount} VIP`, icon: Users, tint: 'from-indigo-500 to-violet-600' },
    { label: 'RSVP rate', value: `${rsvpRate}%`, sub: `${report.confirmed} confirmed · ${report.pending} pending`, icon: UserCheck, tint: 'from-emerald-500 to-teal-600' },
    { label: 'Invites sent', value: report.invitesSent, sub: `${report.declined} declined`, icon: Mail, tint: 'from-rose-500 to-pink-600' },
    { label: 'Tasks done', value: `${taskRate}%`, sub: `${report.tasksDone} of ${report.tasksTotal}`, icon: CheckCircle2, tint: 'from-sky-500 to-cyan-600' },
    { label: 'Budget used', value: `${budgetPct}%`, sub: `${formatMoney(report.budgetActual, reportCurrency)} of ${formatMoney(report.budgetEstimated, reportCurrency)}`, icon: TrendingUp, tint: 'from-amber-500 to-orange-600' },
    { label: 'Gifts received', value: formatMoney(report.giftsReceived, reportCurrency), sub: report.giftsPledged > 0 ? `${formatMoney(report.giftsPledged, reportCurrency)} pledged` : 'no pledges pending', icon: Gift, tint: 'from-fuchsia-500 to-purple-600' },
  ];

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* ── Header ─────────────────────────────────────────────── */}
        <motion.div initial="hidden" animate="visible" variants={stagger} className="mb-8">
          <motion.div variants={fadeUp} className="aurora relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-violet-700 to-secondary p-8 text-white shadow-[var(--shadow-glow)] md:p-10">
            <div className="aurora-orb orb-a -right-16 -top-20 h-72 w-72 bg-white/15" />
            <div className="aurora-orb orb-b -bottom-24 -left-12 h-72 w-72 bg-white/10" />
            <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="glass mb-3 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm text-white">
                  <BarChart3 className="h-4 w-4" /> Insights &amp; Reports
                </div>
                <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
                  Your ceremony <span className="text-white/85">intelligence</span>
                </h1>
                <p className="mt-2 max-w-lg text-white/85">RSVPs, tasks, budget pacing, and gifts — across one event or your whole portfolio.</p>
              </div>
              <div className="glass-strong flex flex-col gap-2 rounded-2xl p-4 text-foreground">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Report scope</span>
                <select value={scope} onChange={(e: any) => setScope(e?.target?.value ?? 'all')}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                  <option value="all">All events (aggregate)</option>
                  {events.map((e: any) => <option key={e.id} value={e.id}>{e.title}</option>)}
                </select>
                {scope === 'all' && (
                  <Button size="sm" variant="outline" className="gap-1.5 rounded-full" onClick={fetchAggregate} disabled={aggLoading}>
                    <RefreshCw className={`h-3.5 w-3.5 ${aggLoading ? 'animate-spin' : ''}`} /> Refresh
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* ── KPI cards ──────────────────────────────────────────── */}
        <motion.div initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.06 } } }} className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k: any) => (
            <motion.div key={k.label} variants={fadeUp} className="spotlight rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur-sm">
              <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${k.tint} text-white`}>
                <k.icon className="h-4 w-4" />
              </div>
              <p className="font-display text-2xl font-bold">{loading ? '…' : k.value}</p>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k.label}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{loading ? '' : k.sub}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Charts ─────────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-8">
          <ReportCharts rsvp={rsvpData} tasks={taskData} budget={budgetData} gifts={giftData} currency={reportCurrency} />
        </motion.div>

        {/* ── Guest report table (single-event mode) ─────────────── */}
        {scope !== 'all' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-strong rounded-2xl shadow-[var(--shadow-md)]">
            <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
              <div>
                <h2 className="font-display text-lg font-semibold">Guest report</h2>
                <p className="text-xs text-muted-foreground">
                  {report.guestsTotal} guests · {report.invitesSent} invited
                  {(() => { const ev: any = events.find((e: any) => e.id === scope); const d = ev ? eventDate(ev) : null; return d ? ` · ${d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}` : ''; })()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5 rounded-full" onClick={exportCSV} disabled={guests.length === 0}>
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </Button>
                <Link href={`/events/${scope}`}>
                  <Button size="sm" className="gap-1.5 rounded-full">
                    Open event <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
            <div className="divide-y divide-border/40">
              {guests.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-muted-foreground">
                  <Hourglass className="mx-auto mb-2 h-5 w-5" /> No guests in this event yet — add them from the event&apos;s Guests tab.
                </p>
              ) : (
                guests.slice(0, 50).map((g: any) => (
                  <div key={g.id} className="flex items-center gap-3 px-6 py-3">
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${g.rsvp === 'confirmed' ? 'bg-emerald-500' : g.rsvp === 'declined' ? 'bg-rose-500' : 'bg-slate-400'}`}>
                      {(g.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {g.name}
                        {g.isVIP && <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-500">VIP</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{g.email || '—'}</p>
                    </div>
                    <span className={`hidden rounded-full px-2.5 py-1 text-xs font-medium sm:block ${
                      g.rsvp === 'confirmed' ? 'bg-emerald-500/15 text-emerald-500'
                      : g.rsvp === 'declined' ? 'bg-rose-500/15 text-rose-500'
                      : 'bg-muted text-muted-foreground'}`}>
                      {g.rsvp ?? 'pending'}
                    </span>
                    {g.dietary && g.dietary !== 'none' && (
                      <span className="hidden rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary md:block">{g.dietary}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}

        {scope === 'all' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="glass rounded-2xl p-6 text-center text-sm text-muted-foreground">
            <UserX className="mx-auto mb-2 h-5 w-5" />
            Select a specific event from the scope picker to drill into its guest-level report and CSV export.
          </motion.div>
        )}
      </div>
    </div>
  );
}