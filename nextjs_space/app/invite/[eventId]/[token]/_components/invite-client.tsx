'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import type { InviteData, RsvpStatus } from '@/types/firestore';
import { Calendar, CalendarX2, Heart, Loader2, MailCheck, MapPin, PartyPopper } from 'lucide-react';

export function InviteClient({ eventId, token }: { eventId: string; token: string }) {
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    const db = getFirestoreClient();
    if (!db || !eventId || token.length < 32) { setLoading(false); return; }
    return onSnapshot(doc(db, 'events', eventId, 'invites', token), (snapshot) => {
      setInvite(snapshot.exists() ? ({ ...snapshot.data(), id: snapshot.id } as unknown as InviteData) : null);
      setLoading(false);
    }, () => { setInvite(null); setLoading(false); });
  }, [eventId, token]);

  const respond = async (rsvp: RsvpStatus) => {
    const db = getFirestoreClient();
    if (!db || !invite) return;
    setResponding(true);
    try {
      await updateDoc(doc(db, 'events', eventId, 'invites', token), { rsvp, respondedAt: new Date() });
    } catch {
      // Live listener keeps the UI truthful if the write is rejected.
    } finally {
      setResponding(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading invitation...</div>;
  }

  if (!invite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold">Invitation not found</h1>
          <p className="mt-2 text-muted-foreground">This invitation link is invalid or has been revoked.</p>
        </div>
      </div>
    );
  }

  const responded = Boolean(invite.respondedAt);

  return (
    <div className="min-h-screen bg-background">
      <div className="hero-gradient border-b border-border/40">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <MailCheck className="h-8 w-8 text-primary" />
            </div>
            <p className="text-sm uppercase tracking-widest text-primary">You are invited</p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">{invite.eventTitle ?? 'Our Ceremony'}</h1>
            <div className="mt-3 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{invite.eventDate instanceof Date ? invite.eventDate.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Date to be announced'}</span>
              {invite.eventVenue && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{invite.eventVenue}</span>}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <Heart className="mx-auto mb-4 h-10 w-10 text-primary/60" />
          <h2 className="font-display text-2xl font-bold">Dear {invite.guestName},</h2>
          <p className="mt-2 text-muted-foreground">We would be honored by your presence. Please let us know if you can make it.</p>
        </motion.div>

        {responded ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-8 rounded-xl border border-primary/20 bg-primary/5 p-8 text-center">
            <PartyPopper className="mx-auto mb-3 h-10 w-10 text-primary" />
            <h3 className="font-display text-xl font-bold">{invite.rsvp === 'confirmed' ? 'We can\'t wait to see you!' : 'You will be missed.'}</h3>
            <p className="mt-2 text-sm text-muted-foreground">Your RSVP has been recorded and the hosts have been notified.</p>
            {invite.rsvp === 'confirmed' && (
              <Link href={`/gift/${eventId}`}>
                <Button variant="outline" className="mt-5 gap-2"><Heart className="h-4 w-4" /> Send a gift</Button>
              </Link>
            )}
          </motion.div>
        ) : (
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Button size="lg" className="h-16 gap-2 text-base" onClick={() => respond('confirmed')} disabled={responding}>
              {responding ? <Loader2 className="h-5 w-5 animate-spin" /> : <PartyPopper className="h-5 w-5" />} Joyfully accept
            </Button>
            <Button size="lg" variant="outline" className="h-16 gap-2 text-base" onClick={() => respond('declined')} disabled={responding}>
              <CalendarX2 className="h-5 w-5" /> Regretfully decline
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}