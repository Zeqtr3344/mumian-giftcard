import { randomBytes, randomInt } from 'crypto';

// No 0/O, 1/I/L: easy to read out and type in.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** New card code, stored without dashes: MM + 8 characters (about 850 billion combinations). */
export function newCode(): string {
  let s = 'MM';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** Secret for the card's web page link. */
export function newToken(): string {
  return randomBytes(18).toString('base64url');
}

export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** MM4F7K29QD → MM-4F7K-29QD. Other (legacy) codes are shown in groups of four. */
export function formatCode(code: string): string {
  const c = normaliseCode(code);
  if (c.startsWith('MM') && c.length > 2) return ['MM', ...(c.slice(2).match(/.{1,4}/g) ?? [])].join('-');
  return c.match(/.{1,4}/g)?.join('-') ?? c;
}

/** What a scanned QR code points at: the card page link (holds the card's secret token) or a typed number. */
export function parseScan(input: string): { token: string } | { code: string } {
  const m = input.trim().match(/\/card\/([A-Za-z0-9_-]{16,40})/);
  return m ? { token: m[1] } : { code: normaliseCode(input) };
}

export function dollars(cents: number): string {
  const v = cents / 100;
  return v.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: Number.isInteger(v) ? 0 : 2 });
}

export function sydneyDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'long', year: 'numeric' });
}

export function sydneyDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Today's date in Sydney as YYYY-MM-DD. */
export function sydneyToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
}

/** The UTC instant of midnight at the start of a Sydney calendar day (handles daylight saving). */
export function sydneyMidnight(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  // Start from midnight UTC on that date, then shift by Sydney's offset at that moment.
  let guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Sydney', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(guess));
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    guess -= asUtc - Date.UTC(y, m - 1, d, 0, 0, 0);
  }
  return new Date(guess);
}

export function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + months);
  return x;
}

export function isEmail(s: unknown): s is string {
  return typeof s === 'string' && s.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

export function cleanText(s: unknown, max: number): string {
  return typeof s === 'string' ? s.replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim().slice(0, max) : '';
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
