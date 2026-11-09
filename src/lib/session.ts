import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { config } from './config';

export type Staff = { id: string; name: string; role: 'staff' | 'manager' };

const COOKIE = 'mm_staff';
const HOURS = 14; // one long shift

function key() {
  return new TextEncoder().encode(config.sessionSecret);
}

export async function startSession(s: Staff) {
  const token = await new SignJWT({ name: s.name, role: s.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.id)
    .setIssuedAt()
    .setExpirationTime(`${HOURS}h`)
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: HOURS * 3600,
  });
}

export async function endSession() {
  (await cookies()).set(COOKIE, '', { path: '/', maxAge: 0 });
}

export async function currentStaff(): Promise<Staff | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    return { id: String(payload.sub), name: String(payload.name), role: payload.role === 'manager' ? 'manager' : 'staff' };
  } catch {
    return null;
  }
}

/** Use at the top of a route: returns the staff member or a 401/403 response. */
export async function requireStaff(role: 'staff' | 'manager' = 'staff'): Promise<Staff | Response> {
  const s = await currentStaff();
  if (!s) return Response.json({ ok: false, error: 'Please log in again' }, { status: 401 });
  if (role === 'manager' && s.role !== 'manager') return Response.json({ ok: false, error: 'Managers only' }, { status: 403 });
  return s;
}

export async function clientId(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || 'unknown').trim();
}
