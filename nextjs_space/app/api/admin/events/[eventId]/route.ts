import { getFirestore, type CollectionReference, type DocumentReference, type Firestore, type Query } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';
import { verifyFirebaseUser } from '@/lib/firebase-user';

export const runtime = 'nodejs';

function errorResponse(message: string, status: number) {
  return Response.json({ message }, { status });
}

type DeleteWriter = ReturnType<Firestore['bulkWriter']>;

async function flushDeletes(writer: DeleteWriter, pending: Promise<unknown>[]) {
  await Promise.all(pending.splice(0));
  await writer.flush();
}

async function deleteQuery(db: Firestore, query: Query) {
  const writer = db.bulkWriter();
  try {
    while (true) {
      const snapshot = await query.limit(250).get();
      if (snapshot.empty) break;
      await Promise.all(snapshot.docs.map((document) => writer.delete(document.ref)));
      await writer.flush();
    }
  } finally {
    await writer.close();
  }
}

async function deleteDocumentTree(
  reference: DocumentReference,
  writer: DeleteWriter,
  pending: Promise<unknown>[],
) {
  const subcollections = await reference.listCollections();
  for (const subcollection of subcollections) {
    await deleteCollectionTree(subcollection, writer, pending);
  }
  pending.push(writer.delete(reference));
}

async function deleteCollectionTree(
  collection: CollectionReference,
  writer: DeleteWriter,
  pending: Promise<unknown>[],
) {
  while (true) {
    const snapshot = await collection.limit(100).get();
    if (snapshot.empty) break;
    for (const document of snapshot.docs) {
      await deleteDocumentTree(document.ref, writer, pending);
    }
    await flushDeletes(writer, pending);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  try {
    const user = await verifyFirebaseUser(request);
    if (!user) return errorResponse('Your sign-in token is invalid or expired. Please sign in again.', 401);

    const { eventId } = await context.params;
    if (!eventId || eventId.includes('/')) return errorResponse('Event ID is invalid.', 400);

    const db = getFirestore(getFirebaseAdminApp());
    const isAdmin = user.admin === true || (await db.doc(`admin/${user.uid}`).get()).exists;
    if (!isAdmin) return errorResponse('Only platform admins can delete events.', 403);

    const eventRef = db.doc(`events/${eventId}`);
    const eventSnapshot = await eventRef.get();
    if (!eventSnapshot.exists) return errorResponse('Event not found.', 404);

    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucketName) {
      return errorResponse('Firebase Storage bucket is not configured; event deletion was not started.', 500);
    }

    const app = getFirebaseAdminApp();
    await getStorage(app).bucket(bucketName).deleteFiles({
      prefix: `invitations/${eventId}/`,
      force: true,
    });
    await getStorage(app).bucket(bucketName).deleteFiles({
      prefix: `covers/${eventId}/`,
      force: true,
    });

    await Promise.all([
      deleteQuery(db, db.collection('publicVendorPasses').where('eventId', '==', eventId)),
      deleteQuery(db, db.collection('collabInvites').where('eventId', '==', eventId)),
      deleteQuery(db, db.collection('collabClaims').where('eventId', '==', eventId)),
      db.doc(`publicGiftPages/${eventId}`).delete(),
    ]);

    const writer = db.bulkWriter();
    try {
      const pending: Promise<unknown>[] = [];
      await deleteDocumentTree(eventRef, writer, pending);
      await flushDeletes(writer, pending);
      await writer.close();
    } catch (error) {
      await writer.close();
      throw error;
    }

    return Response.json({ deleted: true });
  } catch (error) {
    console.error('Could not completely delete the event and its related data.', error);
    return errorResponse('Could not completely delete the event and its related data. Retry or contact support.', 500);
  }
}
