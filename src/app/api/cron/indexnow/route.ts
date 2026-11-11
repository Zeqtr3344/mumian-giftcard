import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Runs daily (vercel.json). Reads mumian.au/sitemap.xml and tells Bing and other IndexNow engines
// about any page whose <lastmod> is from the last 3 days, so new journal posts and edits are crawled quickly.
// The key file lives on the website at https://mumian.au/<KEY>.txt
const KEY = '5068e62e0d21d49e23a55536339ab2bf';
const HOST = 'mumian.au';

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${config.cronSecret}`) return new Response('Unauthorised', { status: 401 });
  const all = new URL(req.url).searchParams.get('all') === '1';
  const xml = await (await fetch(`https://${HOST}/sitemap.xml`, { cache: 'no-store' })).text();
  const cutoff = Date.now() - 3 * 864e5;
  const urls: string[] = [];
  for (const m of xml.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)) {
    if (all || Date.parse(m[2]) >= cutoff) urls.push(m[1]);
  }
  if (!urls.length) return Response.json({ ok: true, submitted: 0 });
  const r = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls.slice(0, 1000) }),
  });
  return Response.json({ ok: r.ok, status: r.status, submitted: urls.length });
}
