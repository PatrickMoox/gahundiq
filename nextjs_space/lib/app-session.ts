import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';
import { isSessionActive } from '@/lib/session-policy';

export async function verifyAppSession(request: Request): Promise<DecodedIdToken | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const app = getFirebaseAdminApp();
  let decoded: DecodedIdToken;
  try {
    decoded = await getAuth(app).verifyIdToken(token);
  } catch {
    return null;
  }
  const sessionId = decoded.appSessionId;
  const nonce = decoded.appSessionNonce;
  if (typeof sessionId !== 'string' || typeof nonce !== 'string') return null;
  try {
    const snapshot = await getFirestore(app).doc(`sessions/${decoded.uid}/devices/${sessionId}`).get();
    const session = snapshot.data();
    if (!snapshot.exists || !session
      || session.uid !== decoded.uid
      || session.deviceId !== sessionId
      || session.sessionNonce !== nonce
      || !isSessionActive(session, Date.now())) {
      return null;
    }
    return decoded;
  } catch (error) {
    console.error('App session verification failed:', error);
    return null;
  }
}
