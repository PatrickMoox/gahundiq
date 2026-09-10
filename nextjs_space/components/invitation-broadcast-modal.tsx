'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Send, Mail, Copy, CheckCircle2, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

interface InvitationBroadcastModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  hostId: string;
  invitationUrl: string;
  eventTitle: string;
  guestCount: number;
  confirmedGuests: number;
  pendingGuests: number;
}

export function InvitationBroadcastModal({
  open,
  onOpenChange,
  eventId,
  hostId,
  invitationUrl,
  eventTitle,
  guestCount,
  confirmedGuests,
  pendingGuests,
}: InvitationBroadcastModalProps) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareLink = typeof window !== 'undefined' ? `${window.location.origin}/invite/${eventId}` : '';

  const handleBroadcast = async () => {
    setSending(true);
    const db = getFirestoreClient();
    if (!db) {
      setSending(false);
      return;
    }

    try {
      await updateDoc(doc(db, 'events', eventId), {
        invitationBroadcasts: [
          {
            sentAt: serverTimestamp(),
            sentBy: hostId,
            guestCount: pendingGuests,
            // No email backend is wired yet — this records a LINK broadcast. The
            // reference is the real shareable invitation path (never a fabricated
            // "sim_" id).
            method: 'link',
            reference: `/invite/${eventId}`,
          },
        ],
        updatedAt: serverTimestamp(),
      });
      setSent(true);
      toast.success(`Broadcast recorded for ${pendingGuests} pending guests.`);
    } catch (err: any) {
      toast.error(`Broadcast failed: ${err?.message ?? 'Unknown error'}`);
    }
    setSending(false);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      toast.success('Invitation link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleClose = () => {
    setSent(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={() => setSent(false)}>
        <DialogHeader>
          <DialogTitle>Broadcast Invitation</DialogTitle>
          <DialogDescription>
            Share your invitation with guests for &quot;{eventTitle}&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Guest Status</span>
              <span className="text-sm text-muted-foreground">{guestCount} total</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-card p-3 text-center">
                <p className="text-2xl font-bold text-amber-500">{pendingGuests}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
              <div className="rounded-lg bg-card p-3 text-center">
                <p className="text-2xl font-bold text-emerald-500">{confirmedGuests}</p>
                <p className="text-xs text-muted-foreground">Confirmed</p>
              </div>
            </div>
          </div>

          {!sent ? (
            <>
              <div className="rounded-lg border border-border/50 p-4">
                <h4 className="text-sm font-medium mb-2">Broadcast methods</h4>
                <div className="space-y-2">
                  <Button
                    onClick={handleBroadcast}
                    disabled={sending || pendingGuests === 0}
                    className="w-full gap-2"
                  >
                    {sending ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Recording...</>
                    ) : (
                      <><Send className="h-4 w-4" /> Record broadcast</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCopyLink}
                    className="w-full gap-2"
                  >
                    {copied ? (
                      <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Copied!</>
                    ) : (
                      <><Copy className="h-4 w-4" /> Copy share link</>
                    )}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {pendingGuests === 0
                    ? 'All guests have responded — nothing to broadcast.'
                    : 'This records the broadcast — your guests RSVP through the share link.'
                  }
                </p>
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <div className="flex justify-between"><span>Invitation URL</span></div>
                <p className="mt-1 text-xs text-muted-foreground truncate">{invitationUrl}</p>
              </div>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center"
            >
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="font-display text-lg font-semibold">Broadcast Recorded</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Your invitation broadcast is logged for {pendingGuests} pending guests.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Share your invitation link with these guests — RSVPs land in your event hub.
              </p>
            </motion.div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              {sent ? 'Done' : 'Cancel'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
