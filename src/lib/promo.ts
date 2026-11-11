// Seasonal gift card bonus. Shared by the buy form (browser) and checkout (server).
// The bonus is added to the card's value, so it carries the same 3-year expiry and terms as the rest of the card.
export const PROMO = {
  name: 'Christmas bonus',
  // Last moment the offer applies (Sydney time, AEDT = UTC+11).
  endsAt: '2026-12-31T23:59:59+11:00',
  endsLabel: '31 December 2026',
  // [minimum card value in cents, bonus in cents], highest first.
  tiers: [[50000, 7500], [20000, 2500], [10000, 1000]] as [number, number][],
};

export function promoActive(now = new Date()): boolean {
  return now.getTime() <= Date.parse(PROMO.endsAt);
}

export function bonusCents(amountCents: number, now = new Date()): number {
  if (!promoActive(now)) return 0;
  for (const [min, bonus] of PROMO.tiers) if (amountCents >= min) return bonus;
  return 0;
}
