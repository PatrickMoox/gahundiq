'use client';

import { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { getAuthClient, getFirestoreClient } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import { getPlanningItemLimit, type PlanningCollection } from '@/lib/plan-entitlements';
import type { EventData, TimelineItem, Vendor, SeatingChart, Task, BudgetItem, CashGift, GuestData, InviteData } from '@/types/firestore';

function normalize<T extends Record<string, any>>(id: string, data: T): T & { id: string } {
  return Object.fromEntries(Object.entries({ ...data, id }).map(([key, value]) => [key, value?.toDate instanceof Function ? value.toDate() : value])) as T & { id: string };
}

function isPlanningCollection(name: string): name is PlanningCollection {
  return name === 'budget' || name === 'vendors' || name === 'timeline' || name === 'tasks';
}

class PlanningUsageSyncRequired extends Error {}

function useCollection<T extends Record<string, any>>(eventId: string, name: string, enabled = true) {
  const { user } = useAuth();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreClient();
    if (!enabled || !db || !user || !eventId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const unsubscribe = onSnapshot(collection(db, 'events', eventId, name), (snapshot) => {
      const data = snapshot.docs.map((item) => normalize(item.id, item.data()) as unknown as T);
      // Sort client-side by createdAt to avoid requiring a Firestore composite index
      data.sort((a, b) => {
        const aTime = a?.createdAt?.getTime?.() ?? 0;
        const bTime = b?.createdAt?.getTime?.() ?? 0;
        return aTime - bTime;
      });
      setItems(data);
      setLoading(false);
    }, (error) => {
      console.error(`Could not load event ${name}.`, error);
      setItems([]);
      setLoading(false);
      toast.error(`Could not load ${name}: ${error.message}`);
    });
    return unsubscribe;
  }, [enabled, eventId, name, user]);

  const addItem = useCallback(async (data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (isPlanningCollection(name)) {
      if (!user) throw new Error('Sign in to add this item.');
      const currentUser = getAuthClient()?.currentUser;
      if (!currentUser || currentUser.uid !== user.uid) throw new Error('Your session is no longer available. Please sign in again.');
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore is not configured.');
      const eventRef = doc(db, 'events', eventId);
      const itemRef = doc(collection(db, 'events', eventId, name));
      const itemData = Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      );

      const writeItem = () => runTransaction(db, async (transaction) => {
        const eventSnapshot = await transaction.get(eventRef);
        if (!eventSnapshot.exists()) throw new Error('Event not found.');
        const event = eventSnapshot.data() as EventData;
        const collaborator = event.collaboratorIds?.includes(user.uid) ?? false;
        if (event.hostId !== user.uid && !collaborator) {
          throw new Error('You do not have access to this event.');
        }
        if (collaborator && event.hostId !== user.uid) {
          const sectionAccess = event.collaboratorAccess?.[user.uid] ?? {};
          const accessDefault = name === 'timeline' || name === 'tasks';
          if ((sectionAccess[name] ?? accessDefault) !== true) {
            throw new Error(`The host has not shared the ${name} section with you.`);
          }
        }

        const usageCount = event._planningUsage?.[name];
        const hasValidUsageCount = typeof usageCount === 'number'
          && Number.isInteger(usageCount)
          && usageCount >= 0;
        if (!hasValidUsageCount && event.tier !== 'premium') {
          throw new PlanningUsageSyncRequired();
        }
        const itemLimit = getPlanningItemLimit(event, name);
        if (hasValidUsageCount && itemLimit !== null && usageCount >= itemLimit) {
          throw new Error(`Free plan limit reached: ${itemLimit} ${name} items per event. Upgrade your plan to add more.`);
        }

        for (const [field, targetCollection, section] of [
          ['vendorId', 'vendors', 'vendors'],
          ['budgetItemId', 'budget', 'budget'],
        ] as const) {
          const referenceId = itemData[field];
          if (typeof referenceId !== 'string') continue;
          if (collaborator && event.hostId !== user.uid) {
            const sectionAccess = event.collaboratorAccess?.[user.uid] ?? {};
            if (sectionAccess[section] !== true) {
              throw new Error(`The host must share ${section} access before you can link it.`);
            }
          }
          const referenceSnapshot = await transaction.get(
            doc(db, 'events', eventId, targetCollection, referenceId),
          );
          if (!referenceSnapshot.exists()) {
            throw new Error(`Selected ${section === 'budget' ? 'budget item' : 'vendor'} was not found in this event.`);
          }
        }

        const now = new Date();
        transaction.set(itemRef, {
          ...itemData,
          eventId,
          ...(name === 'budget' && !('dueDate' in itemData) ? { dueDate: null } : {}),
          createdAt: now,
          updatedAt: now,
        });
        if (hasValidUsageCount) {
          transaction.update(eventRef, {
            [`_planningUsage.${name}`]: usageCount + 1,
            _planningWrite: { collection: name, itemId: itemRef.id, actorId: user.uid },
          });
        }
      });

      try {
        await writeItem();
      } catch (error) {
        if (!(error instanceof PlanningUsageSyncRequired)) throw error;

        const idToken = await currentUser.getIdToken();
        const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/planning-usage`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${idToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ collection: name }),
        });
        if (!response.ok) {
          let message = 'Could not synchronize planning usage. Please try again.';
          try {
            const result: unknown = await response.json();
            if (typeof result === 'object' && result !== null
              && 'message' in result && typeof result.message === 'string') {
              message = result.message;
            }
          } catch {
            // Keep the explicit synchronization failure if the response is not JSON.
          }
          throw new Error(message);
        }

        await writeItem();
      }
      return { ...data, id: itemRef.id } as unknown as T;
    }
    if (name === 'guests') {
      if (!user) throw new Error('Sign in to add this item.');
      if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 120) {
        throw new Error('Guest name is required and must be 120 characters or fewer.');
      }
      if (data.email !== undefined && (typeof data.email !== 'string' || data.email.length > 254)) {
        throw new Error('Guest email is invalid.');
      }
      if (data.dietary !== undefined && !['vegetarian', 'vegan', 'gluten-free', 'halal', 'kosher', 'none'].includes(data.dietary)) {
        throw new Error('Dietary preference is invalid.');
      }
      if (data.isVIP !== undefined && typeof data.isVIP !== 'boolean') {
        throw new Error('VIP status is invalid.');
      }
      if (data.rsvp !== undefined && !['pending', 'confirmed', 'declined'].includes(data.rsvp)) {
        throw new Error('RSVP status is invalid.');
      }
      const currentUser = getAuthClient()?.currentUser;
      if (!currentUser || currentUser.uid !== user.uid) throw new Error('Your session is no longer available. Please sign in again.');
      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore is not configured.');
      const eventRef = doc(db, 'events', eventId);
      const guestRef = doc(collection(db, 'events', eventId, 'guests'));

      await runTransaction(db, async (transaction) => {
        const eventSnapshot = await transaction.get(eventRef);
        if (!eventSnapshot.exists()) throw new Error('Event not found.');
        const event = eventSnapshot.data() as EventData;
        const collaborator = event.collaboratorIds?.includes(user.uid) ?? false;
        if (event.hostId !== user.uid && !collaborator) {
          throw new Error('You do not have access to this event.');
        }
        if (collaborator && event.hostId !== user.uid
          && event.collaboratorAccess?.[user.uid]?.guests !== true) {
          throw new Error('The host has not shared the guest list with you.');
        }

        const guestCount = event._guestUsageCount;
        if (typeof guestCount !== 'number' || !Number.isInteger(guestCount) || guestCount < 0) {
          throw new Error('Guest capacity needs to be synchronized before adding guests. Contact support.');
        }
        const now = new Date();
        transaction.set(guestRef, {
          name: data.name.trim(),
          ...(data.email ? { email: data.email } : {}),
          dietary: data.dietary ?? 'none',
          isVIP: data.isVIP ?? false,
          rsvp: data.rsvp ?? 'pending',
          createdAt: now,
          updatedAt: now,
        });
        transaction.update(eventRef, {
          _guestUsageCount: guestCount + 1,
          _guestWrite: { operation: 'add', guestId: guestRef.id, actorId: user.uid },
        });
      });
      return { ...data, id: guestRef.id } as unknown as T;
    }
    const db = getFirestoreClient();
    if (!db) throw new Error('Firestore is not configured.');
    const created = await addDoc(collection(db, 'events', eventId, name), { ...data, createdAt: new Date(), updatedAt: new Date() });
    return { ...data, id: created.id } as unknown as T;
  }, [eventId, name, user]);

  const updateItem = useCallback(async (id: string, data: Partial<T>) => {
    const db = getFirestoreClient();
    if (!db) throw new Error('Firestore is not configured.');
    await updateDoc(doc(db, 'events', eventId, name, id), { ...data, updatedAt: new Date() });
  }, [eventId, name]);

  const deleteItem = useCallback(async (id: string) => {
    if (name === 'guests') {
      if (!user) throw new Error('Sign in to remove this guest.');
      const currentUser = getAuthClient()?.currentUser;
      if (!currentUser || currentUser.uid !== user.uid) throw new Error('Your session is no longer available. Please sign in again.');
      const token = await currentUser.getIdToken();
      const response = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/guests?guestId=${encodeURIComponent(id)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? 'Could not remove this guest.');
      return;
    }
    const db = getFirestoreClient();
    if (!db) throw new Error('Firestore is not configured.');
    await deleteDoc(doc(db, 'events', eventId, name, id));
  }, [eventId, name, user]);

  return { items, loading, addItem, updateItem, deleteItem };
}

export function useEvent(eventId: string) {
  const { user } = useAuth();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const db = getFirestoreClient();
    if (!db || !user || !eventId) { setEvent(null); setLoading(false); return; }
    return onSnapshot(doc(db, 'events', eventId), (snapshot) => {
      setEvent(snapshot.exists() ? normalize(snapshot.id, snapshot.data()) as EventData : null);
      setLoading(false);
    }, () => { setEvent(null); setLoading(false); });
  }, [eventId, user]);
  return { event, loading };
}

export function useTimeline(eventId: string) {
  const result = useCollection<TimelineItem>(eventId, 'timeline');
  return { ...result, setItems: () => undefined };
}

export function useVendors(eventId: string, enabled = true) {
  const result = useCollection<Vendor>(eventId, 'vendors', enabled);
  return { vendors: result.items, loading: result.loading, addVendor: result.addItem, updateVendor: result.updateItem, deleteVendor: result.deleteItem };
}

export function useTasks(eventId: string) {
  const result = useCollection<Task>(eventId, 'tasks');
  return { tasks: result.items, loading: result.loading, addTask: result.addItem, updateTask: result.updateItem, deleteTask: result.deleteItem, setTasks: () => undefined };
}

export function useBudget(eventId: string, enabled = true) {
  const result = useCollection<BudgetItem>(eventId, 'budget', enabled);
  return { items: result.items, loading: result.loading, addItem: result.addItem, updateItem: result.updateItem, deleteItem: result.deleteItem };
}

export function useGuests(eventId: string, enabled = true) {
  const result = useCollection<GuestData>(eventId, 'guests', enabled);
  return { guests: result.items, loading: result.loading, addGuest: result.addItem, updateGuest: result.updateItem, deleteGuest: result.deleteItem };
}

/** Live list of digital invitations for an event (host view). */
export function useEventInvites(eventId: string, enabled = true) {
  const { user } = useAuth();
  const [invites, setInvites] = useState<InviteData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreClient();
    if (!enabled || !db || !user || !eventId) { setInvites([]); setLoading(false); return; }
    setLoading(true);
    return onSnapshot(collection(db, 'events', eventId, 'invites'), (snapshot) => {
      setInvites(snapshot.docs.map((item) => normalize(item.id, item.data()) as unknown as InviteData));
      setLoading(false);
    }, () => { setInvites([]); setLoading(false); });
  }, [enabled, eventId, user]);

  return { invites, loading };
}

export function useCashGifts(eventId: string, enabled = true) {
  const result = useCollection<CashGift>(eventId, 'gifts', enabled);
  const addGift = useCallback(async (gift: Partial<CashGift>) => {
    const db = getFirestoreClient();
    if (!db) throw new Error('Firestore is not configured.');
    // The rules only accept positive pledges (hasOnlyPublicGiftFields) — fail
    // loudly here instead of surfacing a confusing permission-denied later.
    const amount = Number(gift.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Gift amount must be greater than zero.');
    }
    const created = await addDoc(collection(db, 'events', eventId, 'gifts'), {
      guestName: gift.guestName ?? 'Anonymous', guestEmail: gift.guestEmail ?? null,
      amount, currency: gift.currency ?? 'USD', message: gift.message ?? '',
      giftType: gift.giftType ?? 'cash', status: 'pending', createdAt: new Date(),
    });
    return { ...gift, id: created.id, status: 'pending' } as CashGift;
  }, [eventId]);
  return { gifts: result.items, loading: result.loading, addGift };
}

export function useSeatingChart(eventId: string) {
  const { user } = useAuth();
  // Deterministic initial state (no `new Date()` — the value is never rendered
  // before the snapshot lands, and SSR renders client components too).
  const [chart, setChart] = useState<SeatingChart>({ id: 'main', eventId, name: 'Main Reception', tables: [], unassignedGuests: [], createdAt: null, updatedAt: null });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const db = getFirestoreClient();
    if (!db || !user || !eventId) { setLoading(false); return; }
    return onSnapshot(doc(db, 'events', eventId, 'seating', 'main'), (snapshot) => {
      if (snapshot.exists()) setChart(normalize(snapshot.id, snapshot.data()) as SeatingChart);
      setLoading(false);
    }, () => { setLoading(false); });
  }, [eventId, user]);
  const updateChart = useCallback(async (data: Partial<SeatingChart>) => {
    const db = getFirestoreClient();
    if (!db) throw new Error('Firestore is not configured.');
    await setDoc(doc(db, 'events', eventId, 'seating', 'main'), { ...data, eventId, updatedAt: new Date() }, { merge: true });
  }, [eventId]);
  return { chart, loading, updateChart, setChart };
}
