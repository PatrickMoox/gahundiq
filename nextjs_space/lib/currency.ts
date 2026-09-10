import type { CurrencyCode } from '@/types/firestore';

/**
 * Multi-currency support.
 *
 * Strategy (matches the user's ask — auto-detect with manual override):
 * 1. AUTO-DETECT: the event wizard derives a sensible default currency from the
 *    browser locale (e.g. `en-RW` → RWF) — see detectCurrency(). Runs inside
 *    useEffect only (hydration-safe per eslint.ssr rules).
 * 2. MANUAL: the wizard shows a currency select; the choice is stored ON THE
 *    EVENT (`events/{id}.currency`), because budgets/vendors/gifts belong to
 *    the event's country, not the viewer's. Every tab renders in the event's
 *    currency via formatMoney().
 *
 * Platform pricing (/pricing) stays USD for now — Flutterwave settles
 * multi-currency server-side later (see payments guide).
 */

export const CURRENCIES: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: 'USD', label: 'US Dollar', symbol: '$' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'GBP', label: 'British Pound', symbol: '£' },
  { code: 'RWF', label: 'Rwandan Franc', symbol: 'FRw' },
  { code: 'KES', label: 'Kenyan Shilling', symbol: 'KSh' },
  { code: 'UGX', label: 'Ugandan Shilling', symbol: 'USh' },
  { code: 'TZS', label: 'Tanzanian Shilling', symbol: 'TSh' },
  { code: 'NGN', label: 'Nigerian Naira', symbol: '₦' },
  { code: 'GHS', label: 'Ghanaian Cedi', symbol: '₵' },
  { code: 'ZAR', label: 'South African Rand', symbol: 'R' },
  { code: 'XOF', label: 'West African CFA', symbol: 'CFA' },
  { code: 'XAF', label: 'Central African CFA', symbol: 'FCFA' },
  { code: 'ETB', label: 'Ethiopian Birr', symbol: 'Br' },
  { code: 'CAD', label: 'Canadian Dollar', symbol: 'C$' },
  { code: 'AED', label: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'INR', label: 'Indian Rupee', symbol: '₹' },
];

export const DEFAULT_CURRENCY: CurrencyCode = 'USD';

function isSupported(code: string): code is CurrencyCode {
  return CURRENCIES.some((c) => c.code === code);
}

/**
 * Best-effort currency guess from the browser's locale, e.g.
 * 'en-RW' → RWF, 'fr-FR' → EUR, 'sw-KE' → KES. Returns USD when the region
 * is unknown or the API is unavailable. Browser-only — call inside useEffect.
 */
export function detectCurrency(): CurrencyCode {
  if (typeof navigator === 'undefined') return DEFAULT_CURRENCY;
  try {
    const languages: readonly string[] = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const tag of languages) {
      // Intl.Locale may be missing in very old runtimes — mirror the region
      // from the BCP-47 tag ('fr-FR' → 'FR') as a fallback.
      const LocaleCtor = (Intl as any).Locale as { new (t: string): { region?: string } } | undefined;
      const region = typeof LocaleCtor === 'function'
        ? new LocaleCtor(tag).region
        : tag.split('-')[1]?.toUpperCase();
      // Common non-ISO quirks: 'en-GB' works, but 419 (LatAm) etc. won't.
      if (region && isSupported(region)) return region;
    }
  } catch { /* Intl.Locale unavailable or invalid tag — fall through */ }
  return DEFAULT_CURRENCY;
}

/** Zero-decimal display rule: most shilling-type currencies use no decimals. */
function fractionDigits(code: CurrencyCode): number {
  return ['RWF', 'UGX', 'TZS', 'XOF', 'XAF'].includes(code) ? 0 : 2;
}

/**
 * Hydration-safe money formatting. ALWAYS formats with the explicit 'en-US'
 * number locale (matching the SafeNumber convention in components/safe-format.tsx)
 * so SSR and client render identically. The currency code/symbol is chosen by
 * the event — not the viewer — so every collaborator sees the same figures.
 */
export function formatMoney(amount: number | null | undefined, currency?: string | null): string {
  const code: CurrencyCode = currency && isSupported(currency) ? currency : DEFAULT_CURRENCY;
  const value = Number(amount ?? 0);
  try {
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: fractionDigits(code),
      maximumFractionDigits: fractionDigits(code),
    });
  } catch {
    return `${code} ${value.toLocaleString('en-US')}`;
  }
}

/** Plain symbol for input prefixes, e.g. "$" or "FRw". */
export function currencySymbol(currency?: string | null): string {
  const code: CurrencyCode = currency && isSupported(currency) ? currency : DEFAULT_CURRENCY;
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}
