import { randomBytes } from 'node:crypto';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';
import { verifyFirebaseUser } from '@/lib/firebase-user';
import { getInvitationLimit } from '@/lib/plan-entitlements';
import type { Subscription } from '@/types/firestore';

export const runtime = 'nodejs';

function errorResponse(message: string, status: number) {
  return Response.json({ message }, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    const user = await verifyFirebaseUser(request);
    if (!user) return errorResponse('Your sign-in token is invalid or expired. Please sign in again.', 401);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse('Request body must be valid JSON.', 400);
    }
    if (!isRecord(body)
      || typeof body.guestId !== 'string'
      || !body.guestId
      || body.guestId.includes('/')
      || Object.keys(body).some((key) => key !== 'guestId')) {
      return errorResponse('Guest ID is invalid.', 400);
    }

    const { eventId } = await context.params;
    const db = getFirestore(getFirebaseAdminApp());
    const eventRef = db.doc(`events/${eventId}`);
    const guestRef = eventRef.collection('guests').doc(body.guestId);
    const inviteCollection = eventRef.collection('invites');
    const isAdmin = user.admin === true || (await db.doc(`admin/${user.uid}`).get()).exists;

    const result = await db.runTransaction(async (transaction) => {
      const eventSnapshot = await transaction.get(eventRef);
      if (!eventSnapshot.exists) return { error: 'Event not found.', status: 404 } as const;
      const guestSnapshot = await transaction.get(guestRef);
      if (!guestSnapshot.exists) return { error: 'Guest not found.', status: 404 } as const;

      const event = eventSnapshot.data()!;
      const collaborator = Array.isArray(event.collaboratorIds)
        && event.collaboratorIds.includes(user.uid);
      if (!isAdmin && event.hostId !== user.uid && !collaborator) {
        return { error: 'You do not have access to this event.', status: 403 } as const;
      }
      if (!isAdmin && event.hostId !== user.uid && collaborator) {
        const access = isRecord(event.collaboratorAccess) ? event.collaboratorAccess : {};
        const userAccess = access[user.uid];
        if (!isRecord(userAccess) || userAccess.guests !== true) {
          return { error: 'The host has not shared the guest list with you.', status: 403 } as const;
        }
      }

      const existingInviteSnapshot = await transaction.get(
        inviteCollection.where('guestId', '==', body.guestId).limit(1),
      );
      if (!existingInviteSnapshot.empty) {
        return { token: existingInviteSnapshot.docs[0].id } as const;
      }

      const subscriptionSnapshot = event.hostId
        ? await transaction.get(db.doc(`subscriptions/${event.hostId}`))
        : null;
      const subscription = subscriptionSnapshot?.data() as Subscription | undefined;
      const limit = getInvitationLimit({
        tier: event.tier === 'premium' ? 'premium' : 'free',
        invitationCapacityOverride: event.invitationCapacityOverride,
      }, subscription);
      const storedCount = event._inviteUsageCount;
      const currentCount = typeof storedCount === 'number'
        && Number.isInteger(storedCount)
        && storedCount >= 0
        ? storedCount
        : (await transaction.get(inviteCollection.limit(limit))).size;

      if (!isAdmin && currentCount >= limit) {
        return {
          error: `Invitation capacity reached. This event supports up to ${limit} invites.`,
          status: 409,
        } as const;
      }

      const token = randomBytes(30).toString('base64url');
      const inviteRef = inviteCollection.doc(token);
      const guest = guestSnapshot.data()!;
      transaction.create(inviteRef, {
        token,
        eventId,
        guestId: body.guestId,
        guestName: guest.name,
        eventTitle: event.title,
        eventDate: event.date ?? null,
        eventVenue: event.venue ?? '',
        rsvp: 'pending',
        createdAt: Timestamp.now(),
        respondedAt: null,
      });
      transaction.update(guestRef, {
        inviteSentAt: Timestamp.now(),
        inviteToken: token,
      });
      transaction.update(eventRef, {
        _inviteUsageCount: currentCount + 1,
        updatedAt: Timestamp.now(),
      });
      return { token } as const;
    });

    if ('error' in result && result.error) return errorResponse(result.error, result.status);
    return Response.json(result);
  } catch (error) {
    console.error('Could not create the invitation.', error);
    return errorResponse('Could not create the invitation. Please try again.', 500);
  }
}
