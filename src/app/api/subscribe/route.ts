import { db } from '@/lib/db';
import { sendSubscribeConfirmEmail } from '@/lib/email';
import { cleanText, isEmail, newToken } from '@/lib/util';

export const runtime = 'nodejs';

// The journal sign-up form lives on mumian.au, so allow that origin.
const ALLOWED = ['https://mumian.au', 'https://www.mumian.au'];
function cors(req: Request) {
  const o = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED.includes(o) ? o : ALLOWED[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

// POST /api/subscribe { email, name?, source?, website? } — opt-in only, confirmed by email.
export async function POST(req: Request) {
  const h = cors(req);
  const body = await req.json().catch(() => ({}));
  if (body.website) return Response.json({ ok: true }, { headers: h }); // honeypot: bots fill hidden fields
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!isEmail(email)) return Response.json({ ok: false, error: 'Please enter a valid email address.' }, { status: 400, headers: h });
  const name = cleanText(body.name, 60) || null;
  const source = cleanText(body.source, 30) || 'journal';

  const { data: existing } = await db().from('subscribers').select('id,status,token').eq('email', email).maybeSingle();
  if (existing?.status === 'confirmed') return Response.json({ ok: true, already: true }, { headers: h });

  let token = existing?.token as string | undefined;
  if (existing) {
    token = newToken();
    await db().from('subscribers').update({ status: 'pending', token, name: name ?? undefined }).eq('id', existing.id);
  } else {
    token = newToken();
    const { error } = await db().from('subscribers').insert({ email, name, source, token });
    if (error) {
      console.error('Subscribe insert failed', error.message);
      return Response.json({ ok: false, error: 'Something went wrong. Please try again.' }, { status: 500, headers: h });
    }
  }
  try {
    await sendSubscribeConfirmEmail(email, name, token);
  } catch (e) {
    console.error('Subscribe email failed', e);
    return Response.json({ ok: false, error: 'We could not send the confirmation email. Please try again.' }, { status: 502, headers: h });
  }
  return Response.json({ ok: true }, { headers: h });
}
