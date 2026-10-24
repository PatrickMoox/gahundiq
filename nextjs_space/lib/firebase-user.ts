import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';

export async function verifyFirebaseUser(request: Request): Promise<DecodedIdToken | null> {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const auth = getAuth(getFirebaseAdminApp());
  try {
    const decoded = await auth.verifyIdToken(token);
    return decoded.email_verified === true ? decoded : null;
  } catch {
    return null;
  }
}
