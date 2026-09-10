'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { addDoc, collection, doc, getDoc } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { CashGiftModal } from '@/components/cash-gift-modal';
import { toast } from 'sonner';
import { Calendar, MapPin, Gift, Sparkles, Heart } from 'lucide-react';

export function GiftPageClient({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showGift, setShowGift] = useState(false);

  useEffect(() => {
    const db = getFirestoreClient();
    if (!db) { setLoading(false); return; }
    getDoc(doc(db, 'publicGiftPages', eventId)).then((snapshot) => {
      setEvent(snapshot.exists() ? snapshot.data().event ?? snapshot.data() : null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [eventId]);

  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading gift page...</div>;
  if (!event) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold">Event Not Found</h1>
          <p className="mt-2 text-muted-foreground">This gift page is not available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="hero-gradient border-b border-border/40">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Gift className="h-8 w-8 text-primary" />
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{event?.title}</h1>
            <div className="mt-3 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{event?.date instanceof Date ? event.date.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'TBD'}</span>
              <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{event?.venue}</span>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-12">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <Heart className="mx-auto mb-4 h-10 w-10 text-primary/60" />
          <h2 className="font-display text-2xl font-bold">Celebrate with a Gift</h2>
          <p className="mt-2 text-muted-foreground">Your generosity means the world. Send a heartfelt gift to the couple.</p>
          <Button size="lg" className="mt-6 gap-2 px-8" onClick={() => setShowGift(true)}>
            <Sparkles className="h-4 w-4" /> Send a Gift
          </Button>
        </motion.div>

      </div>

      <CashGiftModal
        open={showGift}
        onOpenChange={setShowGift}
        eventId={eventId}
        eventTitle={event?.title}
        onGiftSent={(data: any) => {
          const db = getFirestoreClient();
          if (!db) return;
          addDoc(collection(db, 'events', eventId, 'gifts'), {
            guestName: data?.guestName ?? 'Anonymous',
            guestEmail: data?.guestEmail,
            amount: data?.amount ?? 0,
            currency: 'USD',
            message: data?.message,
            giftType: data?.giftType ?? 'cash',
            status: 'pending',
            createdAt: new Date(),
          }).then(() => {
            toast.success('Gift recorded — thank you!');
          }).catch(() => {
            toast.error('Gift notifications are available on paid ceremonies. Please contact the couple directly.');
          });
        }}
      />
    </div>
  );
}
