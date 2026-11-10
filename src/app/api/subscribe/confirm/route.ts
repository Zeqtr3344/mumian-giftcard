import { db } from '@/lib/db';
import { venue } from '@/lib/config';

export const runtime = 'nodejs';

// GET /api/subscribe/confirm?t=… — the link in the confirmation email.
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('t') || '';
  if (t.length >= 16) {
    await db().from('subscribers').update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('token', t).neq('status', 'unsubscribed');
  }
  return Response.redirect(`${venue.site}/journal?subscribed=1`, 302);
}
