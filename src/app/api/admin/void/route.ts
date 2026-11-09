import { db } from '@/lib/db';
import { requireStaff } from '@/lib/session';
import { cleanText } from '@/lib/util';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const s = await requireStaff('manager');
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const reason = cleanText(b.reason, 120);
  if (!reason) return Response.json({ ok: false, error: 'Add a reason' }, { status: 400 });
  const { data, error } = await db().rpc('void_card', { p_card: String(b.id), p_staff: s.id, p_reason: reason });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json(data, { status: data.ok ? 200 : 409 });
}
