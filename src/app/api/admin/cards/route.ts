import { db } from '@/lib/db';
import { requireStaff } from '@/lib/session';
import { normaliseCode } from '@/lib/util';

export const runtime = 'nodejs';

// GET /api/admin/cards?q=&page= → newest first, search by code, name or email.
export async function GET(req: Request) {
  const s = await requireStaff('manager');
  if (s instanceof Response) return s;
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  const page = Math.max(0, Number(url.searchParams.get('page') || 0));
  let query = db().from('gift_cards')
    .select('id, code, source, initial_cents, balance_cents, status, issued_at, expires_at, recipient_name, recipient_email, deliver_at, delivered_at', { count: 'exact' })
    .order('issued_at', { ascending: false }).range(page * 50, page * 50 + 49);
  if (q) {
    const safe = q.replace(/[,()%*]/g, ' ').trim();
    const code = normaliseCode(q);
    query = query.or(`recipient_name.ilike.%${safe}%,recipient_email.ilike.%${safe}%${code.length >= 4 ? `,code.ilike.%${code}%` : ''}`);
  }
  const { data, count, error } = await query;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, cards: data, total: count ?? 0 });
}
