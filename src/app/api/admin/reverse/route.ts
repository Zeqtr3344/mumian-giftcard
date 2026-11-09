import { db } from '@/lib/db';
import { requireStaff } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const s = await requireStaff('manager');
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const { data, error } = await db().rpc('reverse_redemption', { p_tx: Number(b.transactionId), p_staff: s.id });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json(data, { status: data.ok ? 200 : 409 });
}
