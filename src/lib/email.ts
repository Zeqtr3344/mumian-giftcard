import 'server-only';
import { Resend } from 'resend';
import { cardState, cardUrl } from './cards';
import { config, venue } from './config';
import { db, GiftCard } from './db';
import { dollars, escapeHtml, formatCode, sydneyDate } from './util';

let resend: Resend | null = null;
const client = () => (resend ??= new Resend(config.resendKey));

/** Plain-text twin of an HTML email. Sending both parts helps inbox placement (Gmail's Primary tab). */
function toText(html: string): string {
  return html
    .replace(/<(style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<span style="display:none[\s\S]*?<\/span>/i, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => `${label.replace(/<[^>]+>/g, '').trim()}: ${href}`)
    .replace(/<img [^>]*alt="([^"]*)"[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<\/(tr|div|p|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter((l, i, a) => l || (a[i - 1] ?? '') !== '')
    .join('\n').trim();
}

type Mail = { from: string; to: string; replyTo: string; subject: string; html: string };
const send = (m: Mail) => client().emails.send({ ...m, text: toText(m.html) });

// Colours and type from the approved MuMian gift card design.
const C = { ink: '#231F20', mute: '#6B5752', soft: '#5E4E4A', red: '#9D2A17', paper: '#F6EEEA', blush: '#E4CEC6', line: '#DCC8C0', outer: '#EDE6E2' };
const FONT = "'Roboto Condensed','Arial Narrow',Helvetica,Arial,sans-serif";

function img(path: string) {
  return `${config.appUrl}${path}`;
}

function button(href: string, label: string, solid: boolean) {
  return `<a href="${href}" style="display:block;height:50px;line-height:50px;border-radius:12px;text-align:center;text-decoration:none;font-family:${FONT};font-size:17px;font-weight:700;${solid ? `background:${C.red};color:#ffffff;` : `border:1px solid ${C.red};color:${C.red};line-height:48px;`}">${label}</a>`;
}

/** Banner with the 木棉 logo, a headline and the kapok flower on the right. */
function banner(headline: string) {
  return `<tr><td style="background:${C.blush};padding:0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td valign="bottom" style="padding:28px 0 26px 22px">
      <img src="${img('/logo-red.png')}" width="109" height="34" alt="MūMiān 木棉" style="display:block;border:0;margin-bottom:14px">
      <div style="font-family:${FONT};font-size:28px;line-height:1.15;font-weight:700;color:${C.ink}">${headline}</div>
    </td>
    <td width="150" valign="top" align="right" style="padding:0"><img src="${img('/flower-a-email.jpg')}" width="150" height="218" alt="" style="display:block;border:0"></td>
  </tr></table></td></tr>`;
}

function footer(extra = '') {
  return `<tr><td style="padding:16px 22px 28px;border-top:1px solid ${C.line};font-family:${FONT};font-size:13px;line-height:1.7;color:${C.mute};text-align:center">
  ${extra}${extra ? '<br>' : ''}${venue.shortAddress.toUpperCase()}<br>
  <a href="mailto:${venue.email}" style="color:${C.mute}">${venue.email.toUpperCase()}</a> · <a href="${venue.site}" style="color:${C.mute}">MUMIAN.AU</a> · ${venue.instagram.toUpperCase()}
  </td></tr>`;
}

function shell(rows: string, preheader: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;500;700&display=swap" rel="stylesheet"></head>
<body style="margin:0;background:${C.outer};color:${C.ink}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.outer}"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${C.paper}">
${rows}
</table></td></tr></table></body></html>`;
}


function sectionTitle(t: string) {
  return `<div style="font-family:${FONT};font-size:13px;letter-spacing:2px;font-weight:700;color:${C.red};padding-bottom:8px">${t}</div>`;
}

/** For people who have never been: what MuMian is, with four signature dishes. */
function aboutMuMian() {
  const dish = (file: string, label: string) => `<td width="50%" valign="top" style="padding:4px">
    <img src="${img(`/email/${file}.jpg`)}" width="214" height="214" alt="${label}" style="display:block;width:100%;height:auto;border:0;border-radius:10px">
    <div style="font-family:${FONT};font-size:13px;color:${C.soft};padding:6px 2px 4px">${label}</div></td>`;
  return `<tr><td style="padding:22px 22px 6px;border-top:1px solid ${C.line}">
  ${sectionTitle('ABOUT MUMIAN')}
  <div style="font-family:${FONT};font-size:16px;line-height:1.6;color:#3E3431">MuMian Dining is a modern Cantonese restaurant at Darling Quarter, Darling Harbour, Sydney. Come for a feast made for sharing: live seafood from our tanks, Cantonese roast meats, handmade dim sum and cocktails, in a warm dining room with alfresco seating and a private dining room for celebrations.</div>
</td></tr>
<tr><td style="padding:10px 18px 4px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>${dish('lobster', 'Live lobster, Cantonese style')}${dish('roast-duck', 'Cantonese roast duck')}</tr>
  </table>
</td></tr>`;
}

function howToUse() {
  const step = (n: number, text: string) => `<tr><td width="30" valign="top" style="font-family:${FONT};font-size:16px;font-weight:700;color:${C.red};padding:4px 0">${n}</td><td style="font-family:${FONT};font-size:15px;line-height:1.55;color:#3E3431;padding:4px 0">${text}</td></tr>`;
  return `<tr><td style="padding:18px 22px 4px;border-top:1px solid ${C.line}">
  ${sectionTitle('HOW TO USE YOUR GIFT CARD')}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${step(1, `Book a table online at <a href="${venue.booking}" style="color:${C.red}">OpenTable</a>, or walk in when tables are free. Lunch and dinner, seven days, at ${escapeHtml(venue.shortAddress)}.`)}
    ${step(2, 'When you are ready to pay, show the QR code above to your waiter. They scan it and take the amount off your card.')}
    ${step(3, 'Any amount left stays on your card for your next visit. We email you the new balance each time.')}
  </table>
</td></tr>`;
}

function terms(expires: string) {
  return `<tr><td style="padding:14px 22px 20px;border-top:1px solid ${C.line}">
  ${sectionTitle('GOOD TO KNOW')}
  <div style="font-family:${FONT};font-size:13px;line-height:1.7;color:${C.mute}">
  · Valid until ${expires}. Use it for food and drinks at MuMian Dining, Darling Quarter.<br>
  · Can be used over several visits. Any unused amount stays on the card.<br>
  · Not redeemable for cash, and no change is given.<br>
  · If the bill is more than the balance, simply pay the difference.<br>
  · Keep this email safe: anyone with the QR code can use the card. Lost it? Email us and we can resend it.
  </div>
</td></tr>`;
}

export async function sendGiftCardEmail(c: GiftCard) {
  if (!c.recipient_email) throw new Error('Card has no email address');
  const link = cardUrl(c);
  const name = c.recipient_name || 'there';
  const headline = c.sender_name ? `Hi ${escapeHtml(name)}, a gift from ${escapeHtml(c.sender_name)}` : 'Your MuMian gift card';
  const html = shell(`
${banner(headline)}
<tr><td style="padding:26px 22px 8px">
  ${c.message ? `<div style="font-family:${FONT};font-size:17px;line-height:1.55;color:#3E3431;text-align:center;padding-bottom:22px">“${escapeHtml(c.message)}”</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line};border-bottom:1px solid ${C.line}"><tr>
    <td style="padding:14px 0;font-family:${FONT};font-size:14px;letter-spacing:2px;color:${C.ink}">GIFT CARD VALUE</td>
    <td align="right" style="padding:14px 0;font-family:${FONT};font-size:34px;font-weight:700;color:${C.ink}">${dollars(c.initial_cents)}</td>
  </tr></table>
</td></tr>
<tr><td align="center" style="padding:14px 22px 0">
  <table role="presentation" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${C.line};border-radius:16px"><tr><td align="center" style="padding:18px">
    <img src="${img(`/api/qr/${c.view_token}`)}" width="176" height="176" alt="QR code for your gift card" style="display:block;border:0">
    <div style="font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:2px;padding-top:10px;color:${C.ink}">${formatCode(c.code)}</div>
  </td></tr></table>
</td></tr>
<tr><td style="padding:20px 22px 6px;font-family:${FONT};font-size:15px;line-height:1.55;color:${C.soft};text-align:center">Show this QR code to your waiter when you pay. Tap <b>Open my gift card</b> below any time to see your balance on your phone.</td></tr>
<tr><td style="padding:12px 22px 0">${button(link, 'Open my gift card &amp; balance', true)}</td></tr>
<tr><td style="padding:10px 22px 0">${button(venue.booking, 'Book a table', false)}</td></tr>
<tr><td style="padding:10px 22px 24px">${button(`${link}#give`, 'Give this card to someone else', false)}</td></tr>
${aboutMuMian()}
${howToUse()}
${terms(sydneyDate(c.expires_at))}
${footer()}`,
  `${dollars(c.initial_cents)} MuMian gift card`);

  const { error } = await send({
    from: config.fromEmail, to: c.recipient_email, replyTo: config.replyTo,
    subject: c.sender_name ? `${c.sender_name} sent you a MuMian gift card` : 'Your MuMian gift card',
    html,
  });
  if (error) throw new Error(error.message);
}

/** After a redemption: tells the holder what was spent and what is left. */
export async function sendRedemptionEmail(c: GiftCard, spentCents: number) {
  if (!c.recipient_email) return;
  const left = c.balance_cents;
  const html = shell(`
${banner(`Thanks for dining with us${c.recipient_name ? `, ${escapeHtml(c.recipient_name)}` : ''}`)}
<tr><td style="padding:26px 22px 6px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line}"><tr>
    <td style="padding:14px 0;font-family:${FONT};font-size:16px;color:${C.ink}">Used today</td>
    <td align="right" style="padding:14px 0;font-family:${FONT};font-size:18px;font-weight:700;color:${C.ink}">−${dollars(spentCents)}</td>
  </tr><tr>
    <td style="padding:14px 0;border-top:1px solid ${C.line};border-bottom:1px solid ${C.line};font-family:${FONT};font-size:14px;letter-spacing:2px;color:${C.ink}">BALANCE LEFT</td>
    <td align="right" style="padding:14px 0;border-top:1px solid ${C.line};border-bottom:1px solid ${C.line};font-family:${FONT};font-size:34px;font-weight:700;color:${C.ink}">${dollars(left)}</td>
  </tr></table>
</td></tr>
<tr><td style="padding:16px 22px 6px;font-family:${FONT};font-size:15px;line-height:1.55;color:${C.soft};text-align:center">
  ${cardState(c) === 'active' ? `Your card ${formatCode(c.code)} still has ${dollars(left)} to spend, valid until ${sydneyDate(c.expires_at)}.` : `Your card ${formatCode(c.code)} has now been fully used.`}
</td></tr>
<tr><td style="padding:12px 22px 24px">${button(cardUrl(c), 'See my gift card', true)}</td></tr>
${footer()}`, `${dollars(spentCents)} used, ${dollars(left)} left on your MuMian gift card`);
  const { error } = await send({
    from: config.fromEmail, to: c.recipient_email, replyTo: config.replyTo,
    subject: `${dollars(left)} left on your MuMian gift card`, html,
  });
  if (error) throw new Error(error.message);
}

export async function sendReceiptEmail(o: { buyer_name: string; buyer_email: string; recipient_name: string; recipient_email: string; amount_cents: number; deliver_at: string }, sendsNow: boolean) {
  const self = o.buyer_email.toLowerCase() === o.recipient_email.toLowerCase();
  const when = sendsNow
    ? (self ? 'Your card is in a separate email.' : `We've emailed it to ${escapeHtml(o.recipient_name)} (${escapeHtml(o.recipient_email)}).`)
    : (self ? `It will arrive on the morning of ${sydneyDate(o.deliver_at)}.` : `We'll email it to ${escapeHtml(o.recipient_name)} (${escapeHtml(o.recipient_email)}) on the morning of ${sydneyDate(o.deliver_at)}.`);
  const html = shell(`
${banner('Thank you for your order')}
<tr><td style="padding:26px 22px 6px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line};border-bottom:1px solid ${C.line}"><tr>
    <td style="padding:14px 0;font-family:${FONT};font-size:14px;letter-spacing:2px;color:${C.ink}">GIFT CARD${self ? '' : ` FOR ${escapeHtml(o.recipient_name.toUpperCase())}`}</td>
    <td align="right" style="padding:14px 0;font-family:${FONT};font-size:34px;font-weight:700;color:${C.ink}">${dollars(o.amount_cents)}</td>
  </tr></table>
</td></tr>
<tr><td style="padding:16px 22px 24px;font-family:${FONT};font-size:16px;line-height:1.6;color:${C.soft}">Hi ${escapeHtml(o.buyer_name)}, ${when} Your payment receipt from Stripe is sent separately. If anything looks wrong, just reply to this email.</td></tr>
${footer()}`, 'Thanks for your MuMian gift card order');
  const { error } = await send({
    from: config.fromEmail, to: o.buyer_email, replyTo: config.replyTo,
    subject: 'Your MuMian gift card order', html,
  });
  if (error) throw new Error(error.message);
}

/**
 * Send a card's email if it is due and not yet sent. Claims the card first so a
 * webhook retry and the daily job can never send the same card twice.
 */
export async function deliverIfDue(cardId: string, force = false): Promise<'sent' | 'not_due' | 'already_sent' | 'failed'> {
  const now = new Date().toISOString();
  let q = db().from('gift_cards').update({ delivered_at: now }).eq('id', cardId).eq('status', 'active');
  if (!force) q = q.is('delivered_at', null).lte('deliver_at', now);
  const { data, error } = await q.select('*').maybeSingle();
  if (error) return 'failed';
  if (!data) {
    const { data: c } = await db().from('gift_cards').select('delivered_at').eq('id', cardId).maybeSingle();
    return c?.delivered_at ? 'already_sent' : 'not_due';
  }
  try {
    await sendGiftCardEmail(data as GiftCard);
    return 'sent';
  } catch (e) {
    console.error('Gift card email failed', cardId, e);
    if (!force) await db().from('gift_cards').update({ delivered_at: null }).eq('id', cardId);
    return 'failed';
  }
}

/** To the previous holder after they pass the card on. */
export async function sendTransferConfirmEmail(to: string, name: string | null, toName: string, balanceCents: number) {
  const html = shell(`
${banner(`Your gift card is on its way to ${escapeHtml(toName)}`)}
<tr><td style="padding:26px 22px 10px;font-family:${FONT};font-size:16px;line-height:1.6;color:#3E3431">
  Hi ${escapeHtml(name || 'there')}, we have emailed your MuMian gift card with its ${dollars(balanceCents)} balance to ${escapeHtml(toName)}. The card now has a new number and QR code, so your old email and link no longer work.<br><br>
  If you did not do this, please reply to this email straight away.
</td></tr>
<tr><td style="padding:10px 22px 24px">${button(venue.booking, 'Book a table', false)}</td></tr>
${footer()}`, `Your gift card was passed to ${toName}`);
  const { error } = await send({ from: config.fromEmail, to, replyTo: config.replyTo, subject: `Your MuMian gift card was passed to ${toName}`, html });
  if (error) throw new Error(error.message);
}

/** Double opt-in: ask a new journal subscriber to confirm. */
export async function sendSubscribeConfirmEmail(to: string, name: string | null, token: string) {
  const link = `${config.appUrl}/api/subscribe/confirm?t=${encodeURIComponent(token)}`;
  const html = shell(`
${banner('Please confirm your subscription')}
<tr><td style="padding:26px 22px 10px;font-family:${FONT};font-size:16px;line-height:1.6;color:#3E3431">
  Hi ${escapeHtml(name || 'there')}, thank you for signing up to the MuMian Journal: what's on around Darling Harbour, new dishes and news from MuMian Dining, sent now and then.<br><br>
  Please tap the button below to confirm. If you did not sign up, simply ignore this email and you will not hear from us.
</td></tr>
<tr><td style="padding:10px 22px 26px">${button(link, 'Yes, subscribe me', true)}</td></tr>
${footer()}`, 'One tap to confirm your MuMian Journal subscription');
  const { error } = await send({ from: config.fromEmail, to, replyTo: config.replyTo, subject: 'Confirm your MuMian Journal subscription', html });
  if (error) throw new Error(error.message);
}


/** "Find my gift cards": recipients get their card links; buyers get a balance summary only (no QR, so they cannot spend it). */
export async function sendCardLookupEmail(to: string, own: GiftCard[], bought: GiftCard[]) {
  const stateLine = (c: GiftCard) => {
    const s = cardState(c);
    if (s === 'void') return 'Cancelled';
    if (s === 'expired') return `Expired on ${sydneyDate(c.expires_at)}`;
    if (s === 'used') return 'Fully used';
    return `${dollars(c.balance_cents)} of ${dollars(c.initial_cents)} left · valid until ${sydneyDate(c.expires_at)}`;
  };
  const row = (title: string, sub: string, link?: string) => `<tr><td style="padding:12px 0;border-bottom:1px solid ${C.line};font-family:${FONT}">
    <div style="font-size:16px;font-weight:700;color:${C.ink}">${title}</div>
    <div style="font-size:14px;color:${C.soft};padding-top:2px">${sub}</div>
    ${link ? `<div style="padding-top:8px"><a href="${link}" style="color:${C.red};font-size:15px;font-weight:700">Open card and QR code →</a></div>` : ''}
  </td></tr>`;
  const ownRows = own.map(c => row(`Card ${formatCode(c.code)}${c.sender_name ? ` · from ${escapeHtml(c.sender_name)}` : ''}`, stateLine(c), cardState(c) === 'active' ? cardUrl(c) : undefined)).join('');
  const boughtRows = bought.map(c => row(
    `Gift for ${escapeHtml(c.recipient_name || 'your recipient')}`,
    !c.delivered_at && c.deliver_at ? `${dollars(c.initial_cents)} · scheduled to be emailed on ${sydneyDate(c.deliver_at)}` : stateLine(c),
  )).join('');
  const none = !own.length && !bought.length;
  const html = shell(`
${banner('Your MuMian gift cards')}
<tr><td style="padding:24px 22px 4px;font-family:${FONT};font-size:16px;line-height:1.6;color:#3E3431">
  ${none
    ? `Someone asked us to look up gift cards for this email address, but we could not find any. If a card was sent to a different email, try that one, or reply to this email and we will help.`
    : `Here are the MuMian gift cards linked to this email address, as you asked.`}
</td></tr>
${own.length ? `<tr><td style="padding:14px 22px 0">${sectionTitle('CARDS FOR YOU')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${ownRows}</table></td></tr>` : ''}
${bought.length ? `<tr><td style="padding:18px 22px 0">${sectionTitle('GIFT CARDS YOU BOUGHT')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${boughtRows}</table>
  <div style="font-family:${FONT};font-size:13px;line-height:1.6;color:${C.mute};padding-top:10px">For security, the QR code for a gift is only sent to the person receiving it.</div></td></tr>` : ''}
<tr><td style="padding:22px 22px 24px">${button(venue.booking, 'Book a table', true)}</td></tr>
<tr><td style="padding:0 22px 16px;font-family:${FONT};font-size:13px;color:${C.mute}">Did not ask for this? You can ignore this email; nobody else can see these details.</td></tr>
${footer()}`, 'The gift cards linked to your email');
  const { error } = await send({ from: config.fromEmail, to, replyTo: config.replyTo, subject: 'Your MuMian gift cards', html });
  if (error) throw new Error(error.message);
}
