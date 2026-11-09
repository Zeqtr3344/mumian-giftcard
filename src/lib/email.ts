import 'server-only';
import { Resend } from 'resend';
import { cardState, cardUrl } from './cards';
import { config, venue } from './config';
import { db, GiftCard } from './db';
import { dollars, escapeHtml, formatCode, sydneyDate } from './util';

let resend: Resend | null = null;
const client = () => (resend ??= new Resend(config.resendKey));

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
<tr><td style="padding:20px 22px 6px;font-family:${FONT};font-size:15px;line-height:1.55;color:${C.soft};text-align:center">Show this QR code to your waiter when you pay. Scan it any time to check your balance.</td></tr>
<tr><td style="padding:12px 22px 0">${button(link, 'Check my balance', true)}</td></tr>
<tr><td style="padding:10px 22px 24px">${button(venue.booking, 'Book a table', false)}</td></tr>
${footer(`Expires ${sydneyDate(c.expires_at)} · Can be used over several visits`)}`,
  `${dollars(c.initial_cents)} MuMian gift card`);

  const { error } = await client().emails.send({
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
  const { error } = await client().emails.send({
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
  const { error } = await client().emails.send({
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
