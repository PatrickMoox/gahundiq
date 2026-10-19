import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { verifyAppSession } from '@/lib/app-session';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';
import { getGuestLimit } from '@/lib/plan-entitlements';
import type { Subscription } from '@/types/firestore';

export const runtime = 'nodejs';

function errorResponse(message: string, status: number) {
  return Response.json({ message }, { status });
}

async function authenticate(request: Request) {
  return verifyAppSession(request);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const user = await verifyAppSession(request);
  if (!user) return errorResponse('Your app session is invalid or expired. Please sign in again.', 401);
  const { eventId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Request body must be valid JSON.', 400);
  }
  if (!isRecord(body) || Object.keys(body).some((key) => !['name', 'email', 'dietary', 'isVIP', 'rsvp'].includes(key))) {
    return errorResponse('Invalid guest data.', 400);
  }
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 120) {
    return errorResponse('Guest name is required and must be 120 characters or fewer.', 400);
  }
  const guestName = body.name.trim();
  if (body.email !== undefined && (typeof body.email !== 'string' || body.email.length > 254)) {
    return errorResponse('Guest email is invalid.', 400);
  }
  const dietaryOptions = ['vegetarian', 'vegan', 'gluten-free', 'halal', 'kosher', 'none'];
  if (body.dietary !== undefined && !dietaryOptions.includes(body.dietary as string)) {
    return errorResponse('Dietary preference is invalid.', 400);
  }
  if (body.isVIP !== undefined && typeof body.isVIP !== 'boolean') {
    return errorResponse('VIP status is invalid.', 400);
  }
  if (body.rsvp !== undefined && !['pending', 'confirmed', 'declined'].includes(body.rsvp as string)) {
    return errorResponse('RSVP status is invalid.', 400);
  }

  const db = getFirestore(getFirebaseAdminApp());
  const eventRef = db.doc(`events/${eventId}`);
  const guestCollection = eventRef.collection('guests');
  const guestRef = guestCollection.doc();
  const isAdmin = user.admin === true || (await db.doc(`admin/${user.uid}`).get()).exists;

  try {
    const result = await db.runTransaction(async (transaction) => {
      const eventSnapshot = await transaction.get(eventRef);
      if (!eventSnapshot.exists) return { error: 'Event not found.', status: 404 } as const;
      const event = eventSnapshot.data()!;
      const admin = isAdmin;
      const collaborator = Array.isArray(event.collaboratorIds) && event.collaboratorIds.includes(user.uid);
      if (!admin && event.hostId !== user.uid && !collaborator) {
        return { error: 'You do not have access to this event.', status: 403 } as const;
      }
      if (!admin && collaborator && event.hostId !== user.uid) {
        const access = isRecord(event.collaboratorAccess) ? event.collaboratorAccess : {};
        const accessEntry = access[user.uid];
        const userAccess = isRecord(accessEntry) ? accessEntry : {};
        if (userAccess.guests !== true) {
          return { error: 'The host has not shared the guest list with you.', status: 403 } as const;
        }
      }

      const subscriptionSnapshot = event.hostId
        ? await transaction.get(db.doc(`subscriptions/${event.hostId}`))
        : null;
      const subscription = subscriptionSnapshot?.data() as Subscription | undefined;
      const limit = getGuestLimit({
        tier: event.tier === 'premium' ? 'premium' : 'free',
        guestCapacityOverride: event.guestCapacityOverride,
      }, subscription);
      let count = event._guestUsageCount;
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
        const existingGuests = await transaction.get(guestCollection.limit(limit));
        count = existingGuests.size;
      }
      if (count >= limit && !admin) {
        return { error: `Guest capacity reached. This event supports up to ${limit} guests.`, status: 409 } as const;
      }

      const now = Timestamp.now();
      transaction.create(guestRef, {
        name: guestName,
        ...(body.email ? { email: body.email } : {}),
        dietary: body.dietary ?? 'none',
        isVIP: body.isVIP ?? false,
        rsvp: body.rsvp ?? 'pending',
        createdAt: now,
        updatedAt: now,
      });
      transaction.update(eventRef, { _guestUsageCount: count + 1 });
      return { id: guestRef.id } as const;
    });
    if ('error' in result && result.error) return errorResponse(result.error, result.status ?? 500);
    return Response.json(result);
  } catch (error) {
    console.error('Could not add guest.', error);
    return errorResponse('Could not add the guest. Please try again.', 500);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const user = await authenticate(request);
  if (!user) return errorResponse('Sign in to remove a guest.', 401);
  const { eventId } = await context.params;
  const guestId = new URL(request.url).searchParams.get('guestId');
  if (!guestId || guestId.includes('/')) return errorResponse('Guest ID is invalid.', 400);

  const db = getFirestore(getFirebaseAdminApp());
  const eventRef = db.doc(`events/${eventId}`);
  const guestRef = eventRef.collection('guests').doc(guestId);
  const isAdmin = user.admin === true || (await db.doc(`admin/${user.uid}`).get()).exists;
  try {
    const result = await db.runTransaction(async (transaction) => {
      const eventSnapshot = await transaction.get(eventRef);
      const guestSnapshot = await transaction.get(guestRef);
      if (!eventSnapshot.exists || !guestSnapshot.exists) return { error: 'Guest not found.', status: 404 } as const;
      const event = eventSnapshot.data()!;
      const admin = isAdmin;
      const collaborator = Array.isArray(event.collaboratorIds) && event.collaboratorIds.includes(user.uid);
      if (!admin && event.hostId !== user.uid && !collaborator) {
        return { error: 'You do not have access to this event.', status: 403 } as const;
      }
      if (!admin && collaborator && event.hostId !== user.uid) {
        const access = isRecord(event.collaboratorAccess) ? event.collaboratorAccess : {};
        const accessEntry = access[user.uid];
        const userAccess = isRecord(accessEntry) ? accessEntry : {};
        if (userAccess.guests !== true) {
          return { error: 'The host has not shared the guest list with you.', status: 403 } as const;
        }
      }

      let count = event._guestUsageCount;
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
        const guests = await transaction.get(eventRef.collection('guests'));
        count = guests.size;
      }
      transaction.delete(guestRef);
      transaction.update(eventRef, { _guestUsageCount: Math.max(0, count - 1) });
      return { deleted: true } as const;
    });
    if ('error' in result && result.error) return errorResponse(result.error, result.status ?? 500);
    return Response.json(result);
  } catch (error) {
    console.error('Could not remove guest.', error);
    return errorResponse('Could not remove the guest. Please try again.', 500);
  }
}
