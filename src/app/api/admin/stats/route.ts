import { db } from '@/lib/db';
import { requireStaff } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET() {
  const s = await requireStaff('manager');
  if (s instanceof Response) return s;
  const { data, error } = await db().rpc('card_stats');
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, stats: data });
}
