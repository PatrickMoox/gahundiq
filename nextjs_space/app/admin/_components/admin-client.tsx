'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { useAuth } from '@/lib/auth-context';
import { useAdminDirectory, type DirectoryUser } from '@/lib/hooks/use-subscription';
import { getFirestoreClient } from '@/lib/firebase';
import { Navbar } from '@/components/navbar';
import { SiteFooter } from '@/components/site-footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { AlertTriangle, BarChart3, ChevronDown, CreditCard, Crown, Download, ExternalLink, Loader2, RefreshCw, Search, ShieldCheck, Star, Trash2, Users } from 'lucide-react';
import type { EventType, PublicReview, SubscriptionStatus, Tier } from '@/types/firestore';

interface SubscriptionDraft {
  tier: Tier;
  status: SubscriptionStatus;
  billingCycle: 'monthly' | 'per_event';
  price: number;
  maxEvents: number;
  periodEnd: string;
}

interface AdminEventRow {
  id: string;
  hostId: string;
  hostEmail: string;
  title: string;
  tier: Tier;
  guestCount: number;
  date: Date | null;
  venue: string;
}

const DEFAULT_MAX_EVENTS: Record<Tier, number> = { free: 1, premium: 10 };

interface ReviewRow extends PublicReview {
  id: string;
}

