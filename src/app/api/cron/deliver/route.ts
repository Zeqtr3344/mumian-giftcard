import { config } from '@/lib/config';
import { db } from '@/lib/db';
import { deliverIfDue } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Runs every morning (vercel.json) and sends gift cards scheduled for today.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${config.cronSecret}`) return new Response('Unauthorised', { status: 401 });
  const { data } = await db().from('gift_cards').select('id')
    .is('delivered_at', null).eq('status', 'active').not('recipient_email', 'is', null)
    .lte('deliver_at', new Date().toISOString()).limit(200);
  const results: Record<string, number> = {};
  for (const c of data ?? []) {
    const r = await deliverIfDue(c.id);
    results[r] = (results[r] ?? 0) + 1;
  }
  return Response.json({ ok: true, results });
}
