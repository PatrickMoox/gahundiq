import { randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';
import { SESSION_POLICY, isSessionActive, sessionExpiresAt, tsToMs } from '@/lib/session-policy';

export const runtime = 'nodejs';

function errorResponse(message: string, status: number) {
  return Response.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function bearerToken(request: Request): string | null {
  return request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

function errorDetails(error: unknown) {
  const record = error && typeof error === 'object'
    ? error as { code?: unknown; errorInfo?: unknown; message?: unknown }
    : null;
  const info = record?.errorInfo && typeof record.errorInfo === 'object'
    ? record.errorInfo as { code?: unknown; message?: unknown }
    : null;
  const code = typeof record?.code === 'string'
    ? record.code
    : typeof info?.code === 'string' ? info.code : 'unknown';
  const message = typeof record?.message === 'string'
    ? record.message
    : typeof info?.message === 'string' ? info.message : 'Unknown Firebase Admin error.';
  return { code, message };
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) return errorResponse('Sign in to manage your session.', 401);

  let app;
  try {
    app = getFirebaseAdminApp();
  } catch (error) {
    console.error('Firebase Admin is not configured for session sign-in:', error);
    const message = error instanceof Error
      ? error.message
      : 'Firebase Admin credentials are not available to the server.';
    return errorResponse(`Sign-in service is not configured: ${message}`, 503);
  }
  const auth = getAuth(app);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Request body must be valid JSON.', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse('Invalid session request.', 400);
  }
  const payload = body as Record<string, unknown>;
  const action = payload.action;
  const allowedFields = action === 'start'
    ? ['action', 'deviceId', 'deviceLabel', 'displayName', 'photoURL']
    : ['action'];
  if (Object.keys(payload).some((field) => !allowedFields.includes(field))) {
    return errorResponse('Session request contains unsupported fields.', 400);
  }

  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(token);
  } catch (error) {
    const errorRecord = error && typeof error === 'object'
      ? error as { code?: unknown; errorInfo?: unknown; name?: unknown; message?: unknown }
      : null;
    const errorInfo = errorRecord?.errorInfo && typeof errorRecord.errorInfo === 'object'
      ? errorRecord.errorInfo as { code?: unknown }
      : null;
    const rawCode = typeof errorRecord?.code === 'string' ? errorRecord.code : errorInfo?.code;
    const code = typeof rawCode === 'string' ? rawCode : 'unknown';
    console.warn('Session sign-in token verification failed:', {
      code,
      name: typeof errorRecord?.name === 'string' ? errorRecord.name : 'Error',
      message: typeof errorRecord?.message === 'string'
        ? errorRecord.message
        : 'Unknown token verification error.',
    });
    const message = code === 'auth/argument-error' || code === 'auth/invalid-id-token'
      ? `Firebase rejected the sign-in token. Check that NEXT_PUBLIC_FIREBASE_PROJECT_ID and your service-account key both use "${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'the same Firebase project'}".`
      : `Could not validate your sign-in (${code}). Check the development server log for the Firebase Auth error.`;
    return errorResponse(message, 401);
  }

  const db = getFirestore(app);
  const uid = decodedToken.uid;
  if (action === 'start') {
    if (decodedToken.appSessionId != null || decodedToken.appSessionNonce != null) {
      return errorResponse('An app session is already established.', 409);
    }
    if (decodedToken.email_verified !== true) {
      return errorResponse('Verify your email before starting a session.', 403);
    }
    const deviceId = payload.deviceId;
    const deviceLabel = payload.deviceLabel;
    if (typeof deviceId !== 'string' || !/^[a-zA-Z0-9_-]{16,64}$/.test(deviceId)
      || typeof deviceLabel !== 'string' || deviceLabel.length > 60) {
      return errorResponse('Device details are invalid.', 400);
    }

    const sessionRef = db.doc(`sessions/${uid}/devices/${deviceId}`);
    const devicesRef = db.collection(`sessions/${uid}/devices`);
    const governanceRef = db.doc(`_sessionGovernance/${uid}`);
    const nowMs = Date.now();
    const now = Timestamp.fromMillis(nowMs);
    const nonce = randomUUID();
    const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim().slice(0, 60) : '';
    const photoURL = typeof payload.photoURL === 'string' ? payload.photoURL.slice(0, 2048) : null;
    let sessionNonce: string;
    try {
      await db.doc(`users/${uid}`).set({
        email: typeof decodedToken.email === 'string' ? decodedToken.email : null,
        displayName: displayName || null,
        photoURL,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      sessionNonce = await db.runTransaction(async (transaction) => {
        await transaction.get(governanceRef);
        const sessions = await transaction.get(devicesRef);
        const existing = sessions.docs.find((snapshot) => snapshot.id === deviceId)?.data();
        const activeNonce = typeof existing?.sessionNonce === 'string' && isSessionActive(existing, nowMs)
          ? existing.sessionNonce
          : nonce;
        const activeOthers = sessions.docs
          .filter((snapshot) => snapshot.id !== deviceId)
          .map((snapshot) => ({ ref: snapshot.ref, data: snapshot.data() }))
          .filter(({ data }) => typeof data.sessionNonce === 'string' && isSessionActive(data, nowMs))
          .sort((a, b) => tsToMs(a.data.lastActiveAt) - tsToMs(b.data.lastActiveAt));
        const evictionCount = Math.max(0, activeOthers.length - (SESSION_POLICY.maxActiveSessions - 1));
        for (const session of activeOthers.slice(0, evictionCount)) {
          transaction.update(session.ref, { revokedAt: now, updatedAt: now });
        }
        transaction.set(sessionRef, {
          uid,
          deviceId,
          deviceLabel: deviceLabel.trim(),
          sessionNonce: activeNonce,
          createdAt: now,
          lastActiveAt: now,
          expiresAt: Timestamp.fromMillis(sessionExpiresAt(nowMs)),
          updatedAt: now,
        });
        transaction.set(governanceRef, {
          revision: FieldValue.increment(1),
          updatedAt: now,
        }, { merge: true });
        return activeNonce;
      });
    } catch (error) {
      const details = errorDetails(error);
      console.error('Could not create the Firebase session record:', details);
      return errorResponse(
        `Could not create your session in Firestore (${details.code}). Check the development server log and confirm the configured Firebase credentials have Firestore access.`,
        503,
      );
    }

    try {
      const claims = {
        appSessionId: deviceId,
        appSessionNonce: sessionNonce,
        ...(decodedToken.admin === true ? { admin: true } : {}),
      };
      const customToken = await auth.createCustomToken(uid, claims);
      return Response.json({ customToken }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      const details = errorDetails(error);
      console.error('Could not sign the Firebase app-session token:', details);
      return errorResponse(
        `Could not issue your session token (${details.code}). For local Google ADC, set FIREBASE_SERVICE_ACCOUNT_EMAIL to a service account in the Firebase project and grant your Google account the Service Account Token Creator role on that account. See the development server log for details.`,
        503,
      );
    }
  }

  const sessionId = decodedToken.appSessionId;
  const nonce = decodedToken.appSessionNonce;
  if (typeof sessionId !== 'string' || typeof nonce !== 'string') {
    return errorResponse('Your app session is not valid. Please sign in again.', 401);
  }
  const sessionRef = db.doc(`sessions/${uid}/devices/${sessionId}`);
  try {
    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(sessionRef);
      if (!snapshot.exists || snapshot.data()?.sessionNonce !== nonce) {
        return { error: 'Your app session was revoked. Please sign in again.' };
      }
      const session = snapshot.data()!;
      if (action === 'heartbeat') {
        if (!isSessionActive(session, Date.now())) {
          return { error: 'Your app session expired. Please sign in again.' };
        }
        const now = Timestamp.now();
        transaction.update(sessionRef, { lastActiveAt: now, updatedAt: now });
        return { ok: true };
      }
      if (action === 'revoke') {
        const now = Timestamp.now();
        transaction.update(sessionRef, { revokedAt: now, signedOutAt: now, updatedAt: now });
        return { ok: true };
      }
      return { error: 'Unsupported session action.' };
    });
    if ('error' in result && typeof result.error === 'string') return errorResponse(result.error, 401);
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Could not update the app session.', error);
    return errorResponse('Could not verify your session. Please try again.', 503);
  }
}
