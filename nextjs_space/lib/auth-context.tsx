'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { GoogleAuthProvider, createUserWithEmailAndPassword, onIdTokenChanged, sendEmailVerification, sendPasswordResetEmail, signInWithCustomToken, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut as firebaseSignOut, updateProfile, type User } from 'firebase/auth';
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import { getAuthClient, getFirestoreClient } from '@/lib/firebase';
import { SESSION_POLICY, classifyDeviceLabel, getOrCreateDeviceId, isSessionActive, tsToMs } from '@/lib/session-policy';

async function requestSessionAction(
  firebaseUser: User,
  action: 'start' | 'heartbeat' | 'revoke',
  details: Record<string, unknown> = {},
): Promise<{ customToken?: string }> {
  const idToken = await firebaseUser.getIdToken();
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...details }),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'message' in result
      && typeof result.message === 'string' ? result.message : 'Could not verify your session.';
    throw new Error(message);
  }
  if (!result || typeof result !== 'object') throw new Error('Invalid session response.');
  return result as { customToken?: string };
}

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
  signUp: (email: string, password: string, name: string, continueUrl?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Sends the Firebase hosted password-reset email; the new password applies system-wide. */
  resetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: (continueUrl?: string) => Promise<void>;
  /** Re-checks verification immediately; resolves true once verified and activated. */
  checkVerification: () => Promise<boolean>;
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
});

/**
 * Areas that require a session. Everything else is public: the landing and
 * marketing pages, `/auth`, and the capability-token pages (invite RSVP, gift
 * pledge, vendor pass, collaborator accept). Keep in step with the Routes table
 * in README.md.
 */
export const PROTECTED_ROUTE_PREFIXES = ['/dashboard', '/events', '/reports', '/admin'] as const;

