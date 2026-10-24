import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';
import { FREE_LIMITS, PAID_LIMITS } from '@/lib/plan-entitlements';
import { verifyFirebaseUser } from '@/lib/firebase-user';

export const runtime = 'nodejs';

function errorResponse(message: string, status: number) {
  return Response.json({ message }, { status });
}

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await context.params;
    const tokenMatch = (request.headers.get('authorization') ?? '').match(/^Bearer (.+)$/);
    if (!tokenMatch) return errorResponse('Sign in to record a broadcast.', 401);

    const app = getFirebaseAdminApp();
    const user = await verifyFirebaseUser(request);
    if (!user) return errorResponse('Your sign-in token is invalid or expired. Please sign in again.', 401);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Request body must be valid JSON.', 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return errorResponse('Invalid broadcast request.', 400);
    }
    const { recipientCount, reference } = body as Record<string, unknown>;
    if (!Number.isInteger(recipientCount) || (recipientCount as number) < 1 || typeof reference !== 'string' || reference.length > 2048) {
      return errorResponse('Broadcast recipient count or invitation link is invalid.', 400);
    }

    const db = getFirestore(app);
    const isAdmin = user.admin === true || (await db.doc(`admin/${user.uid}`).get()).exists;
    const eventRef = db.doc(`events/${eventId}`);
    const result = await db.runTransaction(async (transaction) => {
      const eventSnapshot = await transaction.get(eventRef);
      if (!eventSnapshot.exists) return { error: 'Event not found.', status: 404 };
      const event = eventSnapshot.data()!;
      if (event.hostId !== user.uid && !isAdmin) return { error: 'Only the event host can record a broadcast.', status: 403 };

      const subscriptionSnapshot = event.hostId
        ? await transaction.get(db.doc(`subscriptions/${event.hostId}`))
        : null;
      const subscription = subscriptionSnapshot?.data();
      const baseLimit = event.tier === 'premium' ? PAID_LIMITS.invites : FREE_LIMITS.invites;
      const maxRecipients = typeof event.invitationCapacityOverride === 'number'
        ? event.invitationCapacityOverride
        : typeof subscription?.maxInvites === 'number' ? subscription.maxInvites : baseLimit;
      const history = Array.isArray(event.invitationBroadcasts) ? event.invitationBroadcasts : [];
      const usedRecipients = history.reduce((total: number, entry: unknown) => {
        if (!entry || typeof entry !== 'object') return total;
        const count = (entry as { guestCount?: unknown }).guestCount;
        return total + (typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0);
      }, 0);
      if (usedRecipients + (recipientCount as number) > maxRecipients) {
        return {
          error: `Broadcast capacity exceeded. ${Math.max(0, maxRecipients - usedRecipients)} recipients remain for this event.`,
          status: 409,
        };
      }

      const updatedHistory = [
        ...history,
        {
          sentAt: Timestamp.now(),
          sentBy: user.uid,
          guestCount: recipientCount,
          method: 'link',
          reference,
        },
      ];
      transaction.update(eventRef, { invitationBroadcasts: updatedHistory, updatedAt: Timestamp.now() });
      return { remaining: maxRecipients - usedRecipients - (recipientCount as number) };
    });

    if ('error' in result && result.error) return errorResponse(result.error, result.status ?? 500);
    return Response.json(result);
  } catch (error) {
    console.error('Could not record invitation broadcast.', error);
    return errorResponse('Could not record the broadcast. Please try again.', 500);
  }
}
