import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ADMIN_APP_NAME = 'gahundiq-admin';

export function getFirebaseAdminApp() {
  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME);
  if (existing) {
    if (!existing.options.credential) {
      throw new Error(
        'Firebase Admin was initialized without service-account credentials. Stop and restart the dev server after configuring the credential.',
      );
    }
    const configuredProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      || process.env.FIREBASE_PROJECT_ID;
    if (configuredProjectId && existing.options.projectId !== configuredProjectId) {
      throw new Error(
        `Firebase Admin app "${ADMIN_APP_NAME}" targets "${existing.options.projectId}", but the client is configured for "${configuredProjectId}". Restart the dev server after correcting the project configuration.`,
      );
    }
    return existing;
  }

  let serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || resolve(process.cwd(), 'scripts/serviceAccountKey.json');
  if (!serviceAccountJson && existsSync(credentialPath)) {
    serviceAccountJson = readFileSync(credentialPath, 'utf8');
  }

  let serviceAccount: Record<string, unknown> | undefined;
  if (serviceAccountJson) {
    try {
      const parsed: unknown = JSON.parse(serviceAccountJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      serviceAccount = parsed as Record<string, unknown>;
    } catch {
      throw new Error('Firebase Admin credentials must contain a valid service-account JSON object.');
    }
    if (typeof serviceAccount.client_email !== 'string'
      || typeof serviceAccount.private_key !== 'string'
      || typeof serviceAccount.project_id !== 'string') {
      throw new Error('Firebase Admin credentials must include project_id, client_email, and private_key.');
    }
  } else if (process.env.VERCEL) {
    throw new Error(
      'Set FIREBASE_SERVICE_ACCOUNT_JSON in Vercel to enable server-side Firebase operations.',
    );
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    || process.env.FIREBASE_PROJECT_ID
    || (typeof serviceAccount?.project_id === 'string' ? serviceAccount.project_id : undefined)
    || process.env.GOOGLE_CLOUD_PROJECT
    || process.env.GCLOUD_PROJECT;
  if (!projectId) {
    throw new Error('Set NEXT_PUBLIC_FIREBASE_PROJECT_ID to initialize Firebase Admin.');
  }

  if (serviceAccount && serviceAccount.project_id !== projectId) {
    throw new Error('Firebase Admin service-account project_id does not match the configured Firebase project.');
  }

  return initializeApp({
    projectId,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    serviceAccountId: serviceAccount
      ? undefined
      : process.env.FIREBASE_SERVICE_ACCOUNT_EMAIL,
    credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
  }, ADMIN_APP_NAME);
}
