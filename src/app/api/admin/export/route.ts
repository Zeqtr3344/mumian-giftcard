import { db } from '@/lib/db';
import { requireStaff } from '@/lib/session';
import { formatCode } from '@/lib/util';

export const runtime = 'nodejs';

// GET /api/admin/export → CSV of every card (for the accountant or a buyer's due diligence).
export async function GET() {
  const s = await requireStaff('manager');
  if (s instanceof Response) return s;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db().from('gift_cards')
      .select('code, source, status, initial_cents, balance_cents, issued_at, expires_at, recipient_name, recipient_email, note')
      .order('issued_at').range(from, from + 999);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const head = ['Card number', 'Source', 'Status', 'Original value', 'Balance', 'Issued', 'Expires', 'Recipient', 'Email', 'Note'];
  const esc = (v: unknown) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const lines = rows.map(r => [formatCode(String(r.code)), r.source, r.status, (Number(r.initial_cents) / 100).toFixed(2), (Number(r.balance_cents) / 100).toFixed(2),
    String(r.issued_at).slice(0, 10), String(r.expires_at).slice(0, 10), r.recipient_name, r.recipient_email, r.note].map(esc).join(','));
  return new Response([head.join(','), ...lines].join('\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="mumian-gift-cards-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
