import type { EventData, Subscription } from '@/types/firestore';
export type PaidFeature = 'seating' | 'budget' | 'gifts' | 'coordinator' | 'watermarkFree';

export const FREE_LIMITS = {
  activeCeremonies: 1,
  guests: 25,
  invites: 25,
  storageMb: 250,
  budgetItems: 5,
  vendors: 5,
  timelineItems: 5,
  tasks: 10,
} as const;

export type PlanningCollection = 'budget' | 'vendors' | 'timeline' | 'tasks';

const FREE_PLANNING_LIMITS: Record<PlanningCollection, number> = {
  budget: FREE_LIMITS.budgetItems,
  vendors: FREE_LIMITS.vendors,
  timeline: FREE_LIMITS.timelineItems,
  tasks: FREE_LIMITS.tasks,
};

/** Free-plan item limits; premium events have no item-count cap. */
export function getPlanningItemLimit(event: Pick<EventData, 'tier'>, collection: PlanningCollection): number | null {
  return event.tier === 'premium' ? null : FREE_PLANNING_LIMITS[collection];
}

export const PAID_LIMITS = {
  activeCeremonies: 10,
  guests: 250,
  invites: 500,
  storageMb: 2048,
} as const;

/**
 * Whether a paid feature is unlocked for this event. Free-tier events unlock
 * no paid features at all — they are bounded by FREE_LIMITS instead.
 */
export function canUseFeature(event: EventData, _feature: PaidFeature): boolean {
  return event.tier === 'premium';
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
