'use client';

import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query } from 'firebase/firestore';
import { getFirestoreClient } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { getOrCreateDeviceId, isSessionActive } from '@/lib/session-policy';

export interface SessionView {
  deviceId: string;
  deviceLabel: string;
  createdAt?: Date | null;
  lastActiveAt?: Date | null;
  expiresAt?: Date | null;
  /** True for the device running this browser tab right now. */
  current: boolean;
  active: boolean;
  revoked: boolean;
}

function fromTs(value: any): Date | null {
  if (!value) return null;
  const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/**
 * Live list of the signed-in user's device sessions, newest-activity first.
 * Readable per rules (isUser(userId)); writes go through the context's
 * revokeSession / signOutAllDevices so the current device is never self-revoked.
 */
export function useSessions(userId?: string | null) {
  const { revokeSession, signOutAllDevices } = useAuth();
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));

  useEffect(() => {
    const db = getFirestoreClient();
    if (!db || !userId) { setSessions([]); setLoading(false); return; }

    const currentDeviceId = getOrCreateDeviceId();

    return onSnapshot(
      query(collection(db, 'sessions', userId), limit(50)),
      (snapshot: any) => {
        const now = Date.now();
        const rows = snapshot.docs.map((d: any) => {
          const data = d.data();
          const view: SessionView = {
            deviceId: d.id,
            deviceLabel: data?.deviceLabel ?? 'Device',
            createdAt: fromTs(data?.createdAt),
            lastActiveAt: fromTs(data?.lastActiveAt),
            expiresAt: fromTs(data?.expiresAt),
            current: d.id === currentDeviceId,
            active: isSessionActive(data, now),
            revoked: data?.revokedAt != null || data?.signedOutAt != null,
          };
          return view;
        });
        rows.sort((a: SessionView, b: SessionView) => {
          if (a.active !== b.active) return a.active ? -1 : 1;
          const aLast = a.lastActiveAt?.getTime() ?? 0;
          const bLast = b.lastActiveAt?.getTime() ?? 0;
          return bLast - aLast;
        });
        setSessions(rows);
        setLoading(false);
      },
      () => { setSessions([]); setLoading(false); },
    );
  }, [userId]);

  return { sessions, loading, revoke: revokeSession, revokeOthers: signOutAllDevices };
}