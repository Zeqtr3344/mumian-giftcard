import { cardByToken, cardState } from '@/lib/cards';
import { db, GiftCard } from '@/lib/db';
import { sendGiftCardEmail, sendTransferConfirmEmail } from '@/lib/email';
import { cleanText, isEmail, newCode, newToken } from '@/lib/util';

export const runtime = 'nodejs';

// POST /api/card/transfer { token, fromName, toName, toEmail, message }
// The holder passes the card on: it gets a new number and QR, the old ones stop working,
// and the new holder receives the full gift card email.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const card = typeof b.token === 'string' ? await cardByToken(b.token) : null;
  if (!card) return bad('We could not find this gift card.', 404);
  if (cardState(card) !== 'active') return bad('Only a card with a balance left can be passed on.');

  const fromName = cleanText(b.fromName, 80);
  const toName = cleanText(b.toName, 80);
  const toEmail = cleanText(b.toEmail, 200).toLowerCase();
  const message = cleanText(b.message, 300);
  if (!fromName) return bad('Add your name so they know who it is from.');
  if (!toName) return bad('Add their name.');
  if (!isEmail(toEmail)) return bad('Add a valid email address for them.');
  if (toEmail === (card.recipient_email || '').toLowerCase()) return bad('That is already the email on this card.');

  const oldEmail = card.recipient_email;
  const oldName = card.recipient_name;
  let updated: GiftCard | null = null;
  for (let attempt = 0; attempt < 5 && !updated; attempt++) {
    const { data, error } = await db().from('gift_cards').update({
      code: newCode(), view_token: newToken(),
      recipient_name: toName, recipient_email: toEmail, sender_name: fromName, message: message || null,
      delivered_at: new Date().toISOString(),
      note: [card.note, `Passed on by ${fromName} (${oldEmail ?? 'no email'}) to ${toName} on ${new Date().toISOString().slice(0, 10)}`].filter(Boolean).join(' | ').slice(0, 1000),
    }).eq('id', card.id).eq('view_token', card.view_token).select('*').maybeSingle();
    if (data) updated = data as GiftCard;
    else if (error?.code !== '23505') {
      console.error('transfer failed', error?.code, error?.message);
      return bad('Something went wrong. Please try again.', 500);
    }
  }
  if (!updated) return bad('Something went wrong. Please try again.', 500);

  try { await sendGiftCardEmail(updated); } catch (e) { console.error('transfer: gift email failed', (e as Error).message); }
  if (oldEmail) {
    try { await sendTransferConfirmEmail(oldEmail, oldName, toName, updated.balance_cents); } catch (e) { console.error('transfer: confirm email failed', (e as Error).message); }
  }
  return Response.json({ ok: true });
}

function bad(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}
