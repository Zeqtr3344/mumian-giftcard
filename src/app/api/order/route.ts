import { db } from '@/lib/db';

export const runtime = 'nodejs';

// GET /api/order?id= → status for the thank-you page (no card details are exposed).
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ ok: false }, { status: 400 });
  const { data } = await db().from('orders').select('status, amount_cents, recipient_name, deliver_at').eq('id', id).maybeSingle();
  if (!data) return Response.json({ ok: false }, { status: 404 });
  return Response.json({ ok: true, ...data });
}
