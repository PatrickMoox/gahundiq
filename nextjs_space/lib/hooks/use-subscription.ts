'use client';

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import type { Subscription } from '@/types/firestore';

function normalize<T extends Record<string, any>>(id: string, data: T): T & { id: string } {
  return Object.fromEntries(
    Object.entries({ ...data, id }).map(([key, value]) => [key, value?.toDate instanceof Function ? value.toDate() : value]),
  ) as T & { id: string };
}

/** Live subscription document for the signed-in user (readable per rules: isUser(userId)). */
export function useSubscription(userId?: string | null) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));

  useEffect(() => {
    const db = getFirestoreClient();
    if (!db || !userId) { setSubscription(null); setLoading(false); return; }
    return onSnapshot(doc(db, 'subscriptions', userId), (snapshot) => {
      setSubscription(snapshot.exists() ? normalize(snapshot.id, snapshot.data()) as unknown as Subscription : null);
      setLoading(false);
    }, () => { setSubscription(null); setLoading(false); });
  }, [userId]);

  return { subscription, loading };
}

export interface DirectoryUser {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: any;
  subscription: Subscription | null;
}

/**
 * Admin-only live directory: all user profiles joined with their
 * subscription documents. Readable per rules via the isAdmin() branches.
 */
export function useAdminDirectory(enabled: boolean) {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    const db = getFirestoreClient();
    if (!db || !enabled) { setUsers([]); setLoading(false); return; }

    let usersMap = new Map<string, Record<string, any>>();
    let subsMap = new Map<string, Record<string, any>>();

    const rebuild = () => {
      const merged = Array.from(usersMap.entries()).map<DirectoryUser>(([id, data]) => ({
        id,
        email: data?.email ?? null,
        displayName: data?.displayName ?? null,
        createdAt: data?.createdAt ?? null,
        subscription: subsMap.has(id) ? normalize(id, subsMap.get(id)!) as unknown as Subscription : null,
      }));
      merged.sort((a, b) => String(a.email ?? '').localeCompare(String(b.email ?? '')));
      setUsers(merged);
      setLoading(false);
    };

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      usersMap = new Map(snapshot.docs.map((d) => [d.id, d.data()]));
      rebuild();
    }, () => setLoading(false));

    const unsubSubs = onSnapshot(collection(db, 'subscriptions'), (snapshot) => {
      subsMap = new Map(snapshot.docs.map((d) => [d.id, d.data()]));
      rebuild();
    }, () => setLoading(false));

    return () => { unsubUsers(); unsubSubs(); };
  }, [enabled]);

  return { users, loading };
}