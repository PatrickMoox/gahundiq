import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

/**
 * Firestore Timestamp | Date | string | epoch-ms → Date | null.
 *
 * Values read back from Firestore arrive as Timestamp instances, NOT Date —
 * `value instanceof Date` is always false for them. Always convert through
 * this helper instead of checking instanceof (returns null when unusable).
 */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  try {
    const d = typeof (value as { toDate?: unknown }).toDate === 'function'
      ? (value as unknown as { toDate: () => Date }).toDate()
      : new Date(value as string | number);
    return d && !Number.isNaN(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

/**
 * Hydration-safe 'en-US' UTC date for the public pages (gift / invite /
 * vendor pass). Formatting is fixed-locale + fixed-timezone so SSR and client
 * render identical text. Returns `fallback` when the value is missing/invalid.
 */
export function formatEventDate(value: unknown, fallback = 'TBD'): string {
  const d = toDate(value);
  return d
    ? d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : fallback;
}

/**
 * CSV field escaping shared by every CSV export: values containing quotes,
 * commas or newlines are wrapped and quote-doubled, and non-numeric values
 * starting with =,+,-,@,Tab are prefixed with an apostrophe to neutralize
 * spreadsheet formula injection.
 */
export function csvEscape(value: unknown): string {
  if (value == null) return '';
  const str = String(value);
  const isPlainNumber = str !== '' && Number.isFinite(Number(str));
  const guarded = !isPlainNumber && /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}