'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Check, Copy, Link2, Loader2, MessageCircle, SlidersHorizontal, Trash2, UserPlus, Users } from 'lucide-react';
import {
  arrayRemove, collection, deleteField, doc, onSnapshot, query, serverTimestamp,
  setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import type { CollabInvite, EventData } from '@/types/firestore';
import {
  COLLAB_INVITE_TTL_MS, MAX_COLLABORATORS, MONEY_SECTIONS, SECTION_LABELS,
  collabClaimId, collabInviteLink, generateCollabToken, isSectionShared,
} from '@/lib/collab';
import type { ShareableSection } from '@/types/firestore';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  /** Live event doc from useEvent — collaboratorIds stay fresh. */
  event: EventData;
}

/**
 * Host-side collaborator management (Phase 1 collaboration). Generates
 * invite-by-link tokens, shares them (copy / WhatsApp), lists pending invites
 * for revocation, and removes collaborators (clearing the uid AND its claim
 * doc in one batch so a removed user cannot re-join through the stale claim).
 */
export function CollaboratorModal({ open, onOpenChange, eventId, event }: Props) {
  const { user } = useAuth();
  const [invites, setInvites] = useState<(CollabInvite & { id: string })[]>([]);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [shareBudgetForInvite, setShareBudgetForInvite] = useState(false);
  /** Collaborator whose privacy panel is expanded (host only). */
  const [expandedUid, setExpandedUid] = useState<string | null>(null);

  const isHost = Boolean(user && event.hostId === user.uid);

  useEffect(() => {
    const db = getFirestoreClient();
    if (!db || !open || !user) { setInvites([]); return; }
    return onSnapshot(
      query(collection(db, 'collabInvites'), where('eventId', '==', eventId)),
      (snap: any) => {
        const rows: (CollabInvite & { id: string })[] = snap.docs.map((d: any) => ({ id: d.id as string, ...(d.data() as CollabInvite) }));
        rows.sort((a, b) => (b?.createdAt?.toMillis?.() ?? 0) - (a?.createdAt?.toMillis?.() ?? 0));
        setInvites(rows);
      },
      (error) => {
        console.error('Could not load collaborator invites:', error);
        setInvites([]);
        toast.error('Could not load collaborator invites. Please refresh and try again.');
      },
    );
  }, [open, eventId, user]);

  const pendingInvites = useMemo(() => invites.filter((i) => i.status === 'pending'), [invites]);
  const collaborators = event.collaboratorIds ?? [];
  const acceptedInvites = useMemo(
    () => invites.flatMap((invite) => {
      const uid = invite.acceptedBy;
      return invite.status === 'accepted' && uid && collaborators.includes(uid)
        ? [{ invite, uid }]
        : [];
    }),
    [invites, collaborators],
  );

  const createInvite = async () => {
    const db = getFirestoreClient();
    if (!db || !user) return;
    if (collaborators.length >= MAX_COLLABORATORS) {
      toast.error(`This event already has ${MAX_COLLABORATORS} collaborators.`);
      return;
    }
    setCreating(true);
    try {
      const token = generateCollabToken();
      await setDoc(doc(db, 'collabInvites', token), {
        token,
        eventId,
        eventTitle: event.title,
        invitedBy: user.uid,
        invitedByName: user.displayName || 'Host',
        shareBudget: shareBudgetForInvite,
        status: 'pending',
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + COLLAB_INVITE_TTL_MS),
      });
      setLastLink(collabInviteLink(token));
      setShareBudgetForInvite(false);
      toast.success('Invite link created — share it with your partner.');
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not create the invite.');
    } finally {
      setCreating(false);
    }
  };

  const revokeInvite = async (token: string) => {
    const db = getFirestoreClient();
    if (!db) return;
    setBusyId(token);
    try {
      await updateDoc(doc(db, 'collabInvites', token), { status: 'revoked', updatedAt: serverTimestamp() });
      toast.success('Invite revoked.');
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not revoke the invite.');
    } finally {
      setBusyId(null);
    }
  };

  const removeCollaborator = async (uid: string) => {
    const db = getFirestoreClient();
    if (!db || !isHost) return;
    setBusyId(uid);
    try {
      // One atomic batch: drop the uid from the event AND delete the claim doc
      // — otherwise the removed user could silently re-join via the claim.
      const batch = writeBatch(db);
      batch.update(doc(db, 'events', eventId), {
        collaboratorIds: arrayRemove(uid),
        // deleteField (not null) — the self-join rules require every existing
        // name entry to be a string, so a null leftover would block re-joining.
        [`collaboratorNames.${uid}`]: deleteField(),
        [`collaboratorAccess.${uid}`]: deleteField(),
        updatedAt: serverTimestamp(),
      });
      batch.delete(doc(db, 'collabClaims', collabClaimId(eventId, uid)));
      await batch.commit();
      toast.success('Collaborator removed.');
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not remove the collaborator.');
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
      setTimeout(() => setCopied(null), 2000);
      toast.success('Link copied.');
    } catch {
      toast.error('Copy failed — select the link text manually.');
    }
  };

  /**
   * Host opens/closes a money section (vendors, budget) for one collaborator.
   * Host-only write (rules: 'collaboratorAccess' is in the host update keys).
   * The live event doc propagates it — the collaborator's tabs update instantly.
   */
  const setSectionAccess = async (uid: string, section: ShareableSection, shared: boolean) => {
    const db = getFirestoreClient();
    if (!db || !isHost) return;
    setBusyId(`${uid}:${section}`);
    try {
      await updateDoc(doc(db, 'events', eventId), {
        [`collaboratorAccess.${uid}.${section}`]: shared,
        updatedAt: serverTimestamp(),
      });
      toast.success(shared ? `${SECTION_LABELS[section]} shared.` : `${SECTION_LABELS[section]} hidden.`);
    } catch (error: any) {
      toast.error(error?.message ?? 'Could not update access.');
    } finally {
      setBusyId(null);
    }
  };

  const displayNameFor = (uid: string): string =>
    event.collaboratorNames?.[uid] || `Collaborator ···${uid.slice(-4)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Plan together
          </DialogTitle>
          <DialogDescription>
            Add your partner, family, or planner. Core planning is shared live — money stays private by default, and you decide who sees what.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {/* Collaborators */}
          <div>
            <p className="mb-2 text-sm font-medium">On this ceremony ({collaborators.length}/{MAX_COLLABORATORS})</p>
            {collaborators.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No collaborators yet — create an invite link below.
              </p>
            ) : (
              <ul className="space-y-2">
                {collaborators.map((uid) => (
                  <li key={uid} className="rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="truncate text-sm">{displayNameFor(uid)}</span>
                      {isHost && (
                        <div className="flex flex-shrink-0 items-center gap-1">
                          <Button
                            variant="ghost" size="sm" className="h-7 w-7 p-0"
                            onClick={() => setExpandedUid(expandedUid === uid ? null : uid)}
                            aria-label={`Sharing options for ${displayNameFor(uid)}`}
                            aria-expanded={expandedUid === uid}
                          >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-7 gap-1 text-destructive hover:text-destructive"
                            disabled={busyId === uid}
                            onClick={() => removeCollaborator(uid)}
                            aria-label={`Remove ${displayNameFor(uid)}`}
                          >
                            {busyId === uid ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Remove
                          </Button>
                        </div>
                      )}
                    </div>
                    {/* Privacy panel: money sections are OFF by default (safe
                        default — the rules enforce it, this just mirrors it). */}
                    {isHost && expandedUid === uid && (
                      <div className="border-t border-border px-3 py-2.5">
                        <p className="mb-2.5 text-xs text-muted-foreground">
                          Timeline, guests, tasks &amp; seating are shared. Money stays private unless you open it.
                        </p>
                        <div className="space-y-2.5">
                          {MONEY_SECTIONS.map((section) => (
                            <div key={section} className="flex items-center justify-between gap-3">
                              <span className="text-sm">{SECTION_LABELS[section]}</span>
                              <Switch
                                checked={isSectionShared(event.collaboratorAccess, uid, section)}
                                disabled={busyId === `${uid}:${section}`}
                                onCheckedChange={(checked: boolean) => setSectionAccess(uid, section, checked)}
                                aria-label={`Share ${SECTION_LABELS[section]} with ${displayNameFor(uid)}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {acceptedInvites.length > 0 && (
              <ul className="mt-3 space-y-2" aria-label="Accepted collaborator invitations">
                {acceptedInvites.map(({ invite, uid }) => (
                  <li key={invite.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                    <span className="truncate text-xs text-muted-foreground">
                      {event.collaboratorNames?.[uid] || `Collaborator ···${uid.slice(-4)}`}
                    </span>
                    <span className="flex-shrink-0 text-xs font-medium text-primary">Accepted</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Invite creation (host only) */}
          {isHost && (
            <div>
              <p className="mb-2 text-sm font-medium">Invite by link</p>
              <div className="mb-3 flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div>
                  <p className="text-sm font-medium">Let them view and manage the budget</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    They can add, edit, and remove budget items. Off by default.
                  </p>
                </div>
                <Switch
                  checked={shareBudgetForInvite}
                  disabled={creating}
                  onCheckedChange={setShareBudgetForInvite}
                  aria-label="Allow this collaborator to view and manage the budget"
                />
              </div>
              <Button onClick={createInvite} disabled={creating || collaborators.length >= MAX_COLLABORATORS} className="w-full gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Create invite link
              </Button>

              {lastLink && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-3">
                  <p className="mb-2 break-all font-mono text-xs text-muted-foreground">{lastLink}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => copyLink(lastLink)}>
                      {copied === lastLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy
                    </Button>
                    <Button size="sm" className="flex-1 gap-1.5"
                      onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Join me planning "${event.title}" on Gahundiq: ${lastLink}`)}`, '_blank')}>
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Pending invites */}
              {pendingInvites.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {pendingInvites.map((invite) => {
                    const link = collabInviteLink(invite.id);
                    return (
                      <li key={invite.id} className="rounded-lg border border-border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="block truncate text-xs text-muted-foreground">…{link.slice(-24)}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {invite.shareBudget === true ? 'Budget access enabled' : 'Budget private'}
                            </span>
                          </div>
                          <div className="flex flex-shrink-0 gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => copyLink(link)} aria-label="Copy invite link">
                              {copied === link ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-destructive hover:text-destructive"
                              disabled={busyId === invite.id} onClick={() => revokeInvite(invite.id)}>
                              {busyId === invite.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}