import { cardFromScan, cardState } from '@/lib/cards';
import { db } from '@/lib/db';
import { requireStaff } from '@/lib/session';
import { formatCode } from '@/lib/util';

export const runtime = 'nodejs';

// POST /api/staff/lookup { code } → card summary for the redeem screen.
export async function POST(req: Request) {
  const s = await requireStaff();
  if (s instanceof Response) return s;
  const { code } = await req.json().catch(() => ({}));
  const card = typeof code === 'string' && code.trim() ? await cardFromScan(code.slice(0, 300)) : null;
  if (!card) return Response.json({ ok: false, error: 'Card not found. Check the number and try again.' }, { status: 404 });
  const { data: tx } = await db().from('card_transactions').select('id, kind, amount_cents, balance_after, reference, created_at')
    .eq('card_id', card.id).order('created_at', { ascending: false }).limit(5);
  return Response.json({
    ok: true,
    card: {
      code: formatCode(card.code), rawCode: card.code, balance_cents: card.balance_cents, initial_cents: card.initial_cents,
      expires_at: card.expires_at, state: cardState(card), recipient_name: card.recipient_name, source: card.source,
    },
    recent: tx ?? [],
  });
}
