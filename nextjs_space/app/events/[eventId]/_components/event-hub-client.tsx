'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import { useEvent } from '@/lib/hooks/use-firestore-data';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TimelineTab } from './timeline-tab';
import { VendorsTab } from './vendors-tab';
import { SeatingTab } from './seating-tab';
import { TasksTab } from './tasks-tab';
import { BudgetTab } from './budget-tab';
import { GiftsTab } from './gifts-tab';
import { GuestsTab } from './guests-tab';
import { PlanFeatureGate } from '@/components/plan-feature-gate';
import { useGuests, useTimeline } from '@/lib/hooks/use-firestore-data';
import { InvitationUploadModal } from '@/components/invitation-upload-modal';
import { InvitationBroadcastModal } from '@/components/invitation-broadcast-modal';
import {
  ArrowLeft, Calendar, MapPin, Users, Clock,
  Radio, UserCheck, Armchair, ClipboardList, DollarSign, Gift, MailPlus, Send
} from 'lucide-react';

export function EventHubClient({ eventId }: { eventId: string }) {
  const { user, loading: authLoading } = useAuth();
  const { event, loading: eventLoading } = useEvent(eventId);
  const { items: timelineItems } = useTimeline(eventId);
  const { guests } = useGuests(eventId);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('timeline');
  const [showInvitationUpload, setShowInvitationUpload] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth');
  }, [user, authLoading, router]);

  if (authLoading || eventLoading || !user) {
    return (
      <div className="min-h-screen"><Navbar />
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen"><Navbar />
        <div className="mx-auto max-w-[1200px] px-4 py-16 text-center">
          <h1 className="font-display text-2xl font-bold">Event Not Found</h1>
          <p className="mt-2 text-muted-foreground">This event does not exist or you don't have access.</p>
          <Link href="/dashboard"><Button className="mt-4">Back to Dashboard</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          {/* Back + Header */}
          <div className="mb-6">
            <Button variant="ghost" size="sm" className="mb-3 gap-1" onClick={() => router.push('/dashboard')}>
              <ArrowLeft className="h-4 w-4" /> Dashboard
            </Button>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-2xl font-bold tracking-tight">{event?.title}</h1>
                  <Badge variant="secondary" className="capitalize">{event?.eventType}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{event?.date instanceof Date ? event.date.toLocaleDateString('en-US', { timeZone: 'UTC' }) : 'TBD'}</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{event?.venue}</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{event?.guestCount} guests</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="gap-2" onClick={() => setShowInvitationUpload(true)}>
                  <MailPlus className="h-4 w-4" /> {event?.invitationUrl ? 'Invitation' : 'Upload Invitation'}
                </Button>
                {event?.invitationUrl && (
                  <Button className="gap-2" onClick={() => setShowBroadcast(true)}>
                    <Send className="h-4 w-4" /> Broadcast
                  </Button>
                )}
                {event.tier === 'premium' ? (
                  <Link href={`/events/${eventId}/coordinator`}>
                    <Button className="gap-2"><Radio className="h-4 w-4" /> Live Coordinator</Button>
                  </Link>
                ) : (
                  <Link href="/pricing"><Button variant="outline" className="gap-2"><Radio className="h-4 w-4" /> Unlock Coordinator</Button></Link>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6 w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="timeline" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Timeline</TabsTrigger>
              <TabsTrigger value="vendors" className="gap-1.5"><UserCheck className="h-3.5 w-3.5" /> Vendors</TabsTrigger>
              <TabsTrigger value="guests" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Guests</TabsTrigger>
              <TabsTrigger value="seating" className="gap-1.5"><Armchair className="h-3.5 w-3.5" /> Seating</TabsTrigger>
              <TabsTrigger value="tasks" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Tasks</TabsTrigger>
              <TabsTrigger value="budget" className="gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Budget</TabsTrigger>
              <TabsTrigger value="gifts" className="gap-1.5"><Gift className="h-3.5 w-3.5" /> Gifts</TabsTrigger>
            </TabsList>

            <TabsContent value="timeline"><TimelineTab eventId={eventId} /></TabsContent>
            <TabsContent value="vendors"><VendorsTab eventId={eventId} event={event} timeline={timelineItems} /></TabsContent>
            <TabsContent value="guests"><GuestsTab eventId={eventId} event={event} /></TabsContent>
            <TabsContent value="seating"><PlanFeatureGate event={event} feature="seating"><SeatingTab eventId={eventId} /></PlanFeatureGate></TabsContent>
            <TabsContent value="tasks"><TasksTab eventId={eventId} /></TabsContent>
            <TabsContent value="budget"><PlanFeatureGate event={event} feature="budget"><BudgetTab eventId={eventId} /></PlanFeatureGate></TabsContent>
            <TabsContent value="gifts"><PlanFeatureGate event={event} feature="gifts"><GiftsTab eventId={eventId} /></PlanFeatureGate></TabsContent>
          </Tabs>
        </motion.div>
      </div>
      <InvitationUploadModal
        open={showInvitationUpload}
        onOpenChange={setShowInvitationUpload}
        eventId={eventId}
        hostId={event.hostId}
        currentInvitationUrl={event?.invitationUrl}
        currentInvitationName={event?.invitationName}
        onUploaded={(url) => {
          window.location.reload();
        }}
      />
      <InvitationBroadcastModal
        open={showBroadcast}
        onOpenChange={setShowBroadcast}
        eventId={eventId}
        hostId={event.hostId}
        invitationUrl={event?.invitationUrl ?? ''}
        eventTitle={event?.title ?? ''}
        guestCount={event?.guestCount ?? 0}
        confirmedGuests={guests.filter((g) => g.rsvp === 'confirmed').length}
        pendingGuests={guests.filter((g) => (g.rsvp ?? 'pending') === 'pending').length}
      />
    </div>
  );
}
