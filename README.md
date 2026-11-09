# MuMian Dining gift cards

Online gift cards for MuMian Dining at **giftcard.mumian.au**: guests buy and receive cards by email, staff redeem them on a phone, and managers track every dollar.

| Page | Who uses it | What it does |
|---|---|---|
| `/` | Guests | Choose an amount ($20–$1,000), add a message, send now or on a chosen date, pay with Stripe |
| `/card/<link>` | Card holder | Balance, progress bar, expiry, QR code and history. The QR code in the email opens this page |
| `/balance` | Anyone | Check a balance by card number |
| `/staff` | Floor staff | PIN login, scan the guest's QR or type the number, take an amount off, today's redemptions. The guest is emailed their new balance |
| `/admin` | Managers | Totals, search, card history, undo a redemption, cancel, resend email, issue complimentary cards, import Tao Group vouchers, CSV export |

Built with Next.js 16, Supabase (Postgres), Stripe Checkout and Resend, to the approved MuMian gift card design (blush and brick red, Roboto Condensed, the 木棉 logo and kapok flower).

Card numbers look like `MM-4F7K-29QD`. The QR code holds a private link to the card's balance page; the staff app reads the same QR.

---

## How money is kept safe

- Every balance change happens inside the database in one locked transaction (`redeem_card`). Two tills redeeming the same card at the same moment can never overspend it; this is tested with 10 simultaneous redemptions.
- Every change is written to a ledger (`card_transactions`) with the staff member, time and table/docket reference. The ledger always adds up to the balance.
- The browser never touches the database. Only the server holds the Supabase service-role key, and row-level security blocks everything else.
- Staff log in with a personal PIN. 8 wrong PINs from one device locks it out for 15 minutes. Only managers can open `/admin`, undo redemptions, cancel cards or issue free cards.
- Stripe webhooks are signature-checked, and the same payment can never create two cards, even when Stripe resends the event.
- Cards expire 3 years after purchase (Australian minimum for gift cards) and carry no fees.

---

## Setup (about an hour, in this order)

### 1. Supabase (database)
1. supabase.com → New project. Region: **Sydney** (ap-southeast-2). `vercel.json` runs the app in Sydney (`syd1`) next to the database. Save the database password somewhere safe.
2. SQL Editor → New query → paste all of `supabase/schema.sql` → Run.
3. Add staff PINs (4–8 digits, each person their own):
   ```sql
   select add_staff('Shawn', '246810', 'manager');
   select add_staff('Amy', '1357', 'staff');
   ```
   To remove someone: `update staff set active = false where name = 'Amy';`
4. Project settings → API: copy the **Project URL** and the **service_role** key.

### 2. Stripe (payments)
1. Use the Stripe account for **Tao Darling Quarter Pty Ltd**. Start in **Test mode**.
2. Developers → API keys → copy the secret key (`sk_test_…`).
3. Developers → Webhooks → Add endpoint `https://giftcard.mumian.au/api/stripe/webhook`, events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`. Copy the signing secret (`whsec_…`).
4. Settings → Payment methods: turn on Apple Pay and Google Pay.
5. Settings → Branding: MuMian logo and red `#C8161D`, so the payment page matches.

### 3. Resend (email)
1. resend.com → Domains → add `mumian.au` and add the DNS records it shows at your domain host. Wait for "Verified". Emails are sent from hi@mumian.au, and replies go to hi@mumian.au.
2. API keys → create one with sending access.

### 4. Vercel (hosting)
1. Put this folder in a private GitHub repository → Vercel → Import.
2. Settings → Environment Variables: add everything in `.env.example`. For `SESSION_SECRET` and `CRON_SECRET`, run `openssl rand -base64 32` twice.
3. Deploy. Domains → add `giftcard.mumian.au` → add the CNAME it shows at your DNS host.
4. Use a Vercel **Pro** plan: the free Hobby plan is not allowed for commercial sites.
5. The daily job in `vercel.json` sends scheduled cards at about 8am Sydney time. Vercel calls it with `CRON_SECRET` automatically.

### 5. Test, then go live
1. With test keys, buy a card using Stripe's test card `4242 4242 4242 4242`. Check the email arrives, open the card page, then redeem part of it on `/staff` and check `/admin`.
2. Import the Tao Group vouchers (below).
3. Swap in the live Stripe key and a live webhook secret, redeploy, buy one real $20 card, redeem it, and refund it in Stripe.
4. Point the "Gift cards" buttons on mumian.au to `https://giftcard.mumian.au`.

### Staff phones
Open `https://giftcard.mumian.au/staff` on the restaurant phone or iPad → Share → **Add to Home Screen**. The camera scans the QR code; typing the number always works too. After redeeming, staff ring the same amount through AUPOS as **Gift Voucher**.

---

## Importing Tao Group vouchers
1. Export from the Tao Group voucher system the vouchers that are valid at MuMian, as CSV.
2. `/admin` → Import Tao vouchers → choose the file. The columns are matched automatically and can be changed.
   - Needed: voucher code, original value, and expiry date. If there is no expiry date, the issue date is used and the voucher gets 3 years from issue.
   - Optional: remaining balance (defaults to the full value), name, email.
   - Dates can be `31/12/2027` (day first) or `2027-12-31`.
3. Press **Check** to see what will be imported and any problems (duplicates, missing values). Nothing is saved until you press **Import**. Importing the same file twice skips vouchers already in the system.

Imported vouchers keep their original codes, so guests use the voucher they already have.

---

## Accounting notes (check with your accountant)
- Unspent balances are a liability of the business. The **Outstanding balance** on `/admin` and the CSV export give the figure at any time, which also matters for the sale of the business: the buyer takes on these cards.
- Gift cards are usually treated as face-value vouchers for GST: GST applies when the card is spent, not when it is sold.
- Complimentary cards issued from `/admin` are logged with the manager's name and reason.

---

## Developer notes
- `npm run dev` to run locally with a `.env.local`.
- `supabase/schema.sql` can be run again safely; it only creates what is missing and replaces functions.
- `scripts/test-db.mjs` tests the database functions against a **fresh test database** (it adds a test staff member with PIN 4321): `DATABASE_URL=… npm run test:db`.
- `scripts/e2e.mjs` tests the whole app end to end against a test database with Stripe and Resend mocked.
- Phase 2 ideas: Apple/Google Wallet passes (reuse the Chambers Stamp pass code), corporate bulk orders, printed physical cards with the same codes.
