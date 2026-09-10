'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { addDoc, collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { FREE_LIMITS, PAID_LIMITS, isSubscriptionActive } from '@/lib/plan-entitlements';
import { useSubscription } from '@/lib/hooks/use-subscription';
import { Badge } from '@/components/ui/badge';
import {
  Heart, Cake, Building2, Flower2, Baby, UtensilsCrossed, Video, CircleDot,
  ArrowLeft, ArrowRight, Calendar, MapPin, Users, Sparkles
} from 'lucide-react';
import type { EventType } from '@/types/firestore';

const EVENT_TYPES: { type: EventType; label: string; icon: any }[] = [
  { type: 'wedding', label: 'Wedding', icon: Heart },
  { type: 'birthday', label: 'Birthday', icon: Cake },
  { type: 'corporate', label: 'Corporate', icon: Building2 },
  { type: 'memorial', label: 'Memorial', icon: Flower2 },
  { type: 'baby_shower', label: 'Baby Shower', icon: Baby },
  { type: 'potluck', label: 'Potluck', icon: UtensilsCrossed },
  { type: 'webinar', label: 'Webinar', icon: Video },
  { type: 'other', label: 'Other', icon: CircleDot },
];

export function NewEventClient() {
  const { user, loading: authLoading } = useAuth();
  const { subscription } = useSubscription(user?.uid);
  const premiumAccount = isSubscriptionActive(subscription);
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [eventType, setEventType] = useState<EventType>('wedding');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [guestCount, setGuestCount] = useState('50');

  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth');
  }, [user, authLoading, router]);

  const handleCreate = async () => {
    if (!title?.trim()) { toast.error('Please enter an event title'); return; }
    const db = getFirestoreClient();
    if (!db || !user) { toast.error('Firebase is not connected. Please try again.'); return; }
    try {
      const maxEvents = premiumAccount ? (subscription?.maxEvents || PAID_LIMITS.activeCeremonies) : FREE_LIMITS.activeCeremonies;
      const guestLimit = premiumAccount ? PAID_LIMITS.guests : FREE_LIMITS.guests;
      const planName = premiumAccount ? 'Premium' : 'Free';
      const existingEvents = await getDocs(query(collection(db, 'events'), where('hostId', '==', user.uid)));
      if (existingEvents.size >= maxEvents) {
        toast.error(`The ${planName} plan includes ${maxEvents} active ${maxEvents === 1 ? 'ceremony' : 'ceremonies'}.${premiumAccount ? '' : ' Upgrade to create more.'}`);
        return;
      }
      const requestedGuests = Math.max(1, Number(guestCount) || 1);
      if (requestedGuests > guestLimit) {
        toast.error(`The ${planName} plan supports up to ${guestLimit} guests.${premiumAccount ? '' : ' Upgrade for more capacity.'}`);
        return;
      }
      const created = await addDoc(collection(db, 'events'), {
        hostId: user.uid,
        collaboratorIds: [],
        title: title.trim(),
        eventType,
        date: date ? new Date(`${date}T12:00:00`) : null,
        venue: venue.trim(),
        guestCount: requestedGuests,
        tier: premiumAccount ? 'premium' : 'free',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Auto-create the public gift page so /gift/{eventId} works immediately
      await setDoc(doc(db, 'publicGiftPages', created.id), {
        eventId: created.id,
        hostId: user.uid,
        title: title.trim(),
        eventType,
        date: date ? new Date(`${date}T12:00:00`) : null,
        venue: venue.trim(),
        isActive: true,
        createdAt: new Date(),
      });

      toast.success('Event created successfully!');
      router.push(`/events/${created.id}`);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not create the event');
    }
  };

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-[1200px] px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8">
            <Button variant="ghost" className="mb-4 gap-2" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-bold tracking-tight">Create New Event</h1>
              {premiumAccount && <Badge className="capitalize">Premium account</Badge>}
            </div>
            <p className="mt-1 text-muted-foreground">Set up your event in a few simple steps.</p>
          </div>

          {/* Progress */}
          <div className="mb-8 flex gap-2">
            {[1, 2].map((s: number) => (
              <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h2 className="mb-4 font-display text-xl font-semibold">What type of event?</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {EVENT_TYPES.map((et: any) => (
                    <button
                      key={et?.type}
                      onClick={() => setEventType(et?.type)}
                      className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition-all hover:border-primary/50 ${
                        eventType === et?.type ? 'border-primary bg-primary/10 text-primary' : 'border-border/50 bg-card'
                      }`}
                    >
                      <et.icon className="h-6 w-6" />
                      {et?.label}
                    </button>
                  ))}
                </div>
                <div className="mt-6 flex justify-end">
                  <Button onClick={() => setStep(2)} className="gap-2">
                    Next <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <h2 className="mb-4 font-display text-xl font-semibold">Event Details</h2>
                <div>
                  <Label htmlFor="title">Event Title</Label>
                  <div className="relative mt-1">
                    <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="title" placeholder="Sarah & James Wedding" value={title} onChange={(e: any) => setTitle(e?.target?.value ?? '')} className="pl-10" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="date">Event Date</Label>
                  <div className="relative mt-1">
                    <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="date" type="date" value={date} onChange={(e: any) => setDate(e?.target?.value ?? '')} className="pl-10" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="venue">Venue</Label>
                  <div className="relative mt-1">
                    <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="venue" placeholder="The Grand Ballroom" value={venue} onChange={(e: any) => setVenue(e?.target?.value ?? '')} className="pl-10" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="guests">Expected Guests</Label>
                  <div className="relative mt-1">
                    <Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="guests" type="number" min="1" value={guestCount} onChange={(e: any) => setGuestCount(e?.target?.value ?? '50')} className="pl-10" />
                  </div>
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button onClick={handleCreate} className="gap-2">
                    Create Event <Sparkles className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
