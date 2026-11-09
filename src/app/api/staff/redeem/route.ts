import { after } from 'next/server';
import { db, GiftCard } from '@/lib/db';
import { sendRedemptionEmail } from '@/lib/email';
import { requireStaff } from '@/lib/session';
import { cleanText, normaliseCode } from '@/lib/util';

export const runtime = 'nodejs';

// POST /api/staff/redeem { code, amountCents, reference }
export async function POST(req: Request) {
  const s = await requireStaff();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const amount = Number(b.amountCents);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) return Response.json({ ok: false, error: 'Enter a valid amount' }, { status: 400 });
  const code = normaliseCode(String(b.code || ''));
  const { data, error } = await db().rpc('redeem_card', {
    p_code: code, p_amount: amount, p_staff: s.id, p_reference: cleanText(b.reference, 60) || null,
  });
  if (error) return Response.json({ ok: false, error: 'Could not redeem. Try again.' }, { status: 500 });
  if (data.ok) {
    // Email the card holder their new balance after the response has gone back to the till.
    after(async () => {
      const { data: card } = await db().from('gift_cards').select('*').eq('code', code).maybeSingle();
      if (card?.recipient_email) {
        try { await sendRedemptionEmail(card as GiftCard, amount); } catch (e) { console.error('Redemption email failed', e); }
      }
    });
  }
  return Response.json(data, { status: data.ok ? 200 : 409 });
}
