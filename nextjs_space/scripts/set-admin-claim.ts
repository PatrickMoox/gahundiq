/**
 * Sets or revokes the `admin` custom claim on a Firebase Auth user.
 *
 * The app checks `request.auth.token.admin == true` (security rules) and
 * `token.claims.admin === true` (lib/auth-context.tsx), so admin access is
 * granted by this claim - not by any Firestore document.
 *
 * Usage (from nextjs_space/):
 *   npx tsx scripts/set-admin-claim.ts --email user@example.com
 *   npx tsx scripts/set-admin-claim.ts --uid <USER_UID>
 *   npx tsx scripts/set-admin-claim.ts --email user@example.com --revoke
 *
 * Requires a service account key downloaded from
 * Firebase Console > Project settings > Service accounts
 * > Generate new private key. Save it as scripts/serviceAccountKey.json
 * (or point SERVICE_ACCOUNT_KEY_PATH at it). NEVER commit that file.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const uid = readArg('--uid');
  const email = readArg('--email');
  const revoke = process.argv.includes('--revoke');

  if (!uid && !email) {
    console.error('Provide --uid <USER_UID> or --email <USER_EMAIL>.');
    process.exit(1);
  }

  const keyPath = resolve(process.env.SERVICE_ACCOUNT_KEY_PATH ?? 'scripts/serviceAccountKey.json');
  let serviceAccount: Record<string, unknown>;
  try {
    serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
  } catch {
    console.error(`Service account key not found at: ${keyPath}`);
    console.error('Download it from Firebase Console > Project settings > Service accounts > Generate new private key.');
    process.exit(1);
  }

  initializeApp({ credential: cert(serviceAccount) });
  const auth = getAuth();

  const user = email ? await auth.getUserByEmail(email) : await auth.getUser(uid!);
  await auth.setCustomUserClaims(user.uid, revoke ? { admin: null } : { admin: true });

  const refreshed = await auth.getUser(user.uid);
  console.log(`Done. ${refreshed.email ?? refreshed.uid} now has claims:`, refreshed.customClaims ?? {});
  console.log('The user must sign out and sign back in (fresh ID token) for the claim to take effect.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Failed:', message);
  process.exit(1);
});
