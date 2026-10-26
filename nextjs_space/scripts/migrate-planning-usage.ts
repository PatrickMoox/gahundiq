import { loadEnvConfig } from '@next/env';
import { getFirestore } from 'firebase-admin/firestore';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';

loadEnvConfig(process.cwd());

const COLLECTIONS = ['budget', 'vendors', 'timeline', 'tasks'] as const;
type PlanningUsage = Record<(typeof COLLECTIONS)[number], number>;

function storedCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

async function main() {
  const db = getFirestore(getFirebaseAdminApp());
  const events = await db.collection('events').get();
  let migrated = 0;

  for (const eventSnapshot of events.docs) {
    const eventRef = eventSnapshot.ref;
    await db.runTransaction(async (transaction) => {
      const currentEvent = await transaction.get(eventRef);
      if (!currentEvent.exists) return;
      const collections = await Promise.all(
        COLLECTIONS.map((name) => transaction.get(eventRef.collection(name))),
      );
      const guests = await transaction.get(eventRef.collection('guests'));
      const previousUsage = currentEvent.data()?._planningUsage ?? {};
      const usage = Object.fromEntries(COLLECTIONS.map((name, index) => [
        name,
        Math.max(storedCount(previousUsage[name]), collections[index].size),
      ])) as PlanningUsage;
      const guestUsageCount = Math.max(
        storedCount(currentEvent.data()?._guestUsageCount),
        guests.size,
      );

      transaction.update(eventRef, { _planningUsage: usage, _guestUsageCount: guestUsageCount });
    });
    migrated += 1;
  }

  console.info(`Synchronized item usage counters for ${migrated} events.`);
}

main().catch((error: unknown) => {
  console.error('Could not synchronize event item usage counters.', error);
  process.exitCode = 1;
});
