import { db, GiftCard } from '@/lib/db';
import { sendCardLookupEmail } from '@/lib/email';
import { clientId } from '@/lib/session';
import { isEmail } from '@/lib/util';

export const runtime = 'nodejs';

// Escape LIKE wildcards so an email is matched exactly (case-insensitive).
const exact = (s: string) => s.replace(/[\\%_]/g, m => '\\' + m);

// POST /api/balance/email { email } → emails the cards linked to that address.
// The page never shows results, so this cannot be used to find out whether someone has a card.
export async function POST(req: Request) {
  const { email: raw } = await req.json().catch(() => ({}));
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!isEmail(email)) return Response.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400 });

  const client = await clientId();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [{ count: perEmail }, { count: perClient }] = await Promise.all([
    db().from('email_lookups').select('id', { count: 'exact', head: true }).eq('email', email).gte('at', since),
    db().from('email_lookups').select('id', { count: 'exact', head: true }).eq('client', client).gte('at', since),
  ]);
  if ((perEmail ?? 0) >= 3 || (perClient ?? 0) >= 10) {
    return Response.json({ ok: false, error: 'We have already sent this email a few times. Please check your inbox and spam folder, or try again in an hour.' }, { status: 429 });
  }
  await db().from('email_lookups').insert({ email, client });

  const [{ data: ownRaw }, { data: orders }] = await Promise.all([
    db().from('gift_cards').select('*').ilike('recipient_email', exact(email)).order('issued_at', { ascending: false }).limit(20),
    db().from('orders').select('id').ilike('buyer_email', exact(email)).eq('status', 'paid').limit(50),
  ]);
  // Cards scheduled for a future date stay a surprise until they are delivered.
  const own = ((ownRaw as GiftCard[]) || []).filter(c => c.delivered_at || c.source !== 'online');
  const ownIds = new Set(own.map(c => c.id));
  let bought: GiftCard[] = [];
  const orderIds = (orders || []).map(o => o.id);
  if (orderIds.length) {
    const { data } = await db().from('gift_cards').select('*').in('order_id', orderIds).order('issued_at', { ascending: false });
    bought = ((data as GiftCard[]) || []).filter(c => !ownIds.has(c.id));
  }
  try {
    await sendCardLookupEmail(email, own, bought);
  } catch (e) {
    console.error('Lookup email failed', e);
    return Response.json({ ok: false, error: 'We could not send the email just now. Please try again.' }, { status: 502 });
  }
  return Response.json({ ok: true });
}
