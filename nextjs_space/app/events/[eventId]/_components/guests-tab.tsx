'use client';

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useEventInvites, useGuests } from '@/lib/hooks/use-firestore-data';
import { doc, setDoc } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getEventLimits } from '@/lib/plan-entitlements';
import type { DietaryPref, EventData, GuestData, RsvpStatus } from '@/types/firestore';
import { toast } from 'sonner';
import { Check, Link2, Mail, Plus, Search, Star, Trash2, Users } from 'lucide-react';

const DIETARY_OPTIONS: DietaryPref[] = ['none', 'vegetarian', 'vegan', 'gluten-free', 'halal', 'kosher'];
const RSVP_OPTIONS: RsvpStatus[] = ['pending', 'confirmed', 'declined'];
const EMPTY_FORM = { name: '', email: '', dietary: 'none' as DietaryPref, isVIP: false };

/** URL-safe 40-char capability token for a guest's digital invitation. */
function generateInviteToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(40);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => chars[byte % chars.length]).join('');
}

export function GuestsTab({ eventId, event }: { eventId: string; event: EventData }) {
  const { guests, loading, addGuest, updateGuest, deleteGuest } = useGuests(eventId);
  const { invites } = useEventInvites(eventId);
  const limits = getEventLimits(event);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const invitedCount = invites.length;
  const inviteFor = (guest?: GuestData) => (guest?.id ? invites.find((invite) => invite.guestId === guest.id) : undefined);
  const displayRsvp = (guest?: GuestData): RsvpStatus => {
    const invite = inviteFor(guest);
    if (invite?.respondedAt && invite.rsvp) return invite.rsvp;
    return (guest?.rsvp ?? 'pending') as RsvpStatus;
  };
  const confirmedCount = guests.filter((guest) => guest.rsvp === 'confirmed').length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter((guest) => `${guest?.name ?? ''} ${guest?.email ?? ''}`.toLowerCase().includes(q));
  }, [guests, search]);

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error('Guest name is required.'); return; }
    if (guests.length >= limits.guests) {
      toast.error(`Your plan supports up to ${limits.guests} guests. Upgrade for more capacity.`);
      return;
    }
    setSaving(true);
    try {
      await addGuest({
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        dietary: form.dietary,
        isVIP: form.isVIP,
        rsvp: 'pending',
      });
      toast.success('Guest added.');
      setForm(EMPTY_FORM);
      setShowAdd(false);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not add the guest.');
    } finally {
      setSaving(false);
    }
  };

  const handleRsvp = async (guest: GuestData, rsvp: RsvpStatus) => {
    try {
      await updateGuest(guest.id, { rsvp });
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not update the RSVP.');
    }
  };

  const handleSendInvite = async (guest: GuestData) => {
    const existing = inviteFor(guest);
    const link = existing ? `${window.location.origin}/invite/${eventId}/${existing.token}` : null;
    if (existing) {
      try {
        await navigator.clipboard.writeText(link ?? '');
        toast.success('Invite link copied to clipboard. Send it to your guest.');
      } catch {
        toast.info(`Invite link: ${link}`);
      }
      return;
    }
    if (invites.length >= limits.invites) {
      toast.error(`Your plan includes ${limits.invites} invites. Upgrade for more.`);
      return;
    }
    const db = getFirestoreClient();
    if (!db) { toast.error('Firestore is not configured.'); return; }
    const token = generateInviteToken();
    setSaving(true);
    try {
      await setDoc(doc(db, 'events', eventId, 'invites', token), {
        token,
        eventId,
        guestId: guest.id,
        guestName: guest.name,
        eventTitle: event.title,
        eventDate: event.date ?? null,
        eventVenue: event.venue ?? '',
        rsvp: 'pending',
        createdAt: new Date(),
        respondedAt: null,
      });
      await updateGuest(guest.id, { inviteSentAt: new Date(), inviteToken: token });
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/invite/${eventId}/${token}`);
        toast.success('Digital invitation created — link copied to clipboard. Send it to your guest.');
      } catch {
        toast.success('Digital invitation created. Open the invite page to copy the link.');
      }
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not create the invitation.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (guest: GuestData) => {
    try {
      await deleteGuest(guest.id);
      toast.success('Guest removed.');
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not remove the guest.');
    }
  };

  const stats = [
    { label: 'Guests', value: `${guests.length}/${limits.guests}` },
    { label: 'Confirmed', value: String(confirmedCount) },
    { label: 'Pending', value: String(guests.filter((guest) => (guest.rsvp ?? 'pending') === 'pending').length) },
    { label: 'Invites sent', value: `${invitedCount}/${limits.invites}` },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border/50 bg-card p-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-1 font-display text-xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e: any) => setSearch(e?.target?.value ?? '')} placeholder="Search guests" className="pl-9" />
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2"><Plus className="h-4 w-4" /> Add Guest</Button>
      </div>

      <div className="space-y-2">
        {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading guests...</p>}
        {!loading && filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p>{guests.length === 0 ? 'No guests yet. Add your first guest to start tracking RSVPs and invites.' : 'No guests match your search.'}</p>
          </div>
        )}
        {filtered.map((guest) => (
          <motion.div key={guest?.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card p-4 sm:flex-row sm:items-center sm:justify-between" style={{ boxShadow: 'var(--shadow-sm)' }}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-sm font-semibold">{guest?.name}</h3>
                {guest?.isVIP && (
                  <Badge variant="secondary" className="gap-1 text-amber-600"><Star className="h-3 w-3 fill-current" /> VIP</Badge>
                )}
                {guest?.dietary && guest.dietary !== 'none' && (
                  <Badge variant="outline" className="capitalize">{guest.dietary}</Badge>
                )}
              </div>
              {guest?.email && <p className="mt-0.5 truncate text-xs text-muted-foreground">{guest.email}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {inviteFor(guest)?.respondedAt && (
                <Badge variant={inviteFor(guest)?.rsvp === 'confirmed' ? 'default' : 'secondary'} className="capitalize gap-1">
                  <Check className="h-3 w-3" /> RSVP: {inviteFor(guest)?.rsvp}
                </Badge>
              )}
              <Select value={displayRsvp(guest)} onValueChange={(v) => handleRsvp(guest, v as RsvpStatus)}>
                <SelectTrigger className="h-8 w-[130px] text-xs capitalize"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RSVP_OPTIONS.map((option) => <SelectItem key={option} value={option} className="capitalize">{option}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleSendInvite(guest)} disabled={saving}>
                {inviteFor(guest) ? <Link2 className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                {inviteFor(guest) ? 'Copy link' : 'Send invite'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(guest)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        ))}
      </div>
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Guest</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="guest-name">Name *</Label>
              <Input id="guest-name" value={form.name} onChange={(e: any) => setForm({ ...form, name: e?.target?.value ?? '' })} placeholder="Sarah Johnson" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="guest-email">Email (for invites)</Label>
              <Input id="guest-email" type="email" value={form.email} onChange={(e: any) => setForm({ ...form, email: e?.target?.value ?? '' })} placeholder="sarah@example.com" className="mt-1" />
            </div>
            <div>
              <Label>Dietary preference</Label>
              <Select value={form.dietary} onValueChange={(v) => setForm({ ...form, dietary: v as DietaryPref })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIETARY_OPTIONS.map((option) => <SelectItem key={option} value={option} className="capitalize">{option}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <Label htmlFor="guest-vip" className="cursor-pointer">VIP guest</Label>
              <Switch id="guest-vip" checked={form.isVIP} onCheckedChange={(checked: boolean) => setForm({ ...form, isVIP: checked })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={saving}>{saving ? 'Adding...' : 'Add Guest'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}