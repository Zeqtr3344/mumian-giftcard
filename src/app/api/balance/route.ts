import { cardByCode, cardState } from '@/lib/cards';
import { normaliseCode } from '@/lib/util';

export const runtime = 'nodejs';

// POST /api/balance { code } → public balance check.
export async function POST(req: Request) {
  const { code } = await req.json().catch(() => ({}));
  const c = typeof code === 'string' ? normaliseCode(code) : '';
  if (c.length < 6 || c.length > 24) return Response.json({ ok: false, error: 'Check the card number and try again.' }, { status: 400 });
  await new Promise(r => setTimeout(r, 400)); // slows down guessing
  const card = await cardByCode(c);
  if (!card) return Response.json({ ok: false, error: 'We could not find that card number.' }, { status: 404 });
  return Response.json({ ok: true, balance_cents: card.balance_cents, expires_at: card.expires_at, state: cardState(card) });
}
