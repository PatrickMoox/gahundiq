'use client';

import { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import type { EventData, TimelineItem, Vendor, SeatingChart, Task, BudgetItem, CashGift, GuestData, InviteData } from '@/types/firestore';

function normalize<T extends Record<string, any>>(id: string, data: T): T & { id: string } {
  return Object.fromEntries(Object.entries({ ...data, id }).map(([key, value]) => [key, value?.toDate instanceof Function ? value.toDate() : value])) as T & { id: string };
}

function useCollection<T extends Record<string, any>>(eventId: string, name: string) {
  const { user } = useAuth();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreClient();
    if (!db || !user || !eventId) { setItems([]); setLoading(false); return; }
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
    }, () => { setItems([]); setLoading(false); });
    return unsubscribe;
  }, [eventId, name, user]);

  const addItem = useCallback(async (data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>) => {
    const db = getFirestoreClient();
    if (!db) throw new Error('Firestore is not configured.');
    const created = await addDoc(collection(db, 'events', eventId, name), { ...data, createdAt: new Date(), updatedAt: new Date() });
    return { ...data, id: created.id } as unknown as T;
  }, [eventId, name]);

  const updateItem = useCallback(async (id: string, data: Partial<T>) => {
    const db = getFirestoreClient();
    if (!db) throw new Error('Firestore is not configured.');
    await updateDoc(doc(db, 'events', eventId, name, id), { ...data, updatedAt: new Date() });
  }, [eventId, name]);

  const deleteItem = useCallback(async (id: string) => {
    const db = getFirestoreClient();
    if (!db) throw new Error('Firestore is not configured.');
    await deleteDoc(doc(db, 'events', eventId, name, id));
  }, [eventId, name]);

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

export function useVendors(eventId: string) {
  const result = useCollection<Vendor>(eventId, 'vendors');
  return { vendors: result.items, loading: result.loading, addVendor: result.addItem, updateVendor: result.updateItem, deleteVendor: result.deleteItem };
}

export function useTasks(eventId: string) {
  const result = useCollection<Task>(eventId, 'tasks');
  return { tasks: result.items, loading: result.loading, addTask: result.addItem, updateTask: result.updateItem, deleteTask: result.deleteItem, setTasks: () => undefined };
}

export function useBudget(eventId: string) {
  const result = useCollection<BudgetItem>(eventId, 'budget');
  return { items: result.items, loading: result.loading, addItem: result.addItem, updateItem: result.updateItem, deleteItem: result.deleteItem };
}

export function useGuests(eventId: string) {
  const result = useCollection<GuestData>(eventId, 'guests');
  return { guests: result.items, loading: result.loading, addGuest: result.addItem, updateGuest: result.updateItem, deleteGuest: result.deleteItem };
}

/** Live list of digital invitations for an event (host view). */
export function useEventInvites(eventId: string) {
  const { user } = useAuth();
  const [invites, setInvites] = useState<InviteData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreClient();
    if (!db || !user || !eventId) { setInvites([]); setLoading(false); return; }
    return onSnapshot(collection(db, 'events', eventId, 'invites'), (snapshot) => {
      setInvites(snapshot.docs.map((item) => normalize(item.id, item.data()) as unknown as InviteData));
      setLoading(false);
    }, () => { setInvites([]); setLoading(false); });
  }, [eventId, user]);

  return { invites, loading };
}

export function useCashGifts(eventId: string) {
  const result = useCollection<CashGift>(eventId, 'gifts');
  const addGift = useCallback(async (gift: Partial<CashGift>) => {
    const db = getFirestoreClient();
    if (!db) throw new Error('Firestore is not configured.');
    const created = await addDoc(collection(db, 'events', eventId, 'gifts'), {
      guestName: gift.guestName ?? 'Anonymous', guestEmail: gift.guestEmail ?? null,
      amount: gift.amount ?? 0, currency: gift.currency ?? 'USD', message: gift.message ?? '',
      giftType: gift.giftType ?? 'cash', status: 'pending', createdAt: new Date(),
    });
    return { ...gift, id: created.id, status: 'pending' } as CashGift;
  }, [eventId]);
  return { gifts: result.items, loading: result.loading, addGift };
}

export function useSeatingChart(eventId: string) {
  const { user } = useAuth();
  const [chart, setChart] = useState<SeatingChart>({ id: 'main', eventId, name: 'Main Reception', tables: [], unassignedGuests: [], createdAt: new Date(), updatedAt: new Date() });
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
