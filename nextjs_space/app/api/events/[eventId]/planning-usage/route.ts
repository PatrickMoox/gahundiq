import { getFirestore } from 'firebase-admin/firestore';
import { verifyFirebaseUser } from '@/lib/firebase-user';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';
import { isSubscriptionActive } from '@/lib/plan-entitlements';
import type { PlanningCollection } from '@/lib/plan-entitlements';
import type { Subscription } from '@/types/firestore';

export const runtime = 'nodejs';

const PLANNING_COLLECTIONS: readonly PlanningCollection[] = ['budget', 'vendors', 'timeline', 'tasks'];

function errorResponse(message: string, status: number) {
  return Response.json({ message }, { status });
}

function isPlanningCollection(value: unknown): value is PlanningCollection {
  return typeof value === 'string'
    && PLANNING_COLLECTIONS.includes(value as PlanningCollection);
}

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const user = await verifyFirebaseUser(request);
  if (!user) return errorResponse('Your sign-in token is invalid or expired. Please sign in again.', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Request body must be valid JSON.', 400);
  }
  if (typeof body !== 'object' || body === null || !('collection' in body)
    || !isPlanningCollection(body.collection)
    || Object.keys(body).some((key) => key !== 'collection')) {
    return errorResponse('Planning collection is invalid.', 400);
  }

  const { eventId } = await context.params;
  const collectionName = body.collection;
  try {
    const db = getFirestore(getFirebaseAdminApp());
    const eventRef = db.doc(`events/${eventId}`);
    const isAdmin = user.admin === true || (await db.doc(`admin/${user.uid}`).get()).exists;

    const result = await db.runTransaction(async (transaction) => {
      const eventSnapshot = await transaction.get(eventRef);
      if (!eventSnapshot.exists) return { error: 'Event not found.', status: 404 } as const;

      const event = eventSnapshot.data()!;
      const collaborator = Array.isArray(event.collaboratorIds)
        && event.collaboratorIds.includes(user.uid);
      if (!isAdmin && event.hostId !== user.uid && !collaborator) {
        return { error: 'You do not have access to this event.', status: 403 } as const;
      }
      if (!isAdmin && event.hostId !== user.uid && collaborator) {
        const sectionAccess = event.collaboratorAccess?.[user.uid] ?? {};
        const defaultAccess = collectionName === 'timeline' || collectionName === 'tasks';
        if ((sectionAccess[collectionName] ?? defaultAccess) !== true) {
          return { error: `The host has not shared the ${collectionName} section with you.`, status: 403 } as const;
        }
      }

      const [itemsSnapshot, subscriptionSnapshot] = await Promise.all([
        transaction.get(eventRef.collection(collectionName)),
        event.hostId
          ? transaction.get(db.doc(`subscriptions/${event.hostId}`))
          : Promise.resolve(null),
      ]);
      const previousUsage = event._planningUsage?.[collectionName];
      const storedCount = typeof previousUsage === 'number'
        && Number.isInteger(previousUsage)
        && previousUsage >= 0
        ? previousUsage
        : 0;
      const subscription = subscriptionSnapshot?.data() as Subscription | undefined;
      const updates: Record<string, unknown> = {
        [`_planningUsage.${collectionName}`]: Math.max(storedCount, itemsSnapshot.size),
      };
      if (isSubscriptionActive(subscription)) updates.tier = 'premium';
      transaction.update(eventRef, updates);
      return { synchronized: true } as const;
    });

    if ('error' in result && result.error) return errorResponse(result.error, result.status);
    return Response.json({ synchronized: true });
  } catch (error) {
    console.error('Could not synchronize event planning usage.', error);
    return errorResponse('Could not synchronize planning usage. Please try again.', 500);
  }
}
