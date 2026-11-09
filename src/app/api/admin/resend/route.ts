import { db } from '@/lib/db';
import { deliverIfDue } from '@/lib/email';
import { requireStaff } from '@/lib/session';
import { cleanText, isEmail } from '@/lib/util';

export const runtime = 'nodejs';

// POST /api/admin/resend { id, email? } → send the card email again, optionally to a corrected address.
export async function POST(req: Request) {
  const s = await requireStaff('manager');
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const email = cleanText(b.email, 200).toLowerCase();
  if (email) {
    if (!isEmail(email)) return Response.json({ ok: false, error: 'That email address does not look right' }, { status: 400 });
    await db().from('gift_cards').update({ recipient_email: email }).eq('id', String(b.id));
  }
  const r = await deliverIfDue(String(b.id), true);
  return Response.json({ ok: r === 'sent', result: r, error: r === 'sent' ? undefined : 'Email could not be sent' });
}
