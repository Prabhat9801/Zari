/**
 * Money is stored and transported as an integer number of PAISE.
 * 1 rupee = 100 paise. ₹8,240 -> 824000.
 *
 * Never use floats for money. Percentages are applied with Math.round so the
 * advance + balance always sum exactly back to the total.
 */

export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

export const paiseToRupees = (paise: number): number => paise / 100;

/** "₹8,240" — Indian digit grouping, no decimals unless there are paise. */
export function formatINR(paise: number): string {
  const rupees = paise / 100;
  const hasPaise = paise % 100 !== 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: hasPaise ? 2 : 0,
  }).format(rupees);
}

/** "₹7,400–₹8,400" — always use this when showing an estimate, never a point value. */
export function formatRange(minPaise: number, maxPaise: number): string {
  if (minPaise === maxPaise) return formatINR(minPaise);
  return `${formatINR(minPaise)}–${formatINR(maxPaise)}`;
}

export const percentOf = (paise: number, percent: number): number =>
  Math.round((paise * percent) / 100);

/**
 * Splits a total into advance and balance so the two always sum to the total
 * exactly, with the rounding remainder landing in the balance.
 */
export function splitEscrow(total: number, advancePercent: number) {
  const advance = percentOf(total, advancePercent);
  return { advance, balance: total - advance };
}
