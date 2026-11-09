import { issueCard } from '@/lib/cards';
import { db } from '@/lib/db';
import { requireStaff } from '@/lib/session';
import { cleanText, isEmail, normaliseCode, sydneyMidnight } from '@/lib/util';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Row = { code?: string; original?: string; balance?: string; expiry?: string; issued?: string; name?: string; email?: string };

const money = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

/** Accepts 2027-03-01, 01/03/2027 or 1/3/27 (Australian day-first). Returns YYYY-MM-DD. */
function parseDate(v: unknown): string | null {
  const t = String(v ?? '').trim();
  let y: number, mo: number, d: number;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) { y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; mo = +m[2]; d = +m[1]; }
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null; // e.g. 31/02
  return dt.toISOString().slice(0, 10);
}

const plusDays = (ymd: string, n: number) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const plusYears = (ymd: string, n: number) => `${Number(ymd.slice(0, 4)) + n}${ymd.slice(4)}`.replace(/-02-29$/, '-02-28');
/** A card is valid until the end of its expiry day, Sydney time. */
const endOfSydneyDay = (ymd: string) => new Date(sydneyMidnight(plusDays(ymd, 1)).getTime() - 1000);

// POST /api/admin/import { rows: Row[], commit: boolean }
// Checks every row first. With commit=false nothing is saved, so the manager can review.
export async function POST(req: Request) {
  const s = await requireStaff('manager');
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const rows: Row[] = Array.isArray(b.rows) ? b.rows.slice(0, 5000) : [];
  if (!rows.length) return Response.json({ ok: false, error: 'No rows found in the file' }, { status: 400 });

  const codes = rows.map(r => normaliseCode(String(r.code ?? '')));
  const existing = new Set<string>();
  for (let i = 0; i < codes.length; i += 500) {
    const { data } = await db().from('gift_cards').select('code').in('code', codes.slice(i, i + 500));
    data?.forEach(d => existing.add(d.code));
  }

  const seen = new Set<string>();
  const checked = rows.map((r, i) => {
    const code = codes[i];
    const original = money(r.original);
    const balance = r.balance === undefined || r.balance === '' ? original : money(r.balance);
    const issuedYmd = parseDate(r.issued);
    let expiryYmd = parseDate(r.expiry);
    const problems: string[] = [];
    if (!/^[A-Z0-9]{4,24}$/.test(code)) problems.push('card number missing or invalid');
    else if (existing.has(code)) problems.push('already in the system');
    else if (seen.has(code)) problems.push('listed twice in the file');
    seen.add(code);
    if (!(original > 0)) problems.push('original value missing');
    if (!(balance >= 0) || balance > original) problems.push('balance must be between $0 and the original value');
    if (!expiryYmd && issuedYmd) expiryYmd = plusYears(issuedYmd, 3);
    if (!expiryYmd) problems.push('needs an expiry date or an issue date');
    const issued = issuedYmd ? sydneyMidnight(issuedYmd) : null;
    const expiry = expiryYmd ? endOfSydneyDay(expiryYmd) : null;
    const email = cleanText(r.email, 200).toLowerCase();
    return {
      line: i + 2, code, original, balance, issued, expiry, name: cleanText(r.name, 80) || null,
      email: isEmail(email) ? email : null, problems,
    };
  });

  const good = checked.filter(c => !c.problems.length);
  const summary = {
    rows: rows.length,
    ready: good.length,
    readyBalanceCents: good.reduce((t, c) => t + c.balance, 0),
    alreadyExpired: good.filter(c => c.expiry! < new Date()).length,
    problems: checked.filter(c => c.problems.length).slice(0, 200).map(c => ({ line: c.line, code: c.code, problems: c.problems })),
  };
  if (!b.commit) return Response.json({ ok: true, preview: true, ...summary });

  let imported = 0;
  const failed: { line: number; error: string }[] = [];
  for (const c of good) {
    try {
      await issueCard({
        source: 'tao_legacy', code: c.code, amountCents: c.original, balanceCents: c.balance,
        expiresAt: c.expiry!, issuedAt: c.issued ?? undefined, recipientName: c.name, recipientEmail: c.email,
        note: 'Imported from the Tao Group voucher system', staffId: s.id,
      });
      imported++;
    } catch (e) {
      failed.push({ line: c.line, error: e instanceof Error ? e.message : 'failed' });
    }
  }
  return Response.json({ ok: true, preview: false, ...summary, imported, failed });
}
