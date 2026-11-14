import { db } from '@/lib/db';
import { requireStaff } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET() {
  const s = await requireStaff('manager');
  if (s instanceof Response) return s;
  const { data, error } = await db().rpc('card_stats');
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  // Paid sales that came from a tagged link (e.g. utm_campaign=christmas in the Christmas email).
  const { data: tagged } = await db().from('orders').select('utm_campaign, amount_cents').eq('status', 'paid').not('utm_campaign', 'is', null);
  const campaigns: Record<string, { count: number; cents: number }> = {};
  for (const o of tagged ?? []) {
    const c = (campaigns[o.utm_campaign] ??= { count: 0, cents: 0 });
    c.count++; c.cents += o.amount_cents;
  }
  return Response.json({ ok: true, stats: data, campaigns });
}
