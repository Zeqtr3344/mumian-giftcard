import { db } from '@/lib/db';
import { requireStaff } from '@/lib/session';

export const runtime = 'nodejs';

// GET /api/admin/card?id= → card with full history and order details.
export async function GET(req: Request) {
  const s = await requireStaff('manager');
  if (s instanceof Response) return s;
  const id = new URL(req.url).searchParams.get('id') || '';
  const { data: card } = await db().from('gift_cards').select('*').eq('id', id).maybeSingle();
  if (!card) return Response.json({ ok: false, error: 'Card not found' }, { status: 404 });
  const [{ data: tx }, { data: order }] = await Promise.all([
    db().from('card_transactions').select('*, staff:staff_id(name)').eq('card_id', id).order('created_at', { ascending: false }),
    card.order_id ? db().from('orders').select('*').eq('id', card.order_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return Response.json({ ok: true, card, transactions: tx ?? [], order });
}
