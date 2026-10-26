'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { GoogleAuthProvider, createUserWithEmailAndPassword, onIdTokenChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut as firebaseSignOut, updateProfile, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { getAuthClient, getFirestoreClient } from '@/lib/firebase';

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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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

  useEffect(() => {
    const auth = getAuthClient();
    if (!auth) { setLoading(false); return; }

    let unsubAdminDoc: (() => void) | null = null;
    let unsubProfile: (() => void) | null = null;
    let claimAdmin = false;
    let registryAdmin = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    };

    const emit = (firebaseUser: User, profile: Record<string, unknown> = {}) => {
      setUser({
        uid: firebaseUser.uid,
        email: typeof profile.email === 'string' ? profile.email : firebaseUser.email,
        displayName: typeof profile.displayName === 'string' ? profile.displayName : firebaseUser.displayName,
        photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : firebaseUser.photoURL,
        role: claimAdmin || registryAdmin ? 'admin' : 'user',
        emailVerified: firebaseUser.emailVerified,
      });
      setLoading(false);
    };

    // Firebase Authentication owns sign-in; Firestore stores the user profile.
    const activate = async (firebaseUser: User) => {
      stopPolling();
      let token = await firebaseUser.getIdTokenResult();
      if (token.claims.email_verified !== firebaseUser.emailVerified) {
        // Firestore rules authorize from the ID-token claim, not user metadata.
        token = await firebaseUser.getIdTokenResult(true);
      }
      claimAdmin = token.claims.admin === true;
      setVerificationEmail(null);
      const db = getFirestoreClient();
      if (db) {
        const profileRef = doc(db, 'users', firebaseUser.uid);
        let profile: Record<string, unknown> = {};
        try {
          let profileSnapshot = await getDoc(profileRef);
          if (!profileSnapshot.exists()) {
            await setDoc(profileRef, {
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              updatedAt: serverTimestamp(),
            }, { merge: true });
            profileSnapshot = await getDoc(profileRef);
          }
          profile = profileSnapshot.data() ?? {};
        } catch (error) {
          console.error('Could not load the Firestore user profile:', error);
        }

        emit(firebaseUser, profile);
        unsubProfile?.();
        unsubProfile = onSnapshot(profileRef, (snapshot) => {
          profile = snapshot.data() ?? {};
          emit(firebaseUser, profile);
        }, (error) => {
          console.error('Could not monitor the Firestore user profile:', error);
        });

        unsubAdminDoc?.();
        unsubAdminDoc = onSnapshot(doc(db, 'admin', firebaseUser.uid), (snapshot) => {
          registryAdmin = snapshot.exists();
          emit(firebaseUser, profile);
        }, (error) => {
          console.error('Could not load the Firebase admin registry:', error);
          registryAdmin = false;
          emit(firebaseUser, profile);
        });
      } else {
        emit(firebaseUser);
      }
    };
    activateRef.current = activate;

    const unsubscribeAuth = onIdTokenChanged(auth, (firebaseUser) => {
      unsubAdminDoc?.();
      unsubAdminDoc = null;
      unsubProfile?.();
      unsubProfile = null;
      stopPolling();
      claimAdmin = false;
      registryAdmin = false;

      if (!firebaseUser) {
        setUser(null);
        setVerificationEmail(null);
        setLoading(false);
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
          }).catch((error) => {
            console.warn('Could not refresh email verification status:', error);
          });
        }, 4000);
        return;
      }

      void activate(firebaseUser).catch((error) => {
        console.error('Could not activate the Firebase user:', error);
        emit(firebaseUser);
      });
    });

    return () => {
      unsubscribeAuth();
      unsubAdminDoc?.();
      unsubProfile?.();
      stopPolling();
      activateRef.current = null;
    };
  }, []);

  // ── Signed-out routing — the ONE place that decides where signing out lands ──
  // Firebase Auth sign-out and password-reset events surface here as
  // `loading === false && user === null`, so this single
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
    await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string, continueUrl?: string) => {
    const auth = getAuthClient();
    if (!auth) throw new Error('Firebase Authentication is not configured.');
    const result = await createUserWithEmailAndPassword(auth, normalizeEmail(email), password);
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
    const auth = getAuthClient();
    if (auth) await firebaseSignOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const auth = getAuthClient();
    if (!auth) throw new Error('Firebase Authentication is not configured.');
    await sendPasswordResetEmail(auth, normalizeEmail(email));
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
