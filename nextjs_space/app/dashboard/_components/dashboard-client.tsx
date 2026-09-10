'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useSubscription } from '@/lib/hooks/use-subscription';
import { Navbar } from '@/components/navbar';
import { SiteFooter } from '@/components/site-footer';
import { SessionGovernancePanel } from '@/components/session-governance-panel';
import { Button } from '@/components/ui/button';
import {
  Plus, Calendar, Users, Gift, Sparkles, TrendingUp, ArrowRight,
  PartyPopper, Heart, Star, BarChart3, Clock3, UserCheck, Mail
} from 'lucide-react';
import type { EventData } from '@/types/firestore';

const fadeUp = { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } };
const stagger = { visible: { transition: { staggerChildren: 0.08 } } };

function eventDate(e: any): Date | null {
  const d = e?.date?.toDate?.() ?? (e?.date ? new Date(e.date) : null);
  return d && !isNaN(d.getTime()) ? d : null;
}

export function DashboardClient() {
  const router = useRouter();
  const { user } = useAuth();
  const { subscription } = useSubscription();
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    const db = getFirestoreClient();
    if (!db) { setLoading(false); return; }

    const loadEvents = async () => {
      try {
        // No orderBy in the query: where+orderBy on different fields requires a
        // composite index. Sort client-side instead (same fix as subcollections).
        const q = query(collection(db, 'events'), where('hostId', '==', user!.uid), limit(50));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as EventData));
        setEvents(data);
      } catch {
        setEvents([]);
      }
      setLoading(false);
    };
    loadEvents();
  }, [user?.uid]);

  const dated = useMemo(() => events.map((e: any) => ({ ...e, _date: eventDate(e) })), [events]);
  const upcoming = useMemo(() => dated.filter((e: any) => e._date && (now == null || e._date.getTime() > now)).sort((a: any, b: any) => a._date - b._date), [dated, now]);
  const nextEvent = upcoming[0];
  const totalGuests = events.reduce((sum: number, e: any) => sum + (e.guestCount || 0), 0);
  const activePlan = subscription?.tier || (events.find((e: any) => e.tier === 'premium') ? 'premium' : 'free');
  const isPremium = activePlan === 'premium';
  const maxGuests = isPremium ? 250 : 25;

  const countdown = useMemo(() => {
    if (now == null || !nextEvent?._date) return null;
    const diff = Math.max(0, nextEvent._date.getTime() - now);
    return { days: Math.floor(diff / 86_400_000), hours: Math.floor((diff % 86_400_000) / 3_600_000) };
  }, [now, nextEvent]);

  const statCards = [
    { label: 'Upcoming Ceremonies', value: upcoming.length, icon: Calendar, tint: 'from-indigo-500 to-violet-600', glow: 'bg-primary/10' },
    { label: 'Total Guests', value: totalGuests, icon: Users, tint: 'from-rose-500 to-pink-600', glow: 'bg-rose-500/10' },
    { label: 'Current Plan', value: isPremium ? 'Premium' : 'Free', icon: isPremium ? Star : Sparkles, tint: isPremium ? 'from-amber-500 to-orange-600' : 'from-emerald-500 to-teal-600', glow: 'bg-amber-500/10' },
    { label: 'Reports', value: 'View', icon: BarChart3, tint: 'from-sky-500 to-cyan-600', glow: 'bg-sky-500/10', href: '/reports' },
  ];

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* ── Cinematic hero ─────────────────────────────────────── */}
        <motion.div initial="hidden" animate="visible" variants={stagger} className="mb-8">
          <motion.div variants={fadeUp} className="aurora relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-violet-700 to-secondary p-8 text-white shadow-[var(--shadow-glow)] md:p-12">
            <div className="aurora-orb orb-a -right-20 -top-24 h-80 w-80 bg-white/15" />
            <div className="aurora-orb orb-b -bottom-28 -left-16 h-96 w-96 bg-white/10" />
            <div className="aurora-orb orb-c right-1/3 top-1/2 h-56 w-56 bg-white/10" />

            <div className="relative z-10 flex flex-col gap-10 md:flex-row md:items-center md:justify-between">
              <div className="max-w-xl">
                <div className="glass mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm text-white">
                  <PartyPopper className="h-4 w-4" /> Welcome back
                </div>
                <h1 className="font-display text-3xl font-bold leading-tight tracking-tight md:text-5xl">
                  {user?.displayName || user?.email?.split('@')[0] || 'Planner'}&apos;s
                  <span className="block text-white/85">ceremony command center</span>
                </h1>
                <p className="mt-4 text-white/85">
                  {events.length === 0
                    ? 'Ready to plan your first ceremony? Let us make something unforgettable.'
                    : `${upcoming.length} upcoming · ${totalGuests} guests across ${events.length} event${events.length !== 1 ? 's' : ''}`}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button onClick={() => router.push('/events/new')} className="btn-shimmer gap-2 rounded-full bg-white text-primary hover:bg-white/90">
                    <Plus className="h-4 w-4" /> Create New Event
                  </Button>
                  <Link href="/reports">
                    <Button variant="ghost" className="glass gap-2 rounded-full text-white hover:text-white">
                      <BarChart3 className="h-4 w-4" /> View Reports
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Countdown card */}
              <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}
                className="glass-strong w-full max-w-xs flex-shrink-0 rounded-2xl p-6 text-foreground md:w-64">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" /> Next ceremony
                </div>
                {nextEvent ? (
                  <>
                    <p className="mt-2 truncate font-display text-lg font-bold">{nextEvent.title}</p>
                    <div className="mt-4 flex items-end gap-3">
                      <div>
                        <p className="font-display text-5xl font-bold text-gradient">{countdown ? countdown.days : '—'}</p>
                        <p className="text-xs text-muted-foreground">days</p>
                      </div>
                      <div>
                        <p className="font-display text-2xl font-bold">{countdown ? countdown.hours : '—'}</p>
                        <p className="text-xs text-muted-foreground">hours</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {nextEvent._date ? nextEvent._date.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }) : 'Date TBD'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-sm text-muted-foreground">No upcoming ceremony yet.</p>
                    <Button size="sm" onClick={() => router.push('/events/new')} className="mt-4 w-full gap-1.5 rounded-full">
                      <Plus className="h-3.5 w-3.5" /> Plan one now
                    </Button>
                  </>
                )}
              </motion.div>
            </div>
          </motion.div>
        </motion.div>

        {/* ── Stat cards ─────────────────────────────────────────── */}
        <motion.div initial="hidden" animate="visible" variants={stagger} className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {statCards.map((stat: any) => (
            <motion.div key={stat.label} variants={fadeUp}
              onClick={() => stat.href && router.push(stat.href)}
              className={`spotlight group relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-5 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-md)] ${stat.href ? 'cursor-pointer' : ''}`}>
              <div className="relative z-10 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 font-display text-3xl font-bold">{stat.value}</p>
                </div>
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${stat.tint} text-white shadow-sm`}>
                  <stat.icon className="h-5 w-5" />
                </div>
              </div>
              <div className={`absolute -bottom-7 -right-7 h-20 w-20 rounded-full ${stat.glow} transition-transform duration-500 group-hover:scale-[1.7]`} />
            </motion.div>
          ))}
        </motion.div>

        {/* ── Content grid ───────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-strong rounded-2xl shadow-[var(--shadow-md)]">
              <div className="flex items-center justify-between border-b border-border/50 px-6 py-4">
                <h2 className="font-display text-lg font-semibold">Your Ceremonies</h2>
                <Button onClick={() => router.push('/events/new')} size="sm" className="gap-1.5 rounded-full">
                  <Plus className="h-3.5 w-3.5" /> New
                </Button>
              </div>
              <div className="divide-y divide-border/40">
                {loading ? (
                  <div className="flex items-center justify-center py-14">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : events.length === 0 ? (
                  <div className="px-6 py-14 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                      <Calendar className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="mb-2 font-display text-lg font-semibold">No ceremonies yet</h3>
                    <p className="mx-auto mb-5 max-w-sm text-sm text-muted-foreground">
                      Create your first ceremony to unlock timelines, guest management, seating, and reporting.
                    </p>
                    <Button onClick={() => router.push('/events/new')} className="gap-2 rounded-full">
                      <Plus className="h-4 w-4" /> Create Your First Ceremony
                    </Button>
                  </div>
                ) : (
                  dated.map((event: any) => (
                    <motion.div key={event.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                      className="group flex cursor-pointer items-center gap-4 px-6 py-4 transition-colors hover:bg-primary/5"
                      onClick={() => router.push(`/events/${event.id}`)}>
                      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${event.tier === 'premium' ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-primary to-violet-600'}`}>
                        <Calendar className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-medium">{event.title}</h3>
                          {event.tier === 'premium' && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500">Premium</span>
                          )}
                          {now != null && event._date && event._date.getTime() <= now && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Past</span>
                          )}
                        </div>
                        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{event._date ? event._date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBD'}</span>
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{event.guestCount || 0}</span>
                          <span className="hidden h-1 w-24 overflow-hidden rounded-full bg-muted sm:block">
                            <span className="block h-full rounded-full bg-gradient-to-r from-primary to-secondary" style={{ width: `${Math.min(100, Math.round(((event.guestCount || 0) / maxGuests) * 100))}%` }} />
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </div>

          <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm backdrop-blur-sm">
              <h3 className="mb-3 font-display text-lg font-semibold">Subscription</h3>
              {isPremium ? (
                <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-orange-500/10 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Star className="h-5 w-5 text-amber-500" />
                    <span className="font-semibold text-amber-500">Premium Active</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Everything unlocked — seating, budget, gifts &amp; coordinator.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 to-violet-500/10 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <span className="font-semibold">Free Plan</span>
                  </div>
                  <p className="mb-3 text-sm text-muted-foreground">{maxGuests} guests per ceremony · premium features locked</p>
                  <Button onClick={() => router.push('/pricing')} size="sm" className="btn-shimmer w-full gap-1.5 rounded-full">
                    <TrendingUp className="h-3.5 w-3.5" /> Upgrade Now
                  </Button>
                </div>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
              className="border-glow cursor-pointer rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm backdrop-blur-sm transition-transform hover:-translate-y-0.5"
              onClick={() => router.push('/reports')}>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold">Insights &amp; Reports</h3>
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">RSVP breakdowns, task completion, budget pacing, and gift totals — across every ceremony.</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">Open reports <ArrowRight className="h-3.5 w-3.5" /></span>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm backdrop-blur-sm">
              <h3 className="mb-3 font-display text-lg font-semibold">Quick Tips</h3>
              <div className="space-y-3">
                {[
                  { icon: Mail, tint: 'bg-secondary/15 text-secondary', title: 'Broadcast your invitation', desc: 'Upload a design and send it to every guest' },
                  { icon: UserCheck, tint: 'bg-primary/10 text-primary', title: 'Track RSVPs live', desc: 'Guests respond on your public invite page' },
                  { icon: Gift, tint: 'bg-emerald-500/10 text-emerald-500', title: 'Receive digital gifts', desc: 'Cash gifts & honeymoon funds on your gift page' },
                ].map((tip: any) => (
                  <div key={tip.title} className="flex gap-3">
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${tip.tint}`}>
                      <tip.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{tip.title}</p>
                      <p className="text-xs text-muted-foreground">{tip.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        {/* ── Session governance ───────────────────────────────────── */}
        <SessionGovernancePanel />
      </div>

      <SiteFooter />
    </div>
  );
}