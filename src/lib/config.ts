// Central place for settings. Server-only values are read lazily so the
// build does not need real secrets.

function need(name: string): string {
  // Strip spaces and line breaks that sneak in when keys are copied and pasted.
  const v = (process.env[name] || '').replace(/\s+/g, '');
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const config = {
  get appUrl() { return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''); },
  get supabaseUrl() { return need('SUPABASE_URL'); },
  get supabaseKey() { return need('SUPABASE_SERVICE_ROLE_KEY'); },
  get stripeKey() { return need('STRIPE_SECRET_KEY'); },
  get stripeWebhookSecret() { return need('STRIPE_WEBHOOK_SECRET'); },
  get resendKey() { return need('RESEND_API_KEY'); },
  get fromEmail() { return process.env.FROM_EMAIL || 'MuMian Dining <hi@mumian.au>'; },
  get replyTo() { return process.env.REPLY_TO_EMAIL || 'mumian@taogroup.com.au'; },
  get sessionSecret() { return need('SESSION_SECRET'); },
  get cronSecret() { return need('CRON_SECRET'); },
  get expiryMonths() { return Number(process.env.GIFT_CARD_EXPIRY_MONTHS || 36); },
  get minDollars() { return Number(process.env.MIN_AMOUNT_DOLLARS || 20); },
  get maxDollars() { return Number(process.env.MAX_AMOUNT_DOLLARS || 1000); },
};

export const venue = {
  name: 'MuMian Dining',
  address: 'Shops 5 & 6, Darling Quarter, 1–25 Harbour Street, Sydney NSW 2000',
  site: 'https://mumian.au',
  email: 'mumian@taogroup.com.au',
  instagram: '@mumian.dining',
  instagramConfirmed: true, // confirmed by Shawn, 10 Nov 2026
  get instagramUrl() { return `https://www.instagram.com/${this.instagram.replace(/^@/, '')}/`; },
  maps: 'https://maps.google.com/?q=MuMian+Dining,+Darling+Quarter,+1-25+Harbour+Street,+Sydney+NSW+2000',
  shortAddress: '1–25 Harbour Street, Darling Quarter',
  booking: 'https://www.opentable.com.au/r/mumian-dining-sydney',
  legalEntity: 'Tao Darling Quarter Pty Ltd',
};
