import { db } from '@/lib/db';
import { requireStaff } from '@/lib/session';
import { cleanText } from '@/lib/util';

export const runtime = 'nodejs';

// GET /api/admin/staff → everyone, newest first within on/off groups.
export async function GET() {
  const s = await requireStaff('manager');
  if (s instanceof Response) return s;
  const { data, error } = await db().from('staff').select('id, name, role, active, created_at')
    .order('active', { ascending: false }).order('name');
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, me: s.id, staff: data });
}

// POST /api/admin/staff { action: 'add' | 'pin' | 'role' | 'off' | 'on', ... }
export async function POST(req: Request) {
  const s = await requireStaff('manager');
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const pin = String(b.pin ?? '').trim();
  const id = String(b.id ?? '');
  const self = id === s.id;
  let r;
  switch (b.action) {
    case 'add': {
      const name = cleanText(b.name, 40);
      if (!name) return Response.json({ ok: false, error: 'Add a name' }, { status: 400 });
      r = await db().rpc('add_staff_checked', { p_name: name, p_pin: pin, p_role: b.role === 'manager' ? 'manager' : 'staff' });
      break;
    }
    case 'pin':
    case 'on':
      r = await db().rpc('set_staff_pin', { p_id: id, p_pin: pin, p_activate: b.action === 'on' });
      break;
    case 'role':
      if (self) return Response.json({ ok: false, error: 'Ask another manager to change your own role' }, { status: 400 });
      r = await db().rpc('update_staff', { p_id: id, p_role: b.role === 'manager' ? 'manager' : 'staff' });
      break;
    case 'off':
      if (self) return Response.json({ ok: false, error: 'You cannot switch yourself off' }, { status: 400 });
      r = await db().rpc('update_staff', { p_id: id, p_active: false });
      break;
    default:
      return Response.json({ ok: false, error: 'Unknown action' }, { status: 400 });
  }
  if (r.error) return Response.json({ ok: false, error: r.error.message }, { status: 500 });
  return Response.json(r.data, { status: r.data.ok ? 200 : 409 });
}
