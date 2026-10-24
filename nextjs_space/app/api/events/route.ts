import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { verifyFirebaseUser } from '@/lib/firebase-user';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';
import { FREE_LIMITS, PAID_LIMITS, getGuestLimit, isSubscriptionActive } from '@/lib/plan-entitlements';
import { CURRENCIES } from '@/lib/currency';
import type { Subscription } from '@/types/firestore';

export const runtime = 'nodejs';

const EVENT_TYPES = ['wedding', 'birthday', 'corporate', 'memorial', 'baby_shower', 'potluck', 'webinar', 'other'];

function errorResponse(message: string, status: number) {
  return Response.json({ message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const user = await verifyFirebaseUser(request);
  if (!user) return errorResponse('Your sign-in token is invalid or expired. Please sign in again.', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Request body must be valid JSON.', 400);
  }
  if (!isRecord(body) || Object.keys(body).some((key) => !['title', 'eventType', 'date', 'venue', 'guestCount', 'currency'].includes(key))) {
    return errorResponse('Invalid ceremony details.', 400);
  }
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 120) {
    return errorResponse('Ceremony title is required and must be 120 characters or fewer.', 400);
  }
  if (typeof body.eventType !== 'string' || !EVENT_TYPES.includes(body.eventType)) {
    return errorResponse('Ceremony type is invalid.', 400);
  }
  if (body.date !== null && (typeof body.date !== 'string' || Number.isNaN(new Date(body.date).getTime()))) {
    return errorResponse('Ceremony date is invalid.', 400);
  }
  if (typeof body.venue !== 'string' || body.venue.length > 200) {
    return errorResponse('Venue must be 200 characters or fewer.', 400);
  }
  if (!Number.isInteger(body.guestCount) || (body.guestCount as number) < 1 || (body.guestCount as number) > 100000) {
    return errorResponse('Guest count must be a whole number from 1 to 100,000.', 400);
  }
  if (typeof body.currency !== 'string' || !CURRENCIES.some(({ code }) => code === body.currency)) {
    return errorResponse('Currency is invalid.', 400);
  }
  const title = body.title.trim();
  const eventType = body.eventType;
  const venue = body.venue.trim();
  const guestCount = body.guestCount as number;
  const ceremonyDate = body.date as string | null;
  const currency = body.currency;

  const db = getFirestore(getFirebaseAdminApp());
  const admin = user.admin === true || (await db.doc(`admin/${user.uid}`).get()).exists;
  const subscriptionRef = db.doc(`subscriptions/${user.uid}`);
  const userEventLockRef = db.doc(`_eventCreationLocks/${user.uid}`);
  const eventRef = db.collection('events').doc();

  try {
    const result = await db.runTransaction(async (transaction) => {
      const lockSnapshot = await transaction.get(userEventLockRef);
      const subscriptionSnapshot = await transaction.get(subscriptionRef);
      const ownedEvents = await transaction.get(
        db.collection('events').where('hostId', '==', user.uid),
      );
      const subscription = subscriptionSnapshot.data() as Subscription | undefined;
      const premium = isSubscriptionActive(subscription);
      const tier = premium ? 'premium' : 'free';
      const guestLimit = getGuestLimit({ tier }, subscription);
      const planLimit = premium
        ? (typeof subscription?.maxEvents === 'number' && Number.isInteger(subscription.maxEvents) && subscription.maxEvents > 0
          ? subscription.maxEvents
          : PAID_LIMITS.activeCeremonies)
        : FREE_LIMITS.activeCeremonies;

      if (!admin && ownedEvents.size >= planLimit) {
        return {
          error: `You have reached your limit of ${planLimit} active ${planLimit === 1 ? 'ceremony' : 'ceremonies'}. Collaborator access to another host's ceremony does not use your limit.`,
          status: 409,
        } as const;
      }
      if (!admin && guestCount > guestLimit) {
        return {
          error: `Your ${tier} plan supports up to ${guestLimit} guests per ceremony.`,
          status: 409,
        } as const;
      }

      transaction.set(userEventLockRef, {
        revision: lockSnapshot.exists ? FieldValue.increment(1) : 1,
        updatedAt: Timestamp.now(),
      });
      transaction.create(eventRef, {
        hostId: user.uid,
        collaboratorIds: [],
        title,
        eventType,
        date: ceremonyDate ? Timestamp.fromDate(new Date(ceremonyDate)) : null,
        venue,
        guestCount,
        tier,
        currency,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      return { id: eventRef.id } as const;
    });

    if ('error' in result && result.error) return errorResponse(result.error, result.status ?? 500);
    return Response.json(result);
  } catch (error) {
    console.error('Could not create ceremony.', error);
    return errorResponse('Could not create the ceremony. Please try again.', 500);
  }
}
