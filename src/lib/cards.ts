import 'server-only';
import { config } from './config';
import { db, GiftCard } from './db';
import { addMonths, newCode, newToken, parseScan } from './util';

type IssueArgs = {
  source: 'online' | 'manual' | 'tao_legacy';
  amountCents: number;
  balanceCents?: number;
  code?: string;
  expiresAt?: Date;
  issuedAt?: Date;
  orderId?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  senderName?: string | null;
  message?: string | null;
  deliverAt?: Date | null;
  note?: string | null;
  staffId?: string | null;
};

/** Creates a card with a fresh unique code (retries on the rare clash). */
export async function issueCard(a: IssueArgs): Promise<GiftCard> {
  const expires = a.expiresAt ?? addMonths(new Date(), config.expiryMonths);
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await db().rpc('issue_card', {
      p_code: a.code ?? newCode(),
      p_token: newToken(),
      p_source: a.source,
      p_amount: a.amountCents,
      p_expires: expires.toISOString(),
      p_order: a.orderId ?? null,
      p_recipient_name: a.recipientName ?? null,
      p_recipient_email: a.recipientEmail ?? null,
      p_sender_name: a.senderName ?? null,
      p_message: a.message ?? null,
      p_deliver_at: a.deliverAt ? a.deliverAt.toISOString() : null,
      p_note: a.note ?? null,
      p_staff: a.staffId ?? null,
      p_balance: a.balanceCents ?? null,
      p_issued_at: a.issuedAt ? a.issuedAt.toISOString() : null,
    });
    if (!error) return data as GiftCard;
    // 23505 = unique violation. A supplied code (legacy import) must not be retried.
    if (error.code !== '23505' || a.code) throw new Error(error.message);
  }
  throw new Error('Could not create a unique card code');
}

export async function cardByCode(code: string): Promise<GiftCard | null> {
  const { data } = await db().from('gift_cards').select('*').eq('code', code).maybeSingle();
  return (data as GiftCard) ?? null;
}

export async function cardByToken(token: string): Promise<GiftCard | null> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;
  const { data } = await db().from('gift_cards').select('*').eq('view_token', token).maybeSingle();
  return (data as GiftCard) ?? null;
}

/** The link encoded in the card's QR code: opens the balance page for guests, and the staff app reads it. */
export function cardUrl(c: GiftCard): string {
  return `${config.appUrl}/card/${c.view_token}`;
}

/** Find a card from a scanned QR link or a typed card number. */
export async function cardFromScan(input: string): Promise<GiftCard | null> {
  const s = parseScan(input);
  return 'token' in s ? cardByToken(s.token) : s.code ? cardByCode(s.code) : null;
}

/** What a card is worth right now, for display. */
export function cardState(c: GiftCard): 'active' | 'used' | 'expired' | 'void' {
  if (c.status === 'void') return 'void';
  if (new Date(c.expires_at) < new Date()) return 'expired';
  if (c.balance_cents <= 0) return 'used';
  return 'active';
}
