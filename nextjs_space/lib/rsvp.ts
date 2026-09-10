import type { GuestData, InviteData, RsvpStatus } from '@/types/firestore';

/**
 * Single source of truth for a guest's effective RSVP.
 *
 * Guests respond through the public invite link, which writes ONLY the invite
 * document (firestore.rules restrict the guest-facing update to rsvp/
 * respondedAt) — the guest document itself is never updated by that flow.
 * So: an invite response (when one exists) always wins, and the host-set
 * `rsvp` on the guest doc is the fallback. Stats that read only `guest.rsvp`
 * silently ignore every real guest response.
 */
export function effectiveRsvp(
  guest: Pick<GuestData, 'id' | 'rsvp'> | undefined,
  invites: InviteData[] | Map<string, InviteData>,
): RsvpStatus {
  const invite = guest?.id
    ? invites instanceof Map ? invites.get(guest.id) : invites.find((i) => i.guestId === guest.id)
    : undefined;
  if (invite?.respondedAt && invite.rsvp) return invite.rsvp;
  return (guest?.rsvp ?? 'pending') as RsvpStatus;
}

export interface RsvpCounts {
  confirmed: number;
  declined: number;
  pending: number;
}

/** Confirmed/declined/pending tallies across guests, including invite responses. */
export function rsvpCounts(guests: GuestData[] | null | undefined, invites: InviteData[] | null | undefined): RsvpCounts {
  const byGuest = new Map<string, InviteData>();
  (invites ?? []).forEach((i) => { if (i?.guestId) byGuest.set(i.guestId, i); });
  const counts: RsvpCounts = { confirmed: 0, declined: 0, pending: 0 };
  (guests ?? []).forEach((g) => {
    counts[effectiveRsvp(g, byGuest)] += 1;
  });
  return counts;
}