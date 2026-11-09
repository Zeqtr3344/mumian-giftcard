import { currentStaff } from '@/lib/session';

export async function GET() {
  const s = await currentStaff();
  return Response.json(s ? { ok: true, ...s } : { ok: false });
}
