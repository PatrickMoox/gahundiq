import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Analytics, getAnalytics, isSupported } from 'firebase/analytics';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';

let app: FirebaseApp | null = null;
let analytics: Analytics | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
let storage: FirebaseStorage | null = null;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'gahundiq',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '',
};

export function isFirebaseConfigured(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.appId
  );
}

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (app) return app;
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    return app;
  } catch {
    return null;
  }
}

export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined' || analytics) return analytics;
  const fbApp = getFirebaseApp();
  if (!fbApp) return null;
  try {
    if (await isSupported()) analytics = getAnalytics(fbApp);
    return analytics;
  } catch {
    return null;
  }
}

export function getFirestoreClient(): Firestore | null {
  if (db) return db;
  const fbApp = getFirebaseApp();
  if (!fbApp) return null;
  try {
    db = getFirestore(fbApp);
    return db;
  } catch {
    return null;
  }
}

export function getAuthClient(): Auth | null {
  if (auth) return auth;
  const fbApp = getFirebaseApp();
  if (!fbApp) return null;
  try {
    auth = getAuth(fbApp);
    return auth;
  } catch {
    return null;
  }
}

export function getStorageClient(): FirebaseStorage | null {
  if (storage) return storage;
  const fbApp = getFirebaseApp();
  if (!fbApp) return null;
  try {
    storage = getStorage(fbApp);
    return storage;
  } catch {
    return null;
  }
}

// Backward-compatible aliases for existing callers.
export { getFirestoreClient as getFirestore, getAuthClient as getAuth };
