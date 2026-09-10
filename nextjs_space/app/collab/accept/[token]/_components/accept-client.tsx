'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { arrayUnion, doc, getDoc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { Navbar } from '@/components/navbar';
import { SiteFooter } from '@/components/site-footer';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { CollabInvite } from '@/types/firestore';
import { collabClaimId } from '@/lib/collab';
import { HeartHandshake, Loader2 } from 'lucide-react';

type Phase = 'loading' | 'signin' | 'invalid' | 'revoked' | 'expired' | 'ready' | 'partial';

/**
 * Accept screen for a collaboration invite link (`/collab/accept/{token}`).
 * Accepting writes the invite acceptance + claim doc atomically, then adds the
 * user's own uid to the event's collaboratorIds (authorized by the claim —
 * see firestore.rules). Requires sign-in; revisit the link after signing in.
 */
export function AcceptClient({ token }: { token: string }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [invite, setInvite] = useState<CollabInvite | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    const db = getFirestoreClient();
    if (!db || !token || token.length < 32) { setPhase('invalid'); return; }
    if (!user) { setPhase('signin'); return; }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'collabInvites', token));
        if (cancelled) return;
        if (!snap.exists()) { setPhase('invalid'); return; }
        const data = snap.data() as CollabInvite;
        setInvite(data);
        const expires = data.expiresAt?.toMillis?.() ?? (data.expiresAt ? new Date(data.expiresAt).getTime() : 0);
        if (data.status === 'revoked') setPhase('revoked');
        else if (data.status === 'accepted') setPhase(data.acceptedBy === user.uid ? 'partial' : 'invalid');
        else if (expires > 0 && expires < Date.now()) setPhase('expired');
        else setPhase('ready');
      } catch {
        if (!cancelled) setPhase('invalid');
      }
    })();
    return () => { cancelled = true; };
  }, [token, user, authLoading]);

  /** Self-join write — allowed by rules only while our claim doc exists. */
  const joinEvent = async (): Promise<void> => {
    const db = getFirestoreClient();
    if (!db || !user || !invite) throw new Error('Not ready.');
    const name = (user.displayName || user.email?.split('@')[0] || 'Collaborator').slice(0, 60);
    await updateDoc(doc(db, 'events', invite.eventId), {
      collaboratorIds: arrayUnion(user.uid),
      [`collaboratorNames.${user.uid}`]: name,
      updatedAt: serverTimestamp(),
    });
  };

  const accept = async () => {
    const db = getFirestoreClient();
    if (!db || !user || !invite) return;
    if (user.uid === invite.invitedBy) { toast.error('You are already the host of this ceremony.'); return; }
    setBusy(true);
    try {
      const name = (user.displayName || user.email?.split('@')[0] || 'Collaborator').slice(0, 60);
      // 1) Atomic: accept invite + write claim (rules verify the pair).
      const batch = writeBatch(db);
      batch.update(doc(db, 'collabInvites', token), {
        status: 'accepted', acceptedBy: user.uid, acceptedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'collabClaims', collabClaimId(invite.eventId, user.uid)), {
        eventId: invite.eventId, uid: user.uid, displayName: name, token, createdAt: serverTimestamp(),
      });
      await batch.commit();
      // 2) Self-join the event.
      await joinEvent();
      toast.success('You are in — happy planning!');
      router.replace(`/events/${invite.eventId}`);
    } catch (error: any) {
      // The batch may have landed but the event write failed (e.g. a drop in
      // connectivity between the two writes) — offer a retry, not a dead end.
      setPhase('partial');
      toast.error(error?.message ?? 'Could not join this ceremony. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const shells: Record<'invalid' | 'revoked' | 'expired', { title: string; body: string }> = {
    invalid: { title: 'Invite not found', body: 'This link is not valid. Ask the host to create a new invite.' },
    revoked: { title: 'Invite revoked', body: 'The host has withdrawn this invitation.' },
    expired: { title: 'Invite expired', body: 'Invite links stay valid for 7 days. Ask the host to create a new one.' },
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-md px-4 py-16">
        {phase === 'loading' || authLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : phase === 'signin' ? (
          <Card title="Sign in to join this ceremony" body="Collaboration links are personal — sign in (or create a free account) first, then open the invite link again.">
            <Link href="/auth"><Button className="w-full">Sign in / Create account</Button></Link>
          </Card>
        ) : phase in shells ? (
          <Card title={shells[phase as keyof typeof shells].title} body={shells[phase as keyof typeof shells].body}>
            <Link href="/dashboard"><Button variant="outline" className="w-full">Go to dashboard</Button></Link>
          </Card>
        ) : invite && (phase === 'ready' || phase === 'partial') ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center shadow-sm backdrop-blur-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-sm">
              <HeartHandshake className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl font-bold">
              {phase === 'partial' ? 'Almost there' : 'Join this ceremony?'}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {phase === 'partial' ? 'Finish joining to get your planning access.' : (
                <><span className="font-medium text-foreground">{invite.invitedByName || 'The host'}</span> invited you to co-plan
                  <span className="font-medium text-foreground"> {invite.eventTitle || 'a ceremony'}</span>.</>
              )}
            </p>
            <p className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              You&apos;ll share core planning — timeline, guests, tasks and seating. Budget and vendor pricing stay
              private unless the host opens them, and gift records always stay with the host.
            </p>
            <Button
              onClick={async () => {
                if (phase === 'partial') {
                  setBusy(true);
                  try { await joinEvent(); toast.success('You are in — happy planning!'); router.replace(`/events/${invite.eventId}`); }
                  catch (error: any) { toast.error(error?.message ?? 'Could not join this ceremony. Please try again.'); }
                  finally { setBusy(false); }
                } else {
                  await accept();
                }
              }}
              disabled={busy} className="mt-5 w-full gap-2"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {phase === 'partial' ? 'Finish joining' : 'Accept invitation'}
            </Button>
          </motion.div>
        ) : null}
      </div>
      <SiteFooter />
    </div>
  );
}

function Card({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/70 p-8 text-center shadow-sm backdrop-blur-sm">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}