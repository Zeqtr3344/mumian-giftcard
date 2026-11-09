// Tests the database functions against a real Postgres.
// Usage: DATABASE_URL=postgres://... node scripts/test-db.mjs   (run on a TEST database, it inserts rows)
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
const q = async (sql, args = []) => (await pool.query(sql, args)).rows;
let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures++;
};

const run = Math.random().toString(36).slice(2, 8).toUpperCase();
const future = new Date(Date.now() + 3 * 365 * 864e5).toISOString();

const [{ add_staff: staffId }] = await q(`select add_staff($1,'4321','manager')`, ['Test ' + run]);
check('verify correct PIN', (await q(`select * from verify_staff_pin('4321')`)).length >= 1);
check('reject wrong PIN', (await q(`select * from verify_staff_pin('0000')`)).length === 0);
for (let i = 0; i < 8; i++) await q(`select login_staff('0000',$1)`, ['ip' + run]);
const locked = (await q(`select login_staff('4321',$1) r`, ['ip' + run]))[0].r;
check('lock out after 8 wrong PINs', !locked.ok && /Too many/.test(locked.error));
check('other devices still log in', (await q(`select login_staff('4321',$1) r`, ['ip2' + run]))[0].r.ok);
let dup = false;
try { await q(`select add_staff('Dup','4321')`); } catch { dup = true; }
check('refuse duplicate PIN', dup);

const code = `MM${run}TEST1`;
const [card] = await q(`select * from issue_card($1,$2,'manual',10000,$3)`, [code, 'tok' + run, future]);
check('issue $100 card', card.balance_cents === 10000);

let r = (await q(`select redeem_card($1,2550,$2,'Table 4') r`, [code.toLowerCase(), staffId]))[0].r;
check('redeem $25.50 (lower-case code accepted)', r.ok && r.balance_cents === 7450, JSON.stringify(r));
const firstTx = r.transaction_id;

r = (await q(`select redeem_card($1,9000,$2) r`, [code, staffId]))[0].r;
check('refuse more than balance', !r.ok && r.balance_cents === 7450, r.error);

r = (await q(`select redeem_card($1,0,$2) r`, [code, staffId]))[0].r;
check('refuse $0', !r.ok);

// 10 tills try to take $30 at the same moment from $74.50: exactly 2 may succeed.
const results = await Promise.all(Array.from({ length: 10 }, () =>
  q(`select redeem_card($1,3000,$2) r`, [code, staffId]).then(x => x[0].r)));
const ok = results.filter(x => x.ok).length;
const [after] = await q(`select balance_cents from gift_cards where code=$1`, [code]);
check('concurrent redeems never overspend', ok === 2 && after.balance_cents === 1450, `ok=${ok} balance=${after.balance_cents}`);

r = (await q(`select reverse_redemption($1,$2) r`, [firstTx, staffId]))[0].r;
check('reverse first redemption', r.ok && r.balance_cents === 4000, JSON.stringify(r));
r = (await q(`select reverse_redemption($1,$2) r`, [firstTx, staffId]))[0].r;
check('cannot reverse twice', !r.ok, r.error);

const sum = (await q(`select sum(amount_cents)::int s from card_transactions where card_id=$1`, [card.id]))[0].s;
check('ledger adds up to balance', sum === 4000, `ledger=${sum}`);

const expCode = `MM${run}EXPRD`;
await q(`select issue_card($1,$2,'tao_legacy',5000,$3, p_balance => 2000)`, [expCode, 'tokx' + run, '2020-01-01T00:00:00Z']);
r = (await q(`select redeem_card($1,500,$2) r`, [expCode, staffId]))[0].r;
check('refuse expired card', !r.ok && /expired/.test(r.error), r.error);

r = (await q(`select void_card($1,$2,'Refunded') r`, [card.id, staffId]))[0].r;
const [voided] = await q(`select status,balance_cents from gift_cards where id=$1`, [card.id]);
check('void card zeroes balance', r.ok && voided.status === 'void' && voided.balance_cents === 0);
r = (await q(`select redeem_card($1,100,$2) r`, [code, staffId]))[0].r;
check('refuse cancelled card', !r.ok && /cancelled/.test(r.error));

const stats = (await q(`select card_stats() s`))[0].s;
check('stats return numbers', typeof stats.outstanding_cents === 'number', JSON.stringify(stats));

let threw = false;
try { await q(`select add_staff('Bad','12')`); } catch { threw = true; }
check('reject short PIN', threw);

await pool.end();
console.log(failures ? `\n${failures} FAILED` : '\nAll tests passed');
process.exit(failures ? 1 : 0);
