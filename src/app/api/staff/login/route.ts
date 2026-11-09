import { db } from '@/lib/db';
import { clientId, startSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { pin } = await req.json().catch(() => ({}));
  if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) return Response.json({ ok: false, error: 'Enter your 4 to 8 digit PIN' }, { status: 400 });
  const { data, error } = await db().rpc('login_staff', { p_pin: pin, p_client: await clientId() });
  if (error) return Response.json({ ok: false, error: 'Login is not working right now' }, { status: 500 });
  if (!data.ok) return Response.json(data, { status: 401 });
  await startSession({ id: data.id, name: data.name, role: data.role });
  return Response.json({ ok: true, name: data.name, role: data.role });
}
