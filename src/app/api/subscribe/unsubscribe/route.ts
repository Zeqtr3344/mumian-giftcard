import { db } from '@/lib/db';
import { venue } from '@/lib/config';

export const runtime = 'nodejs';

// GET /api/subscribe/unsubscribe?t=… — one-click unsubscribe link in every newsletter.
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('t') || '';
  if (t.length >= 16) {
    await db().from('subscribers').update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() }).eq('token', t);
  }
  return Response.redirect(`${venue.site}/journal?unsubscribed=1`, 302);
}
// Mail clients' one-click unsubscribe (RFC 8058) uses POST.
export const POST = GET;
