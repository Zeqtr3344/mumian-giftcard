import { db } from '@/lib/db';
import { requireStaff } from '@/lib/session';
import { sydneyMidnight, sydneyToday } from '@/lib/util';

export const runtime = 'nodejs';

// GET /api/staff/today → today's redemptions at MuMian (Sydney time), newest first.
export async function GET() {
  const s = await requireStaff();
  if (s instanceof Response) return s;
  const { data, error } = await db().from('card_transactions')
    .select('id, kind, amount_cents, created_at, reverses_id, card:card_id(code), staff:staff_id(name)')
    .in('kind', ['redeem', 'reverse'])
    .gte('created_at', sydneyMidnight(sydneyToday()).toISOString())
    .order('created_at', { ascending: false }).limit(60);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const reversed = new Set((data ?? []).filter(t => t.kind === 'reverse').map(t => t.reverses_id));
  const items = (data ?? []).filter(t => t.kind === 'redeem').map(t => ({
    id: t.id, amount_cents: -t.amount_cents, created_at: t.created_at, reversed: reversed.has(t.id),
    code: (t.card as unknown as { code: string } | null)?.code ?? '', staff: (t.staff as unknown as { name: string } | null)?.name ?? '',
  }));
  const total = items.filter(i => !i.reversed).reduce((a, i) => a + i.amount_cents, 0);
  return Response.json({ ok: true, items, total_cents: total });
}
