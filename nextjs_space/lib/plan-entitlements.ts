import type { EventData, Subscription } from '@/types/firestore';

export type PaidFeature = 'seating' | 'budget' | 'gifts' | 'coordinator' | 'watermarkFree';

export const FREE_LIMITS = {
  activeCeremonies: 1,
  guests: 25,
  invites: 25,
  storageMb: 250,
} as const;

export const PAID_LIMITS = {
  activeCeremonies: 10,
  guests: 250,
  invites: 500,
  storageMb: 2048,
} as const;

export function canUseFeature(event: EventData, feature: PaidFeature): boolean {
  if (event.tier === 'premium') return true;
  return feature === 'watermarkFree' ? false : false;
}

export function getEventLimits(event: EventData) {
  return event.tier === 'premium' ? PAID_LIMITS : FREE_LIMITS;
}

/**
 * True when the user holds an entitlement-granting subscription.
 * Used by the admin console and the event wizard: a support-granted
 * premium subscription behaves like a paid plan.
 */
export function isSubscriptionActive(
  subscription: Pick<Subscription, 'tier' | 'status' | 'currentPeriodEnd'> | null | undefined,
): boolean {
  if (!subscription || subscription.tier !== 'premium') return false;
  if (subscription.status === 'canceled' || subscription.status === 'past_due') return false;
  const end = subscription.currentPeriodEnd;
  if (!end) return true; // open-ended grant (e.g., comped by support)
  const endDate = end?.toDate instanceof Function ? end.toDate() : new Date(end);
  if (!endDate || Number.isNaN(endDate.getTime())) return true;
  return endDate.getTime() > Date.now();
}