/** True when `pathname` is inside a signed-in area (exact prefix or nested). */
export function isProtectedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  // Lets context actions (checkVerification) trigger the activation flow
  // that lives inside the auth-state effect.
  const activateRef = useRef<((firebaseUser: User) => Promise<void>) | null>(null);

  // ── Session governance state (see lib/session-policy.ts) ──────────
  const sessionRefRef = useRef<any>(null);         // sessions/{uid}/devices/{deviceId} ref
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
    let heartbeatFailureCount = 0;
    let heartbeatWarningShown = false;
    let heartbeatWritePending = false;
    let bootstrappedUid: string | null = null;

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
    // Force-sign-out: revoke the server-managed session, then sign out locally.
    const forceSignOut = (reason: string) => {
      if (endingRef.current || localSignOutRef.current) return;
      endingRef.current = true;
      toast.warning(reason);
      const auth = getAuthClient();
      const currentUser = auth?.currentUser;
      if (currentUser && sessionReadyRef.current) {
        void requestSessionAction(currentUser, 'revoke').catch((error) => {
          console.error('Could not revoke the app session:', error);
        });
      }
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
        // Multi-tab device sync: activity is DEVICE-level, not tab-level. When
        // a sibling tab on this device refreshes lastActiveAt (its heartbeat
        // runs while visible), adopt the newer timestamp so THIS tab's idle
        // check does not force-sign-out an actively used device (a hidden tab
        // still ticks every minute and would otherwise idle out after 35 min
        // even though another tab keeps the session alive).
        if (record?.revokedAt == null && record?.signedOutAt == null) {
          const sharedLastActive = tsToMs(record?.lastActiveAt);
          if (sharedLastActive > lastHeartbeatAtRef.current) lastHeartbeatAtRef.current = sharedLastActive;
        }
        if (sessionReadyRef.current && (record?.revokedAt != null || record?.signedOutAt != null)) {
          forceSignOut('You were signed out on this device.');
        }
      }, (error) => {
        console.error('Session status could not be monitored:', error);
        forceSignOut('Could not verify your session. Please check your connection and sign in again.');
      });
    };

    // Exchanges a provider-authenticated identity for a server-issued token
    // bound to the server-managed session record. Provider tokens are never
    // admitted to protected Firestore data directly.
    const ensureSession = async (firebaseUser: User): Promise<boolean> => {
      const token = await firebaseUser.getIdTokenResult();
      const sessionId = token.claims.appSessionId;
      const nonce = token.claims.appSessionNonce;
      if (typeof sessionId !== 'string' || typeof nonce !== 'string') {
        if (bootstrappedUid === firebaseUser.uid) return false;
        bootstrappedUid = firebaseUser.uid;
        try {
          await firebaseUser.getIdToken(true);
          const result = await requestSessionAction(firebaseUser, 'start', {
            deviceId: getOrCreateDeviceId(),
            deviceLabel: classifyDeviceLabel(typeof navigator === 'undefined' ? null : navigator.userAgent),
            displayName: firebaseUser.displayName ?? '',
            photoURL: firebaseUser.photoURL ?? null,
          });
          if (typeof result.customToken !== 'string' || !result.customToken) {
            throw new Error('The session service did not return a session token.');
          }
          const auth = getAuthClient();
          if (!auth) throw new Error('Firebase Authentication is not configured.');
          await signInWithCustomToken(auth, result.customToken);
        } catch (error) {
          bootstrappedUid = null;
          throw error;
        }
        return false;
      }

      const db = getFirestoreClient();
      if (!db) throw new Error('Firestore is not configured.');
      const ref = doc(db, 'sessions', firebaseUser.uid, 'devices', sessionId);
      sessionRefRef.current = ref;
      watchSession(ref);

      try {
        const existing = await getDocFromServer(ref);
        const record = existing.data();
        if (!existing.exists() || record?.sessionNonce !== nonce || !isSessionActive(record, Date.now())) {
          throw new Error('The app session has expired or was revoked.');
        }
        expiresAtRef.current = tsToMs(record.expiresAt);
        lastHeartbeatAtRef.current = tsToMs(record.lastActiveAt);
        sessionReadyRef.current = true;
        return true;
      } catch (error) {
        sessionReadyRef.current = false;
        throw error;
      }
    };

    // Visibility-aware heartbeat: refreshes lastActiveAt while visible and
    // enforces the idle timeout + absolute lifetime locally.
    const startHeartbeat = () => {
      stopHeartbeat();
      heartbeatTimer = setInterval(() => {
        const auth = getAuthClient();
        const currentUser = auth?.currentUser;
        if (!currentUser || !sessionRefRef.current) return;
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

        if (!heartbeatWritePending
          && now - lastHeartbeatAtRef.current >= SESSION_POLICY.heartbeatMs - 1000) {
          heartbeatWritePending = true;
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          const timeoutError = new Error('Session heartbeat timed out.');
          const timeout = new Promise<never>((_resolve, reject) => {
            timeoutId = setTimeout(() => reject(timeoutError), SESSION_POLICY.heartbeatTimeoutMs);
          });
          Promise.race([
            requestSessionAction(currentUser, 'heartbeat'),
            timeout,
          ])
            .then(() => {
              lastHeartbeatAtRef.current = Date.now();
              heartbeatFailureCount = 0;
              heartbeatWarningShown = false;
            })
            .catch((error) => {
              console.error('Session heartbeat failed:', error);
              heartbeatFailureCount += 1;
              if (!heartbeatWarningShown) {
                toast.warning('Could not verify your session activity. Retrying briefly.');
                heartbeatWarningShown = true;
              }
              if (error === timeoutError) {
                forceSignOut('Session verification timed out. Please check your connection and sign in again.');
              } else if (heartbeatFailureCount >= SESSION_POLICY.heartbeatFailureLimit) {
                forceSignOut('Could not verify your session. Please check your connection and sign in again.');
              }
            })
            .finally(() => {
              if (timeoutId) clearTimeout(timeoutId);
              heartbeatWritePending = false;
            });
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
      try {
        const ready = await ensureSession(firebaseUser);
        if (!ready) return;
      } catch (error) {
        console.error('Session governance could not be applied:', error);
        forceSignOut('Could not verify your session. Please check your connection and sign in again.');
        return;
      }
      if (endingRef.current) return;
      emit(firebaseUser);
      startHeartbeat();

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

    const unsubscribeAuth = onIdTokenChanged(auth, (firebaseUser) => {
      unsubAdminDoc?.();
      unsubAdminDoc = null;
      stopPolling();
      clearSessionWatch();
      stopHeartbeat();
      claimAdmin = false;
      registryAdmin = false;

      if (!firebaseUser) {
        // Session records are server-managed; if Firebase ends an auth session
        // unexpectedly, it naturally expires at its idle/absolute limit.
        localSignOutRef.current = false;
        bootstrappedUid = null;
        setUser(null);
        setVerificationEmail(null);
        setLoading(false);
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

  // ── Signed-out routing — the ONE place that decides where signing out lands ──
  // Every way a session can end funnels through the auth listener above:
  // the navbar's "Sign out", an idle timeout, an expiry, a revoke from another
  // device, an admin action, or a password reset performed elsewhere. All of
  // them surface here as `loading === false && user === null`, so this single
  // guard sends the visitor home from ANY protected page.
  //
  // Pages must not add their own auth redirects. Duplicated redirects compete
  // (the losing one wins by effect order) and a page with no guard at all ends
  // up rendering private UI to a signed-out visitor. Pages only gate their
  // render with `if (!user) return <AuthGateShell />`.
  //
  // `loading` is checked first so nothing redirects while the session is still
  // resolving, and unverified password accounts (a Firebase session exists but
  // no app identity yet) go to /auth, which owns the verification panel.
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || user || !isProtectedPath(pathname)) return;
    router.replace(verificationEmail ? '/auth' : '/');
  }, [loading, user, verificationEmail, pathname, router]);

  const signIn = useCallback(async (email: string, password: string) => {
    const auth = getAuthClient();
    if (!auth) throw new Error('Firebase Authentication is not configured.');
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string, continueUrl?: string) => {
    const auth = getAuthClient();
    if (!auth) throw new Error('Firebase Authentication is not configured.');
    const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(result.user, { displayName: name.trim() });
    // Require email verification before the account can be used. The
    // verification screen offers a resend button, so a failed send here is
    // non-fatal and must not abort the sign-up itself.
    try {
      if (continueUrl) await sendEmailVerification(result.user, { url: continueUrl });
      else await sendEmailVerification(result.user);
    } catch (error) {
      console.warn('Verification email could not be sent:', error);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = getAuthClient();
    if (!auth) throw new Error('Firebase Authentication is not configured.');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        ? (error as { code?: string }).code
        : undefined;
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider);
        return;
      }
      throw error;
    }
  }, []);

  const signOutFn = useCallback(async () => {
    // Revoke THIS device's server-managed session before signing out.
    localSignOutRef.current = true;
    endingRef.current = false;
    const auth = getAuthClient();
    const currentUser = auth?.currentUser;
    if (currentUser && sessionReadyRef.current) {
      try {
        await requestSessionAction(currentUser, 'revoke');
      } catch (error) {
        console.error('Could not revoke the app session:', error);
        toast.warning('You signed out, but the server could not revoke this session immediately.');
      }
    }
    if (auth) await firebaseSignOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const auth = getAuthClient();
    if (!auth) throw new Error('Firebase Authentication is not configured.');
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const resendVerificationEmail = useCallback(async (continueUrl?: string) => {
    const auth = getAuthClient();
    const current = auth?.currentUser ?? null;
    if (!auth || !current) throw new Error('No active session. Please sign in again.');
    if (current.emailVerified) { await activateRef.current?.(current); return; }
    if (continueUrl) await sendEmailVerification(current, { url: continueUrl });
    else await sendEmailVerification(current);
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
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
