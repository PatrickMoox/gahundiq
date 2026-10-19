import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';
import { verifyAppSession } from '@/lib/app-session';
import { FREE_LIMITS } from '@/lib/plan-entitlements';

export const runtime = 'nodejs';

const COLLECTION_LIMITS = {
  budget: FREE_LIMITS.budgetItems,
  vendors: FREE_LIMITS.vendors,
  timeline: FREE_LIMITS.timelineItems,
  tasks: FREE_LIMITS.tasks,
} as const;

type PlanningCollection = keyof typeof COLLECTION_LIMITS;

const ALLOWED_FIELDS: Record<PlanningCollection, string[]> = {
  budget: ['eventId', 'category', 'name', 'estimatedCost', 'actualCost', 'depositPaid', 'balanceDue', 'isPaid', 'dueDate', 'vendorId', 'notes'],
  vendors: ['eventId', 'category', 'name', 'contactName', 'phone', 'email', 'website', 'arrivalTime', 'totalAmount', 'depositPaid', 'notes'],
  timeline: ['eventId', 'track', 'startTime', 'endTime', 'title', 'description', 'assignedTo', 'vendorId', 'budgetItemId', 'color', 'status', 'order'],
  tasks: ['eventId', 'title', 'milestone', 'priority', 'category', 'assignedTo', 'vendorId', 'budgetItemId', 'description', 'dueDate', 'status'],
};

const STRING_FIELDS: Record<PlanningCollection, string[]> = {
  budget: ['category', 'name', 'notes'],
  vendors: ['category', 'name', 'contactName', 'phone', 'email', 'website', 'arrivalTime', 'notes'],
  timeline: ['track', 'startTime', 'endTime', 'title', 'description', 'assignedTo', 'color', 'status'],
  tasks: ['title', 'milestone', 'priority', 'category', 'assignedTo', 'description', 'status'],
};

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeData(collection: PlanningCollection, input: unknown, eventId: string): Record<string, unknown> {
  if (!isRecord(input)) throw new RequestError('Invalid item data.', 400);
  if (input.eventId !== eventId) throw new RequestError('The item must belong to this event.', 400);
  if (Object.keys(input).some((key) => !ALLOWED_FIELDS[collection].includes(key))) {
    throw new RequestError('The item contains unsupported fields.', 400);
  }
  for (const field of STRING_FIELDS[collection]) {
    if (field in input && typeof input[field] !== 'string') {
      throw new RequestError(`${field} must be text.`, 400);
    }
  }
  for (const field of ['vendorId', 'budgetItemId']) {
    if (field in input && input[field] !== null && (typeof input[field] !== 'string' || !input[field] || input[field].includes('/'))) {
      throw new RequestError(`${field} must be a valid reference or null.`, 400);
    }
  }

  const data = { ...input };
  const nameField = collection === 'timeline' || collection === 'tasks' ? 'title' : 'name';
  if (typeof data[nameField] !== 'string' || !data[nameField].trim()) {
    throw new RequestError('An item name is required.', 400);
  }

  if (collection === 'budget') {
    const amounts = ['estimatedCost', 'actualCost', 'depositPaid'];
    for (const field of amounts) {
      if (typeof data[field] !== 'number' || !Number.isFinite(data[field]) || (data[field] as number) < 0) {
        throw new RequestError(`${field} must be a non-negative number.`, 400);
      }
    }
    if ((data.depositPaid as number) > (data.actualCost as number)) {
      throw new RequestError('Deposit cannot exceed actual cost.', 400);
    }
    if (typeof data.isPaid !== 'boolean') throw new RequestError('Payment status is invalid.', 400);
    data.balanceDue = data.isPaid ? 0 : (data.actualCost as number) - (data.depositPaid as number);
  }

  if (collection === 'vendors') {
    for (const field of ['totalAmount', 'depositPaid']) {
      if (typeof data[field] !== 'number' || !Number.isFinite(data[field]) || (data[field] as number) < 0) {
        throw new RequestError(`${field} must be a non-negative number.`, 400);
      }
    }
    if ((data.depositPaid as number) > (data.totalAmount as number)) {
      throw new RequestError('Deposit cannot exceed total amount.', 400);
    }
  }

  if (collection === 'timeline' && (typeof data.order !== 'number' || !Number.isFinite(data.order))) {
    throw new RequestError('Timeline order must be a number.', 400);
  }

  if (collection === 'budget' || collection === 'tasks') {
    if (data.dueDate == null || data.dueDate === '') {
      data.dueDate = null;
    } else if (typeof data.dueDate === 'string') {
      const dueDate = new Date(data.dueDate);
      if (Number.isNaN(dueDate.getTime())) throw new RequestError('Due date is invalid.', 400);
      data.dueDate = dueDate;
    } else {
      throw new RequestError('Due date is invalid.', 400);
    }
  }

  return data;
}

