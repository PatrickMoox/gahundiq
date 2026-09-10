// ============================================================================
// Session Governance Policy — single source of truth.
//
// Every session-lifecycle decision (creation, extension, idle expiry, absolute
// expiry, concurrent-device eviction, revocation) is derived from SESSION_POLICY
// below. Change policy here, never in call sites.
//
// Model: a "session" is a per-device record at `sessions/{uid}/{deviceId}`.
//   - A stable random deviceId is kept in localStorage, so reloads reuse the
//     same record while different browsers/devices open their own.
//   - `lastActiveAt` is refreshed by a visibility-aware heartbeat (hidden tabs
//     are "away" and count toward the idle timeout).
//   - Idle expiry is enforced locally: now - lastActiveAt > idle + grace.
//   - Absolute expiry (`expiresAt`) is a hard ceiling enforced locally, and
//     refreshed only on re-authentication.
//   - Revocation (sign-out from another device, admin action, LRU eviction at
//     the concurrent-device cap) is enforced by a live snapshot watch on the
//     session doc, which force-signs-out the affected device.
//   - Password resets: Firebase's hosted reset flow revokes the user's refresh
//     tokens, so every device is signed out by Firebase itself. The affected
//     devices detect this as an involuntary sign-out (onAuthStateChanged(null))
//     and end their session record, keeping the registry truthful. NOTE: without
//     a Cloud Function trigger on user update, revocation of OTHER devices lands
//     within Firebase's token-refresh window (~1h) or the idle timeout, not
//     instantly — the local device's own record is always ended immediately.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';

export const SESSION_POLICY = {
  // Hard ceiling on any single session regardless of activity. After this the
  // user must re-authenticate (a fresh sign-in refreshes the ceiling).
  absoluteLifetimeMs: 14 * 24 * 60 * 60 * 1000, // 14 days

  // Inactivity timeout. Because heartbeats only run while the tab is visible,
  // a background or abandoned tab naturally goes idle and is signed out.
  idleTimeoutMs: 30 * 60 * 1000, // 30 min

  // Extra runway on top of idleTimeoutMs before the client force-signs-out.
  // Absorbs throttled heartbeats, suspended laptops, and clock drift.
  idleGraceMs: 5 * 60 * 1000, // 5 min

  // How often the client refreshes lastActiveAt while visible.
  heartbeatMs: 60 * 1000, // 1 min

  // Concurrent active sessions allowed per account. When a new device signs in
  // at the cap, the least-recently-active live device is evicted: its session
  // doc is flagged revokedAt and that device is signed out by its own watch.
  maxActiveSessions: 3,
} as const;

/** localStorage key holding the stable per-browser device id. */
export const SESSION_DEVICE_KEY = 'gahundiq.deviceId';

/**
 * Converts a Firestore Timestamp | Date | string | epoch-ms number into epoch
 * ms. Returns 0 for anything unusable so callers can treat it as "unknown".
 */
export function tsToMs(value: any): number {
  if (!value) return 0;
  try {
    if (typeof value.toDate === 'function') {
      const d = value.toDate();
      return d ? d.getTime() : 0;
    }
    const d = value instanceof Date ? value : new Date(value);
    return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
  } catch {
    return 0;
  }
}

/**
 * True while a session record is allowed to keep running at `now`:
 * not revoked/signed out, not past its absolute ceiling, and not idle-past-grace.
 */
export function isSessionActive(record: any, now: number): boolean {
  if (!record) return false;
  if (record.revokedAt != null || record.signedOutAt != null) return false;
  const expiresAt = tsToMs(record.expiresAt);
  if (expiresAt > 0 && now >= expiresAt) return false;
  const lastActive = tsToMs(record.lastActiveAt);
  if (lastActive > 0 && now - lastActive > SESSION_POLICY.idleTimeoutMs + SESSION_POLICY.idleGraceMs) {
    return false;
  }
  // Missing timestamps: stay permissive (record may be mid-first-write).
  return true;
}

/** Absolute `expiresAt` for a session issued/refreshed at `now`. */
export function sessionExpiresAt(now: number): number {
  return now + SESSION_POLICY.absoluteLifetimeMs;
}

/**
 * The stable id for THIS browser/device. Created once and persisted so session
 * records are reused across reloads (and evicted properly when the cap is hit).
 * Falls back to an in-memory uuid when localStorage is unavailable (private
 * mode / no store) — governance then degrades gracefully to in-memory.
 */
export function getOrCreateDeviceId(): string {
  try {
    if (typeof localStorage === 'undefined') return uuidv4();
    const existing = localStorage.getItem(SESSION_DEVICE_KEY);
    if (existing) return existing;
    const created = uuidv4();
    localStorage.setItem(SESSION_DEVICE_KEY, created);
    return created;
  } catch {
    return uuidv4();
  }
}

/** Human-friendly device label, e.g. "Chrome · macOS". Deterministic (SSR-safe). */
export function classifyDeviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Device';
  const ua = userAgent;
  const os = /Windows NT/.test(ua) ? 'Windows'
    : /Macintosh|Mac OS X/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Device';
  const browser = /Firefox\//.test(ua) ? 'Firefox'
    : /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  return `${browser} · ${os}`;
}

/** Compact human duration, e.g. "30 min", "14 days". */
export function fmtDuration(ms: number): string {
  if (ms <= 0) return '0 min';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr${hours > 1 ? 's' : ''}`;
  const days = Math.round(hours / 24);
  return `${days} day${days > 1 ? 's' : ''}`;
}