// ============================================================================
// Event collaboration (Phase 1) — invite-by-link for co-hosts, e.g. the groom
// joining the bride's ceremony.
//
// Flow: host generates a 40-char token doc at `collabInvites/{token}` and
// shares `${origin}/collab/accept/{token}` (WhatsApp-first market). The
// invitee signs in, accepts, which (atomically, in one writeBatch):
//   1. marks the invite accepted (proves they hold the secret token), and
//   2. writes a claim doc at `collabClaims/{eventId}_{uid}` (getAfter-verified
//      against the accepted invite — see firestore.rules).
// The client then adds its own uid to `events/{eventId}.collaboratorIds` —
// allowed by rules only while a matching claim doc exists, so a user can
// never self-join an event without a valid, accepted invite.
// Hosts remove collaborators by clearing the ids AND deleting the claim doc
// (otherwise the removed user could re-add themselves).
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type { CollaboratorAccess, ShareableSection, Subscription } from '@/types/firestore';
import { isSubscriptionActive } from '@/lib/plan-entitlements';

// Re-exported so call sites can import section-sharing types from here.
export type { CollaboratorAccess, ShareableSection };

/** How long an invite link stays valid after creation. */
export const COLLAB_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Accepted collaborators per ceremony, determined by the host's active plan. */
export const COLLABORATOR_LIMITS = {
  free: 1,
  ceremonyPass: 3,
  planner: 5,
} as const;

/** Absolute ceiling across all plans. */
export const MAX_COLLABORATORS = COLLABORATOR_LIMITS.planner;

export function getCollaboratorLimit(
  subscription: Pick<Subscription, 'tier' | 'status' | 'currentPeriodEnd' | 'billingCycle'> | null | undefined,
): number {
  if (!subscription || !isSubscriptionActive(subscription)) return COLLABORATOR_LIMITS.free;
  return subscription.billingCycle === 'monthly'
    ? COLLABORATOR_LIMITS.planner
    : COLLABORATOR_LIMITS.ceremonyPass;
}

// ── Phase 1.5: section sharing (host controls what collaborators see) ──────

/** Sensitive sections stay hidden until the host explicitly shares them. */
export const RESTRICTED_SECTIONS: readonly ShareableSection[] = ['vendors', 'budget', 'guests', 'gifts'] as const;

/** Human labels for the collaborator access toggles. */
export const SECTION_LABELS: Record<ShareableSection, string> = {
  timeline: 'Timeline',
  vendors: 'Vendor pricing',
  guests: 'Guest list',
  seating: 'Seating',
  tasks: 'Tasks',
  budget: 'Budget',
  gifts: 'Gift records',
};

/**
 * Client mirror of the rules' collaborator section defaults. Sensitive
 * sections require explicit host permission; the rules are authoritative.
 */
export function isSectionShared(
  access: Record<string, CollaboratorAccess> | undefined | null,
  uid: string | undefined | null,
  section: ShareableSection,
): boolean {
  if (!uid) return false;
  const value = access?.[uid]?.[section];
  if (typeof value === 'boolean') return value;
  return !RESTRICTED_SECTIONS.includes(section);
}

/** URL-safe 40-char capability token (same shape/entropy as guest invites). */
export function generateCollabToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const randomInt = (max: number): number => {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      // Rejection sampling keeps the distribution unbiased (256 % 62 != 0).
      const limit = Math.floor(256 / max) * max;
      const buf = new Uint8Array(1);
      do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  };
  let token = '';
  for (let i = 0; i < 40; i += 1) token += chars[randomInt(chars.length)];
  return token;
}

/** Claim doc id — the rules validate this exact composition. */
export function collabClaimId(eventId: string, uid: string): string {
  return `${eventId}_${uid}`;
}

/** Full shareable link for an invite token. */
export function collabInviteLink(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/collab/accept/${token}`;
}