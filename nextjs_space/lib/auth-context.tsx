'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { GoogleAuthProvider, createUserWithEmailAndPassword, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut as firebaseSignOut, updateProfile, type User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';
import { getAuthClient, getFirestoreClient } from '@/lib/firebase';
import { SESSION_POLICY, classifyDeviceLabel, getOrCreateDeviceId, isSessionActive, sessionExpiresAt, tsToMs } from '@/lib/session-policy';

interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: 'user' | 'admin';
  emailVerified: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  /**
   * Email of a signed-in password account that has NOT verified its address
   * yet. While set, `user` stays null — every auth guard treats the visitor
   * as signed out and /auth renders the verification panel.
   */
  verificationEmail: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Sends the Firebase hosted password-reset email; the new password applies system-wide. */
  resetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  /** Re-checks verification immediately; resolves true once verified and activated. */
  checkVerification: () => Promise<boolean>;
  /** Ends the session for an individual device (any of the user's own records). */
  revokeSession: (deviceId: string) => Promise<void>;
  /** Ends every session except this device — "sign out everywhere else". */
  signOutAllDevices: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  verificationEmail: null,
  signIn: async () => {},
  signUp: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
  resendVerificationEmail: async () => {},
  checkVerification: async () => false,
  revokeSession: async () => {},
  signOutAllDevices: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  // Lets context actions (checkVerification) trigger the activation flow
  // that lives inside the auth-state effect.
  const activateRef = useRef<((firebaseUser: User) => Promise<void>) | null>(null);

  // ── Session governance state (see lib/session-policy.ts) ──────────
  const uidRef = useRef<string | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const sessionRefRef = useRef<any>(null);         // sessions/{uid}/{deviceId} ref
  const sessionReadyRef = useRef(false);           // our live session doc exists
  const localSignOutRef = useRef(false);           // sign-out initiated on THIS device
  const endingRef = useRef(false);                 // forced sign-out already in flight
  const lastHeartbeatAtRef = useRef(0);            // ms of last successful activity write
  const expiresAtRef = useRef(0);                  // ms absolute-lifetime ceiling

  useEffect(() => {
    const auth = getAuthClient();
    if (!auth) { setLoading(false); return; }

    let unsubAdminDoc: (() => void) | null = null;
    let unsubSession: (() => void) | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let claimAdmin = false;
    let registryAdmin = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    };

    const stopHeartbeat = () => {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    };

    const clearSessionWatch = () => {
      if (unsubSession) { unsubSession(); unsubSession = null; }
    };

    const emit = (firebaseUser: User) => {
      uidRef.current = firebaseUser.uid;
      setUser({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
        role: claimAdmin || registryAdmin ? 'admin' : 'user',
        emailVerified: firebaseUser.emailVerified,
      });
      setLoading(false);
    };

    // ── Session governance engine (policy: lib/session-policy.ts) ────
    // Force-sign-out: flag the session record ended, notify, sign out locally.
    const forceSignOut = (reason: string) => {
      if (endingRef.current || localSignOutRef.current) return;
      endingRef.current = true;
      toast.warning(reason);
      const db = getFirestoreClient();
      const ref = sessionRefRef.current;
      if (db && ref) {
        updateDoc(ref, { signedOutAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => { /* best-effort */ });
      }
      const auth = getAuthClient();
      if (auth) void firebaseSignOut(auth);
    };

    // Live watch on THIS device's session doc. The moment anyone marks it
    // revoked/ended elsewhere (cap eviction, "sign out everywhere", admin
    // support), we sign out locally. Reacts only to explicit end flags so the
    // first-creation snapshot race can never misfire.
    const watchSession = (ref: any) => {
      clearSessionWatch();
      unsubSession = onSnapshot(ref, (snap: any) => {
        if (!snap.exists()) {
          if (sessionReadyRef.current) forceSignOut('Your session was ended on another device.');
          return;
        }
        const record = snap.data();
        if (sessionReadyRef.current && (record?.revokedAt != null || record?.signedOutAt != null)) {
          forceSignOut('You were signed out on this device.');
        }
      }, () => { /* rules/Firebase not configured — governance degrades gracefully */ });
    };

    // Concurrent-device cap: when a new device signs in at the cap, evict the
    // least-recently-active live device by flagging its session revoked.
    const evictIfOverCap = async (db: any, uid: string, keepDeviceId: string) => {
      const snap = await getDocs(collection(db, 'sessions', uid));
      const now = Date.now();
      const live = snap.docs
        .filter((d: any) => d.id !== keepDeviceId)
        .map((d: any) => ({ ref: d.ref, record: d.data() }))
        .filter((x: any) => isSessionActive(x.record, now));
      if (live.length < SESSION_POLICY.maxActiveSessions) return;
      live.sort((a: any, b: any) => tsToMs(a.record.lastActiveAt) - tsToMs(b.record.lastActiveAt));
      const evictCount = live.length - (SESSION_POLICY.maxActiveSessions - 1);
      const batch = writeBatch(db);
      live.slice(0, evictCount).forEach((x: any) =>
        batch.update(x.ref, { revokedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
      await batch.commit();
    };

    // Ensures a live session record exists for THIS device, then starts the
    // heartbeat. Best-effort: if the registry is unavailable (no rules /
    // Firebase unconfigured) the app keeps working without enforcement.
    const ensureSession = async (uid: string) => {
      const db = getFirestoreClient();
      if (!db) return;
      const deviceId = getOrCreateDeviceId();
      deviceIdRef.current = deviceId;
      const ref = doc(db, 'sessions', uid, deviceId);
      sessionRefRef.current = ref;
      watchSession(ref);

      try {
        const existing = await getDoc(ref);
        if (existing.exists() && isSessionActive(existing.data(), Date.now())) {
          // Re-authenticated on a known device: refresh ceiling + activity.
          expiresAtRef.current = sessionExpiresAt(Date.now());
          lastHeartbeatAtRef.current = Date.now();
          await updateDoc(ref, {
            lastActiveAt: serverTimestamp(),
            expiresAt: new Date(expiresAtRef.current),
            updatedAt: serverTimestamp(),
          });
        } else {
          // New device or stale record: enforce the concurrent-device cap.
          await evictIfOverCap(db, uid, deviceId);
          expiresAtRef.current = sessionExpiresAt(Date.now());
          lastHeartbeatAtRef.current = Date.now();
          await setDoc(ref, {
            uid,
            deviceId,
            deviceLabel: classifyDeviceLabel(typeof navigator === 'undefined' ? null : navigator.userAgent),
            createdAt: serverTimestamp(),
            lastActiveAt: serverTimestamp(),
            expiresAt: new Date(expiresAtRef.current),
            updatedAt: serverTimestamp(),
          });
        }
        sessionReadyRef.current = true;
        startHeartbeat(uid);
      } catch (error) {
        console.warn('Session governance could not be applied:', error);
      }
    };

    // Visibility-aware heartbeat: refreshes lastActiveAt while visible and
    // enforces the idle timeout + absolute lifetime locally.
    const startHeartbeat = (uid: string) => {
      stopHeartbeat();
      heartbeatTimer = setInterval(() => {
        const db = getFirestoreClient();
        const ref = sessionRefRef.current;
        if (!db || !ref) return;
        const now = Date.now();

        // Absolute lifetime ceiling — a hard re-auth boundary.
        if (expiresAtRef.current > 0 && now >= expiresAtRef.current) {
          forceSignOut('Session expired — please sign in again.');
          return;
        }
        // Idle timeout — heartbeat silent (tab hidden/away) too long.
        if (now - lastHeartbeatAtRef.current > SESSION_POLICY.idleTimeoutMs + SESSION_POLICY.idleGraceMs) {
          forceSignOut('Signed out after being inactive. Sign in to continue.');
          return;
        }
        if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;

        if (now - lastHeartbeatAtRef.current >= SESSION_POLICY.heartbeatMs - 1000) {
          updateDoc(ref, { lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp() })
            .then(() => { lastHeartbeatAtRef.current = Date.now(); })
            .catch(() => { /* throttled / rules hiccup — next tick retries */ });
        }
      }, SESSION_POLICY.heartbeatMs);
    };

    // Promotes a (verified) Firebase user to an active app session.
    const activate = async (firebaseUser: User) => {
      stopPolling();
      const token = await firebaseUser.getIdTokenResult();
      claimAdmin = token.claims.admin === true;
      setVerificationEmail(null);
      localSignOutRef.current = false;
      endingRef.current = false;
      sessionReadyRef.current = false;
      emit(firebaseUser);
      void ensureSession(firebaseUser.uid);

      // Firestore admin registry: creating admin/{uid} in the Firebase Console
      // grants admin access without any script; deleting it revokes instantly.
      // Clients can never write to the admin collection (rules: isAdmin only).
      const db = getFirestoreClient();
      if (db) {
        unsubAdminDoc?.();
        unsubAdminDoc = onSnapshot(doc(db, 'admin', firebaseUser.uid), (snapshot) => {
          registryAdmin = snapshot.exists();
          emit(firebaseUser);
        }, () => { registryAdmin = false; emit(firebaseUser); });
      }
    };
    activateRef.current = activate;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      unsubAdminDoc?.();
      unsubAdminDoc = null;
      stopPolling();
      clearSessionWatch();
      stopHeartbeat();
      claimAdmin = false;
      registryAdmin = false;

      if (!firebaseUser) {
        // Session ended — either an explicit local sign-out (already marked the
        // record), or an INVOLUNTARY one: password reset elsewhere (Firebase's
        // hosted reset revokes every refresh token), an admin revocation, or an
        // expired/revoked token. In the involuntary case the record is still
        // marked "active" in the registry, so end it here to keep the session
        // governance view truthful.
        if (!localSignOutRef.current) {
          const db = getFirestoreClient();
          const ref = sessionRefRef.current;
          if (db && ref) {
            updateDoc(ref, { signedOutAt: serverTimestamp(), revokedAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => { /* best-effort */ });
          }
        }
        localSignOutRef.current = false;
        setUser(null);
        setVerificationEmail(null);
        setLoading(false);
        uidRef.current = null;
        sessionReadyRef.current = false;
        sessionRefRef.current = null;
        expiresAtRef.current = 0;
        lastHeartbeatAtRef.current = 0;
        return;
      }

      // Password accounts must verify their email before the app grants any
      // identity. Google accounts are verified by the provider and skip this.
      const isPasswordAccount = firebaseUser.providerData.some((p) => p.providerId === 'password');
      if (isPasswordAccount && !firebaseUser.emailVerified) {
        setUser(null);
        setVerificationEmail(firebaseUser.email ?? null);
        setLoading(false);
        // Poll periodically so the panel flips to the app automatically
        // right after the user clicks the verification link.
        pollTimer = setInterval(() => {
          firebaseUser.reload().then(async () => {
            if (firebaseUser.emailVerified) await activate(firebaseUser);
          }).catch(() => { /* transient network error — keep polling */ });
        }, 4000);
        return;
      }

      void activate(firebaseUser);
    });

    return () => { unsubscribeAuth(); unsubAdminDoc?.(); clearSessionWatch(); stopHeartbeat(); stopPolling(); activateRef.current = null; };
  }, []);

  const syncProfile = useCallback(async (firebaseUser: { uid: string; email: string | null; displayName: string | null; photoURL: string | null }) => {
    const db = getFirestoreClient();
    if (!db) return;
    await setDoc(doc(db, 'users', firebaseUser.uid), {
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      photoURL: firebaseUser.photoURL,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const auth = getAuthClient();
    if (!auth) throw new Error('Firebase Authentication is not configured.');
    const result = await signInWithEmailAndPassword(auth, email.trim(), password);
    await syncProfile(result.user);
  }, [syncProfile]);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const auth = getAuthClient();
    if (!auth) throw new Error('Firebase Authentication is not configured.');
    const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(result.user, { displayName: name.trim() });
    await syncProfile({ ...result.user, displayName: name.trim() });
    // Require email verification before the account can be used. The
    // verification screen offers a resend button, so a failed send here is
    // non-fatal and must not abort the sign-up itself.
    try {
      await sendEmailVerification(result.user);
    } catch (error) {
      console.warn('Verification email could not be sent:', error);
    }
  }, [syncProfile]);

  const signInWithGoogle = useCallback(async () => {
    const auth = getAuthClient();
    if (!auth) throw new Error('Firebase Authentication is not configured.');
    const result = await signInWithPopup(auth, new GoogleAuthProvider());
    await syncProfile(result.user);
  }, [syncProfile]);

  const signOutFn = useCallback(async () => {
    // End THIS device's session record first (fire-and-forget) so the session
    // governance panel reflects the sign-out, then sign out of Firebase.
    localSignOutRef.current = true;
    endingRef.current = false;
    const db = getFirestoreClient();
    const ref = sessionRefRef.current;
    if (db && ref) {
      updateDoc(ref, { signedOutAt: serverTimestamp(), revokedAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(() => { /* best-effort */ });
    }
    const auth = getAuthClient();
    if (auth) await firebaseSignOut(auth);
  }, []);

  // Session governance: end a specific device session (any of the user's own).
  const revokeSession = useCallback(async (deviceId: string) => {
    const db = getFirestoreClient();
    const uid = uidRef.current;
    if (!db || !uid) return;
    await updateDoc(doc(db, 'sessions', uid, deviceId), {
      revokedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }, []);

  // "Sign out everywhere else": revoke every session except this device.
  const signOutAllDevices = useCallback(async () => {
    const db = getFirestoreClient();
    const uid = uidRef.current;
    if (!db || !uid) return;
    const snap = await getDocs(collection(db, 'sessions', uid));
    const keep = deviceIdRef.current;
    const batch = writeBatch(db);
    snap.docs.forEach((d: any) => {
      if (d.id !== keep) batch.update(d.ref, { revokedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
    await batch.commit();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const auth = getAuthClient();
    if (!auth) throw new Error('Firebase Authentication is not configured.');
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    const auth = getAuthClient();
    const current = auth?.currentUser ?? null;
    if (!auth || !current) throw new Error('No active session. Please sign in again.');
    if (current.emailVerified) { await activateRef.current?.(current); return; }
    await sendEmailVerification(current);
  }, []);

  const checkVerification = useCallback(async () => {
    const auth = getAuthClient();
    const current = auth?.currentUser ?? null;
    if (!current) return false;
    await current.reload();
    if (!current.emailVerified) return false;
    await activateRef.current?.(current);
    return true;
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading, verificationEmail,
      signIn, signUp, signInWithGoogle, signOut: signOutFn,
      resetPassword, resendVerificationEmail, checkVerification,
      revokeSession, signOutAllDevices,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