function toInputDate(value: any): string {
  if (!value) return '';
  const date = value?.toDate instanceof Function ? value.toDate() : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function AdminClient() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const isAdmin = Boolean(user && user.role === 'admin');
  const { users, loading: directoryLoading } = useAdminDirectory(isAdmin);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SubscriptionDraft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [userEvents, setUserEvents] = useState<Record<string, AdminEventRow[]>>({});
  const [eventsLoadingId, setEventsLoadingId] = useState<string | null>(null);
  const [allEvents, setAllEvents] = useState<AdminEventRow[]>([]);
  const [platform, setPlatform] = useState({ ceremonies: 0, owners: 0, premiumEvents: 0 });
  const [view, setView] = useState<'users' | 'events' | 'reviews'>('users');
  const [adminUids, setAdminUids] = useState<Set<string>>(new Set());
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewDraft, setReviewDraft] = useState({ author: '', quote: '', rating: '5', eventType: '' });
  const [searchEvents, setSearchEvents] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | Tier>('all');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) router.replace('/dashboard');
  }, [loading, router, user]);

  const loadPlatformData = useCallback(async () => {
    const db = getFirestoreClient();
    if (!db) return;
    setRefreshing(true);
    try {
      const [eventsSnap, adminSnap] = await Promise.all([
        getDocs(collection(db, 'events')),
        getDocs(collection(db, 'admin')),
      ]);
      const rows: AdminEventRow[] = eventsSnap.docs.map((d) => {
        const data = d.data() as any;
        const raw = data.date?.toDate instanceof Function ? data.date.toDate() : (data.date ? new Date(data.date) : null);
        return {
          id: d.id,
          hostId: data.hostId ?? '',
          hostEmail: '',
          title: data.title ?? 'Untitled event',
          tier: (data.tier ?? 'free') as Tier,
          guestCount: Number(data.guestCount) || 0,
          date: raw && !Number.isNaN(raw.getTime()) ? raw : null,
          venue: data.venue ?? '',
        };
      });
      rows.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
      setAllEvents(rows);
      setAdminUids(new Set(adminSnap.docs.map((d) => d.id)));
      setPlatform({
        ceremonies: rows.length,
        owners: new Set(rows.map((e) => e.hostId)).size,
        premiumEvents: rows.filter((e) => e.tier === 'premium').length,
      });
    } catch {
      toast.error('Could not load platform data.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadPlatformData();
  }, [isAdmin, loadPlatformData]);

  const fetchReviews = useCallback(async () => {
    const db = getFirestoreClient();
    if (!db) return;
    setReviewsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'reviews'));
      setReviews(snap.docs.map((d) => ({ id: d.id, ...(d.data() as PublicReview) })));
    } catch {
      toast.error('Could not load reviews.');
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin && view === 'reviews') fetchReviews();
  }, [isAdmin, view, fetchReviews]);

  const saveReview = async () => {
    const db = getFirestoreClient();
    if (!db) return;
    const rating = Number(reviewDraft.rating);
    if (!(rating >= 0.5 && rating <= 5)) { toast.error('Rating must be between 0.5 and 5.'); return; }
    if (!reviewDraft.quote.trim()) { toast.error('Add the review quote first.'); return; }
    setBusyId('review-new');
    try {
      const ref = doc(collection(db, 'reviews'));
      const payload: Record<string, any> = {
        rating,
        author: reviewDraft.author.trim() || 'Verified host',
        quote: reviewDraft.quote.trim(),
        createdAt: serverTimestamp(),
        approvedAt: serverTimestamp(),
      };
      if (reviewDraft.eventType) payload.eventType = reviewDraft.eventType as EventType;
      await setDoc(ref, payload);
      setReviewDraft({ author: '', quote: '', rating: '5', eventType: '' });
      await fetchReviews();
      toast.success('Review published — the stars are live on the landing and sign-in pages.');
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not publish the review.');
    } finally {
      setBusyId(null);
    }
  };

  const deleteReview = async (id: string) => {
    const db = getFirestoreClient();
    if (!db) return;
    if (!window.confirm('Delete this review? The public stars update immediately.')) return;
    setBusyId(id);
    try {
      await deleteDoc(doc(db, 'reviews', id));
      setReviews((prev) => prev.filter((r) => r.id !== id));
      toast.success('Review deleted.');
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not delete the review.');
    } finally {
      setBusyId(null);
    }
  };

  const fetchUserEvents = useCallback(async (uid: string) => {
    const db = getFirestoreClient();
    if (!db) return;
    setEventsLoadingId(uid);
    try {
      const snapshot = await getDocs(query(collection(db, 'events'), where('hostId', '==', uid)));
      const rows: AdminEventRow[] = snapshot.docs.map((d) => {
        const data = d.data() as any;
        const raw = data.date?.toDate instanceof Function ? data.date.toDate() : (data.date ? new Date(data.date) : null);
        return {
          id: d.id,
          hostId: uid,
          hostEmail: '',
          title: data.title ?? 'Untitled event',
          tier: (data.tier ?? 'free') as Tier,
          guestCount: Number(data.guestCount) || 0,
          date: raw && !Number.isNaN(raw.getTime()) ? raw : null,
          venue: data.venue ?? '',
        };
      });
      rows.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
      setUserEvents((prev) => ({ ...prev, [uid]: rows }));
    } catch {
      setUserEvents((prev) => ({ ...prev, [uid]: [] }));
    } finally {
      setEventsLoadingId(null);
    }
  }, []);

  const setEventTier = async (uid: string, eventId: string, tier: Tier) => {
    const db = getFirestoreClient();
    if (!db) return;
    setBusyId(eventId);
    try {
      await updateDoc(doc(db, 'events', eventId), { tier, updatedAt: serverTimestamp() });
      setUserEvents((prev) => ({
        ...prev,
        [uid]: (prev[uid] ?? []).map((e) => (e.id === eventId ? { ...e, tier } : e)),
      }));
      setAllEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, tier } : e)));
      toast.success(`Event set to ${tier}.`);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not update the event tier.');
    } finally {
      setBusyId(null);
    }
  };

  // ── Superuser actions ─────────────────────────────────────────────

  const toggleAdmin = async (uid: string, email: string, grant: boolean) => {
    const db = getFirestoreClient();
    if (!db) return;
    if (uid === user?.uid && !grant) { toast.error('You cannot revoke your own admin access.'); return; }
    const action = grant ? 'Grant admin' : 'Revoke admin';
    if (!window.confirm(`${action} for ${email ?? uid}? ${grant ? 'They will have full platform access.' : 'They will lose all admin rights.'}`)) return;
    setBusyId(uid);
    try {
      if (grant) {
        await setDoc(doc(db, 'admin', uid), { grantedAt: serverTimestamp(), grantedBy: `admin:${user?.uid}` });
      } else {
        await deleteDoc(doc(db, 'admin', uid));
      }
      setAdminUids((prev) => {
        const next = new Set(prev);
        if (grant) next.add(uid); else next.delete(uid);
        return next;
      });
      toast.success(`${action}: ${email ?? uid}. Takes effect on their next page load.`);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not update admin role.');
    } finally {
      setBusyId(null);
    }
  };

  const setEventTierGlobal = async (eventId: string, tier: Tier) => {
    const db = getFirestoreClient();
    if (!db) return;
    setBusyId(eventId);
    try {
      await updateDoc(doc(db, 'events', eventId), { tier, updatedAt: serverTimestamp() });
      setAllEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, tier } : e)));
      toast.success(`Event set to ${tier}.`);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not update the event tier.');
    } finally {
      setBusyId(null);
    }
  };

  const deleteEventGlobal = async (ev: AdminEventRow) => {
    const db = getFirestoreClient();
    if (!db) return;
    if (!window.confirm(`Permanently delete "${ev.title}" and all its data (guests, tasks, budget, gifts)? This cannot be undone.`)) return;
    setBusyId(ev.id);
    try {
      await deleteDoc(doc(db, 'events', ev.id));
      setAllEvents((prev) => prev.filter((e) => e.id !== ev.id));
      setPlatform((p) => ({ ...p, ceremonies: p.ceremonies - 1, premiumEvents: ev.tier === 'premium' ? p.premiumEvents - 1 : p.premiumEvents }));
      toast.success(`Deleted "${ev.title}".`);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not delete the event.');
    } finally {
      setBusyId(null);
    }
  };

  const exportEventsCSV = () => {
    const header = 'Event,Host,Tier,Guests,Date,Venue\n';
    const rows = allEvents.map((e) =>
      [e.title, hostEmailOf(e.hostId), e.tier, String(e.guestCount), e.date ? e.date.toISOString().slice(0, 10) : '', e.venue].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `platform-events-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Event report exported.');
  };

  const hostEmailOf = (hostId: string): string => users.find((u) => u.id === hostId)?.email ?? hostId.slice(0, 10);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => `${u.email ?? ''} ${u.displayName ?? ''}`.toLowerCase().includes(q));
  }, [search, users]);

  const paidAccounts = users.filter((u) => u.subscription?.tier === 'premium').length;

  const openEditor = (u: DirectoryUser) => {
    const next = expandedId === u.id ? null : u.id;
    setExpandedId(next);
    if (next && !userEvents[u.id]) fetchUserEvents(u.id);
    setDrafts((prev) => prev[u.id] ? prev : {
      ...prev,
      [u.id]: {
        tier: u.subscription?.tier ?? 'free',
        status: u.subscription?.status ?? 'active',
        billingCycle: u.subscription?.billingCycle ?? 'per_event',
        price: u.subscription?.price ?? 0,
        maxEvents: u.subscription?.maxEvents ?? DEFAULT_MAX_EVENTS[u.subscription?.tier ?? 'free'],
        periodEnd: toInputDate(u.subscription?.currentPeriodEnd),
      },
    });
  };

  const updateDraft = (id: string, patch: Partial<SubscriptionDraft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const saveSubscription = async (u: DirectoryUser) => {
    const db = getFirestoreClient();
    const draft = drafts[u.id];
    if (!db || !draft || !user) return;
    setBusyId(u.id);
    try {
      const eventsSnap = await getDocs(query(collection(db, 'events'), where('hostId', '==', u.id)));
      const payload: Record<string, any> = {
        userId: u.id,
        tier: draft.tier,
        status: draft.status,
        billingCycle: draft.billingCycle,
        price: Number(draft.price) || 0,
        maxEvents: Number(draft.maxEvents) || DEFAULT_MAX_EVENTS[draft.tier],
        activeEventCount: eventsSnap.size,
        updatedAt: serverTimestamp(),
        updatedBy: `admin:${user.uid}`,
      };
      payload.currentPeriodEnd = draft.periodEnd ? new Date(`${draft.periodEnd}T23:59:59`) : null;
      if (!u.subscription) payload.createdAt = serverTimestamp();
      await setDoc(doc(db, 'subscriptions', u.id), payload, { merge: true });
      // Materialize the plan onto the user's events so every gate, badge, and
      // dashboard reflects the change immediately (rules read event.tier).
      const updated = await applyTierToEvents(u.id, draft.tier);
      toast.success(`Subscription updated for ${u.email ?? u.id}.${updated > 0 ? ` ${updated} event${updated === 1 ? '' : 's'} set to ${draft.tier}.` : ''}`);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not update the subscription.');
    } finally {
      setBusyId(null);
    }
  };

  const applyTierToEvents = async (targetUid: string, tier: Tier): Promise<number> => {
    const db = getFirestoreClient();
    if (!db) return 0;
    const eventsSnap = await getDocs(query(collection(db, 'events'), where('hostId', '==', targetUid)));
    if (eventsSnap.empty) return 0;
    const batch = writeBatch(db);
    eventsSnap.docs.forEach((eventDoc) => batch.update(eventDoc.ref, { tier, updatedAt: serverTimestamp() }));
    await batch.commit();
    return eventsSnap.size;
  };

  const handleApplyTier = async (u: DirectoryUser) => {
    const draft = drafts[u.id];
    if (!draft) return;
    setBusyId(u.id);
    try {
      const count = await applyTierToEvents(u.id, draft.tier);
      if (count === 0) { toast.info('This user has no events to update.'); return; }
      toast.success(`${count} event${count === 1 ? '' : 's'} set to ${draft.tier}.`);
    } catch (error: any) {
      toast.error(error?.message ?? "Could not update the user's events.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading || !user || user.role !== 'admin') {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Checking admin access...</div>;
  }

  const stats = [
    { label: 'Registered users', value: String(users.length), detail: directoryLoading ? 'Loading...' : 'Live from Firestore', icon: Users },
    { label: 'Paid accounts', value: String(paidAccounts), detail: `${users.length - paidAccounts} on free tier`, icon: CreditCard },
    { label: 'Active ceremonies', value: String(platform.ceremonies), detail: `Across ${platform.owners} owners`, icon: BarChart3 },
    { label: 'Premium ceremonies', value: String(platform.premiumEvents), detail: `${platform.ceremonies - platform.premiumEvents} on free tier`, icon: ShieldCheck },
  ];

  const exportUsersCSV = () => {
    const header = 'Email,Name,Tier,Status,Events\n';
    const rows = users.map((u) =>
      [u.email ?? '', u.displayName ?? '', u.subscription?.tier ?? 'none', u.subscription?.status ?? '-', String(userEvents[u.id]?.length ?? '-')].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `platform-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('User report exported.');
  };

  // Real support signals computed from live data (no mock values).
  const paymentIssues = users.filter((u) => u.subscription?.status === 'past_due' || u.subscription?.status === 'canceled');
  const unactivated = users.filter((u) => !u.subscription);
  const planMismatches = useMemo(() => {
    const activePremiumHosts = new Set(users.filter((u) => u.subscription?.tier === 'premium' && u.subscription?.status !== 'canceled').map((u) => u.id));
    return allEvents.filter((e) => e.tier === 'premium' && !activePremiumHosts.has(e.hostId)).length;
  }, [users, allEvents]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-[1200px] px-4 py-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-primary"><ShieldCheck className="h-4 w-4" /> Administrator control center</div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Platform administration</h1>
            <p className="mt-1 text-muted-foreground">Support users: inspect accounts, adjust subscriptions, and manage their ceremonies.</p>
          </div>
          <Button variant="outline" onClick={exportUsersCSV} className="gap-2"><Download className="h-4 w-4" /> Export user report (CSV)</Button>
        </div>

        <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border/50 bg-card p-5" style={{ boxShadow: 'var(--shadow-sm)' }}>
              <div className="flex items-center justify-between"><stat.icon className="h-5 w-5 text-primary" /><span className="text-xs text-emerald-600">Live</span></div>
              <p className="mt-4 text-sm text-muted-foreground">{stat.label}</p>
              <p className="font-display text-2xl font-bold">{stat.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.detail}</p>
            </div>
          ))}
        </section>

        {/* ── View switcher ─────────────────────────────────────── */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Button variant={view === 'users' ? 'default' : 'outline'} size="sm" className="gap-2 rounded-full" onClick={() => setView('users')}>
            <Users className="h-4 w-4" /> Users &amp; subscriptions
          </Button>
          <Button variant={view === 'events' ? 'default' : 'outline'} size="sm" className="gap-2 rounded-full" onClick={() => setView('events')}>
            <BarChart3 className="h-4 w-4" /> All events ({platform.ceremonies})
          </Button>
          <Button variant={view === 'reviews' ? 'default' : 'outline'} size="sm" className="gap-2 rounded-full" onClick={() => setView('reviews')}>
            <Star className="h-4 w-4" /> Reviews ({reviews.length})
          </Button>
          <Button variant="ghost" size="sm" className="gap-2 rounded-full" onClick={loadPlatformData} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {view === 'users' && (
        <section className="mb-8 rounded-xl border border-border/50 bg-card p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold">Users &amp; subscriptions</h2>
              <p className="mt-1 text-sm text-muted-foreground">Support controls: grant or revoke premium access, then apply the tier to the user&apos;s events.</p>
            </div>
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e: any) => setSearch(e?.target?.value ?? '')} placeholder="Search email or name" className="pl-9" />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {directoryLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading directory...</p>}
            {!directoryLoading && filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No users found. Users appear here after they sign up.</p>
            )}
            {filtered.map((u) => {
              const draft = drafts[u.id];
              const expanded = expandedId === u.id;
              const busy = busyId === u.id;
              return (
                <div key={u.id} className="rounded-lg border border-border/50">
                  <button type="button" onClick={() => openEditor(u)} className="flex w-full flex-col gap-2 p-4 text-left sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{u.displayName || u.email || u.id}</p>
                      <p className="text-xs text-muted-foreground">{u.email ?? u.id} &middot; {u.id.slice(0, 8)}...</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {u.subscription ? (
                        <>
                          <Badge variant={u.subscription.tier === 'premium' ? 'default' : 'secondary'} className="capitalize">{u.subscription.tier}</Badge>
                          {u.subscription.status && <Badge variant="outline" className="capitalize">{u.subscription.status}</Badge>}
                        </>
                      ) : (
                        <Badge variant="outline">No subscription</Badge>
                      )}
                      {adminUids.has(u.id) && (
                        <Badge className="gap-1 border border-amber-500/30 bg-amber-500/15 text-amber-600"><Crown className="h-3 w-3" /> Admin</Badge>
                      )}
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {expanded && draft && (
                    <div className="border-t border-border/50 p-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div><Label>Tier</Label>
                          <Select value={draft.tier} onValueChange={(v) => updateDraft(u.id, { tier: v as Tier, maxEvents: v === 'premium' ? DEFAULT_MAX_EVENTS.premium : DEFAULT_MAX_EVENTS.free })}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="free">Free</SelectItem>
                              <SelectItem value="premium">Premium</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label>Status</Label>
                          <Select value={draft.status} onValueChange={(v) => updateDraft(u.id, { status: v as SubscriptionStatus })}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="trialing">Trialing</SelectItem>
                              <SelectItem value="past_due">Past due</SelectItem>
                              <SelectItem value="canceled">Canceled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label>Billing cycle</Label>
                          <Select value={draft.billingCycle} onValueChange={(v) => updateDraft(u.id, { billingCycle: v as 'monthly' | 'per_event' })}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="per_event">Per event</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label htmlFor={`price-${u.id}`}>Price (USD)</Label>
                          <Input id={`price-${u.id}`} type="number" min="0" value={draft.price} onChange={(e: any) => updateDraft(u.id, { price: Number(e?.target?.value ?? 0) })} className="mt-1" />
                        </div>
                        <div><Label htmlFor={`max-events-${u.id}`}>Max events</Label>
                          <Input id={`max-events-${u.id}`} type="number" min="1" value={draft.maxEvents} onChange={(e: any) => updateDraft(u.id, { maxEvents: Number(e?.target?.value ?? 1) })} className="mt-1" />
                        </div>
                        <div><Label htmlFor={`period-${u.id}`}>Period ends (blank = open-ended)</Label>
                          <Input id={`period-${u.id}`} type="date" value={draft.periodEnd} onChange={(e: any) => updateDraft(u.id, { periodEnd: e?.target?.value ?? '' })} className="mt-1" />
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button onClick={() => saveSubscription(u)} disabled={busy} className="gap-2">
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Save subscription
                        </Button>
                        <Button variant="outline" onClick={() => handleApplyTier(u)} disabled={busy}>Apply tier to all events</Button>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Billing webhooks remain the source of truth; use these controls for manual support adjustments.</p>

                      {/* ── Role management ─────────────────────────── */}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                        <div>
                          <p className="flex items-center gap-1.5 text-sm font-medium"><Crown className="h-4 w-4 text-amber-500" /> Administrator role</p>
                          <p className="text-xs text-muted-foreground">{adminUids.has(u.id) ? 'This user has full platform access.' : 'Grant full platform access (events, users, subscriptions).'}</p>
                        </div>
                        {adminUids.has(u.id) ? (
                          <Button size="sm" variant="outline" className="border-rose-500/30 text-rose-600 hover:bg-rose-500/10" onClick={() => toggleAdmin(u.id, u.email ?? '', false)} disabled={busy || u.id === user?.uid}>
                            Revoke admin
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-600 hover:bg-amber-500/10" onClick={() => toggleAdmin(u.id, u.email ?? '', true)} disabled={busy}>
                            <Crown className="h-3.5 w-3.5" /> Make admin
                          </Button>
                        )}
                      </div>

                      {/* ── Support: user's events ──────────────────── */}
                      <div className="mt-5 rounded-lg border border-border/50 bg-muted/30 p-4">
                        <div className="flex items-center justify-between">
                          <h4 className="flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-primary" /> User events</h4>
                          <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={() => fetchUserEvents(u.id)} disabled={eventsLoadingId === u.id}>
                            {eventsLoadingId === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />} Refresh
                          </Button>
                        </div>
                        {eventsLoadingId === u.id ? (
                          <p className="py-4 text-center text-xs text-muted-foreground"><Loader2 className="mr-2 inline h-3 w-3 animate-spin" />Loading events...</p>
                        ) : (userEvents[u.id]?.length ?? 0) === 0 ? (
                          <p className="py-3 text-xs text-muted-foreground">This user has no events yet.</p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {userEvents[u.id].map((ev) => (
                              <div key={ev.id} className="flex flex-col gap-2 rounded-md border border-border/50 bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{ev.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {ev.date ? ev.date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBD'}
                                    {ev.venue ? ` · ${ev.venue}` : ''} · {ev.guestCount} guests
                                  </p>
                                </div>
                                <div className="flex flex-shrink-0 items-center gap-2">
                                  <select
                                    value={ev.tier}
                                    onChange={(e: any) => setEventTier(u.id, ev.id, (e?.target?.value ?? 'free') as Tier)}
                                    disabled={busyId === ev.id}
                                    className="h-8 rounded-md border border-border bg-card px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                                    aria-label={`Tier for ${ev.title}`}
                                  >
                                    <option value="free">free</option>
                                    <option value="premium">premium</option>
                                  </select>
                                  <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2 text-xs" onClick={() => router.push(`/events/${ev.id}`)}>
                                    <ExternalLink className="h-3 w-3" /> Open
                                  </Button>
                                </div>
                              </div>
                            ))}
                            <p className="text-xs text-muted-foreground">Open any event to manage its timeline, guests, seating, budget, and gifts with full admin access.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        )}

        {view === 'events' && (
        <section className="mb-8 rounded-xl border border-border/50 bg-card p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold">All events</h2>
              <p className="mt-1 text-sm text-muted-foreground">Superuser control over every ceremony on the platform.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative sm:w-56">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={searchEvents} onChange={(e: any) => setSearchEvents(e?.target?.value ?? '')} placeholder="Search title, host, venue" className="pl-9" />
              </div>
              <select value={tierFilter} onChange={(e: any) => setTierFilter((e?.target?.value ?? 'all') as 'all' | Tier)} className="h-9 rounded-md border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" aria-label="Filter by tier">
                <option value="all">All tiers</option>
                <option value="free">Free</option>
                <option value="premium">Premium</option>
              </select>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={exportEventsCSV}><Download className="h-3.5 w-3.5" /> CSV</Button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {allEvents.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No events on the platform yet.</p>}
            {allEvents
              .filter((e) => (tierFilter === 'all' ? true : e.tier === tierFilter))
              .filter((e) => {
                const q = searchEvents.trim().toLowerCase();
                if (!q) return true;
                return `${e.title} ${hostEmailOf(e.hostId)} ${e.venue}`.toLowerCase().includes(q);
              })
              .map((ev) => (
              <div key={ev.id} className="flex flex-col gap-2 rounded-lg border border-border/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{ev.title}</p>
                    <Badge variant={ev.tier === 'premium' ? 'default' : 'secondary'} className="capitalize">{ev.tier}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {hostEmailOf(ev.hostId)} · {ev.date ? ev.date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBD'}
                    {ev.venue ? ` · ${ev.venue}` : ''} · {ev.guestCount} guests
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <select
                    value={ev.tier}
                    onChange={(e: any) => setEventTierGlobal(ev.id, (e?.target?.value ?? 'free') as Tier)}
                    disabled={busyId === ev.id}
                    className="h-8 rounded-md border border-border bg-card px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                    aria-label={`Tier for ${ev.title}`}
                  >
                    <option value="free">free</option>
                    <option value="premium">premium</option>
                  </select>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2 text-xs" onClick={() => router.push(`/events/${ev.id}`)}>
                    <ExternalLink className="h-3 w-3" /> Open
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 border-rose-500/30 px-2 text-xs text-rose-600 hover:bg-rose-500/10" onClick={() => deleteEventGlobal(ev)} disabled={busyId === ev.id}>
                    <Trash2 className="h-3 w-3" /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
        )}

        {view === 'reviews' && (
        <section className="mb-8 rounded-xl border border-border/50 bg-card p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold">Public reviews</h2>
              <p className="mt-1 text-sm text-muted-foreground">These power the stars on the landing and sign-in pages. Publish one and the badge lights up automatically.</p>
            </div>
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={fetchReviews} disabled={reviewsLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${reviewsLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>

          <div className="mt-4 grid gap-3 rounded-lg border border-border/50 bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><Label htmlFor="review-author">Author</Label>
              <Input id="review-author" value={reviewDraft.author} onChange={(e: any) => setReviewDraft((p) => ({ ...p, author: e?.target?.value ?? '' }))} placeholder="Verified host" className="mt-1" />
            </div>
            <div><Label htmlFor="review-rating">Rating (0.5 – 5)</Label>
              <Input id="review-rating" type="number" min="0.5" max="5" step="0.5" value={reviewDraft.rating} onChange={(e: any) => setReviewDraft((p) => ({ ...p, rating: e?.target?.value ?? '5' }))} className="mt-1" />
            </div>
            <div><Label htmlFor="review-type">Event type (optional)</Label>
              <Input id="review-type" value={reviewDraft.eventType} onChange={(e: any) => setReviewDraft((p) => ({ ...p, eventType: e?.target?.value ?? '' }))} placeholder="wedding" className="mt-1" />
            </div>
            <div className="flex items-end">
              <Button onClick={saveReview} disabled={busyId === 'review-new'} className="w-full gap-2">
                {busyId === 'review-new' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />} Publish review
              </Button>
            </div>
            <div className="sm:col-span-2 lg:col-span-4"><Label htmlFor="review-quote">Quote</Label>
              <Input id="review-quote" value={reviewDraft.quote} onChange={(e: any) => setReviewDraft((p) => ({ ...p, quote: e?.target?.value ?? '' }))} placeholder="Gahundiq kept our whole day on track…" className="mt-1" />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {reviewsLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading reviews...</p>}
            {!reviewsLoading && reviews.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No reviews yet — the landing and sign-in pages show nothing until you publish the first one.</p>
            )}
            {reviews.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-lg border border-border/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} className={`h-3.5 w-3.5 ${i <= Math.round(r.rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
                      ))}
                    </span>
                    <p className="truncate text-sm font-medium">{r.quote ?? '(no quote)'}</p>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {r.author ?? 'Verified host'}{r.eventType ? ` · ${r.eventType}` : ''} · {r.rating.toFixed(1)}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 border-rose-500/30 px-2 text-xs text-rose-600 hover:bg-rose-500/10" onClick={() => deleteReview(r.id)} disabled={busyId === r.id}>
                  <Trash2 className="h-3 w-3" /> Delete
                </Button>
              </div>
            ))}
          </div>
        </section>
        )}

        <section className="rounded-xl border border-border/50 bg-card p-6">
          <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /><h2 className="font-display text-xl font-bold">Needs attention</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">Live signals computed from platform data.</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex flex-col gap-2 border-b border-border/50 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Payment issues (past due / canceled)</span>
              {paymentIssues.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {paymentIssues.slice(0, 4).map((u) => (
                    <button key={u.id} type="button" onClick={() => { setSearch(u.email ?? ''); setExpandedId(u.id); }} className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-600 hover:bg-amber-500/25">
                      {u.email ?? u.id.slice(0, 8)}
                    </button>
                  ))}
                  {paymentIssues.length > 4 && <Badge variant="secondary">+{paymentIssues.length - 4} more</Badge>}
                </div>
              ) : (
                <Badge variant="secondary">None</Badge>
              )}
            </div>
            <div className="flex flex-col gap-2 border-b border-border/50 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Users without an active subscription record</span>
              <Badge variant="secondary">{unactivated.length}</Badge>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>Premium events owned by free-tier accounts</span>
              <Badge variant="secondary">{planMismatches}</Badge>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}