export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await context.params;
    const authorization = request.headers.get('authorization') ?? '';
    const tokenMatch = authorization.match(/^Bearer (.+)$/);
    if (!tokenMatch) throw new RequestError('Sign in to add this item.', 401);

    const app = getFirebaseAdminApp();
    const db = getFirestore(app);
    const activeSessionUser = await verifyAppSession(request);
    if (!activeSessionUser) throw new RequestError('Your app session is invalid or expired. Please sign in again.', 401);
    const decodedToken = activeSessionUser;
    const isAdmin = decodedToken.admin === true
      || (await db.doc(`admin/${decodedToken.uid}`).get()).exists;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new RequestError('Request body must be valid JSON.', 400);
    }
    if (!isRecord(body) || typeof body.collection !== 'string' || !Object.prototype.hasOwnProperty.call(COLLECTION_LIMITS, body.collection)) {
      throw new RequestError('Unsupported planning collection.', 400);
    }
    const collectionName = body.collection as PlanningCollection;
    const data = normalizeData(collectionName, body.data, eventId);
    const eventRef = db.doc(`events/${eventId}`);
    const itemCollection = eventRef.collection(collectionName);
    const itemRef = itemCollection.doc();
    const accessDefault = collectionName !== 'budget' && collectionName !== 'vendors';

    const result = await db.runTransaction(async (transaction) => {
      const eventSnapshot = await transaction.get(eventRef);
      if (!eventSnapshot.exists) throw new RequestError('Event not found.', 404);
      const event = eventSnapshot.data()!;
      const collaborator = Array.isArray(event.collaboratorIds) && event.collaboratorIds.includes(decodedToken.uid);
      const authorized = isAdmin || event.hostId === decodedToken.uid || collaborator;
      if (!authorized) throw new RequestError('You do not have access to this event.', 403);

      if (!isAdmin && collaborator && event.hostId !== decodedToken.uid) {
        const access = isRecord(event.collaboratorAccess) ? event.collaboratorAccess : {};
        const accessForUser = access[decodedToken.uid];
        const userAccess: Record<string, unknown> = {};
        if (isRecord(accessForUser)) Object.assign(userAccess, accessForUser);
        const sectionAllowed = userAccess[collectionName] ?? accessDefault;
        if (sectionAllowed !== true) {
          throw new RequestError('The host has not shared this section with you.', 403);
        }
      }

      for (const [field, targetCollection, requiredSection] of [
        ['vendorId', 'vendors', 'vendors'],
        ['budgetItemId', 'budget', 'budget'],
      ] as const) {
        const referenceId = data[field];
        if (typeof referenceId !== 'string') continue;
        if (!isAdmin && collaborator && event.hostId !== decodedToken.uid) {
          const access = isRecord(event.collaboratorAccess) ? event.collaboratorAccess : {};
          const accessEntry = access[decodedToken.uid];
          const userAccess = isRecord(accessEntry) ? accessEntry : {};
          const sectionDefault = requiredSection !== 'budget' && requiredSection !== 'vendors';
          if ((userAccess[requiredSection] ?? sectionDefault) !== true) {
            throw new RequestError(`The host must share ${requiredSection} access before you can link it.`, 403);
          }
        }
        const referenceSnapshot = await transaction.get(eventRef.collection(targetCollection).doc(referenceId));
        if (!referenceSnapshot.exists) throw new RequestError(`Selected ${requiredSection === 'budget' ? 'budget item' : 'vendor'} was not found in this ceremony.`, 400);
      }

      let usageCount: number | null = null;
      if (!isAdmin) {
        const usage = isRecord(event._planningUsage) ? event._planningUsage : {};
        const storedCount = usage[collectionName];
        if (typeof storedCount === 'number' && Number.isInteger(storedCount) && storedCount >= 0) {
          usageCount = storedCount;
        } else if (event.tier !== 'premium') {
          const existingItems = await transaction.get(itemCollection.limit(COLLECTION_LIMITS[collectionName]));
          usageCount = existingItems.size;
        }

        if (event.tier !== 'premium' && usageCount !== null && usageCount >= COLLECTION_LIMITS[collectionName]) {
          throw new RequestError(
            `Free plan limit reached: ${COLLECTION_LIMITS[collectionName]} ${collectionName} items per event. Upgrade your plan to add more.`,
            409,
          );
        }
      }

      const now = Timestamp.now();
      transaction.create(itemRef, { ...data, createdAt: now, updatedAt: now });
      if (!isAdmin && usageCount !== null) {
        transaction.update(eventRef, { [`_planningUsage.${collectionName}`]: usageCount + 1 });
      }
      return itemRef.id;
    });

    return Response.json({ id: result });
  } catch (error) {
    if (error instanceof RequestError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    console.error('Could not create planning item.', error);
    return Response.json({ message: 'Could not save the item. Please try again.' }, { status: 500 });
  }
}
