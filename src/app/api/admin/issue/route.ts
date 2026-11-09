import { issueCard } from '@/lib/cards';
import { deliverIfDue } from '@/lib/email';
import { requireStaff } from '@/lib/session';
import { cleanText, isEmail } from '@/lib/util';

export const runtime = 'nodejs';

// POST /api/admin/issue → a card made by a manager (complimentary, prize, replacement).
export async function POST(req: Request) {
  const s = await requireStaff('manager');
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const amount = Number(b.amount);
  const reason = cleanText(b.reason, 120);
  const name = cleanText(b.recipientName, 80);
  const email = cleanText(b.recipientEmail, 200).toLowerCase();
  if (!Number.isInteger(amount) || amount < 1 || amount > 5000) return Response.json({ ok: false, error: 'Amount must be $1 to $5,000 in whole dollars' }, { status: 400 });
  if (!reason) return Response.json({ ok: false, error: 'Add a reason, for example "Complaint, table 12"' }, { status: 400 });
  if (email && !isEmail(email)) return Response.json({ ok: false, error: 'That email address does not look right' }, { status: 400 });
  const card = await issueCard({
    source: 'manual', amountCents: amount * 100, recipientName: name || null, recipientEmail: email || null,
    senderName: 'MuMian Dining', message: cleanText(b.message, 300) || null,
    deliverAt: email ? new Date() : null, note: reason, staffId: s.id,
  });
  const emailed = email ? await deliverIfDue(card.id) : 'not_requested';
  return Response.json({ ok: true, card: { id: card.id, code: card.code }, emailed });
}
