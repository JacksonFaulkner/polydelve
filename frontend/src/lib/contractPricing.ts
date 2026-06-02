// Mirrors backend features/contract_pricing.py

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export function computeGrade(
  numCves: number,
  epssScore: number | null,
  inCisaKev: boolean,
  maxCvss: number | null,
): number {
  const epss = epssScore ?? 0
  const cvss = maxCvss ?? 0
  const grade =
    Math.log10(numCves + 1) * 2.5 +
    epss * 3.0 +
    (inCisaKev ? 1.5 : 0) +
    (cvss / 10) * 2.0
  return Math.round(clamp(grade, 0, 10) * 100) / 100
}

export function computeProbability(
  epssScore: number | null,
  numRecentCves: number,
  totalCves: number,
  inCisaKev: boolean,
  recentNewsCount: number,
  exploitInNews: boolean,
  cvssThreshold: number | null,
): number {
  const epss = epssScore ?? 0
  const cveVelocity = clamp(numRecentCves / Math.max(totalCves, 1), 0, 1)
  const kev = inCisaKev ? 0.3 : 0
  const newsBase = clamp(recentNewsCount / 10, 0, 1) * 0.15
  const newsBoost = exploitInNews ? 0.1 : 0
  const newsSignal = clamp(newsBase + newsBoost, 0, 0.25)

  let p = 0.45 * epss + 0.30 * cveVelocity + 0.15 * kev + 0.10 * newsSignal

  if (cvssThreshold != null) {
    const penalty = Math.pow(cvssThreshold / 10, 1.5)
    p = p * (1 - penalty * 0.6)
  }

  return Math.round(clamp(p, 0.001, 0.99) * 10000) / 10000
}

export function computeMultiplier(
  probability: number,
  grade: number,
  purchasePrice: number,
  durationDays = 30,
): number {
  const fairOdds = 1 / probability
  const gradeMult = 1 + (grade / 10) * 4
  const durationMult = Math.sqrt(30 / Math.max(durationDays, 1))
  const payout = Math.max(purchasePrice * fairOdds * gradeMult * durationMult, purchasePrice + 1)
  return Math.round((payout / purchasePrice) * 100) / 100
}

export interface PayoutPoint {
  threshold: number
  multiplier: number
  probability: number
  payout: number
}

export interface DecayPoint {
  day: number           // days elapsed since purchase
  sellValue: number     // schmeckles you'd get if you sell today
  maxPayout: number     // locked-in max payout (flat)
}

/**
 * Sell value: time decay with EPSS-driven floor at expiry.
 *
 * epssDrift = current_epss / opening_epss (1.0 = no change).
 *
 * At expiry the contract auto-sells at its terminal value rather than 0.
 * The floor rises with EPSS drift so a PoC spike late in the contract
 * still returns meaningful value:
 *   floor = clamp((drift - 1) / 4, 0, 0.85)
 *   drift 1.0 → floor 0   (full loss at expiry, baseline behaviour)
 *   drift 2.0 → floor 0.25 (recover 25% of stake)
 *   drift 3.0 → floor 0.50 (recover 50%)
 *   drift 4.0 → floor 0.75 (recover 75%)
 */
export function sellValue(
  purchasePrice: number,
  daysElapsed: number,
  totalDays: number,
  epssDrift = 1.0,
  maxPayout?: number,
): number {
  const daysRemaining = Math.max(totalDays - daysElapsed, 0)
  const drift = Math.max(0.1, Math.min(10.0, epssDrift))
  const exponent = Math.min(0.3 + Math.max(0, totalDays / 7 - 1) * 0.55, 3.0)
  const timeFactor = Math.pow(daysRemaining / totalDays, exponent)
  const floorFrac = drift <= 1 ? 0 : Math.min(0.85, 0.85 * Math.log10(drift))
  const floorValue = Math.round(purchasePrice * floorFrac)
  // Log-linear map to max_payout: 2x→30%, 4x→60%, 10x→100% (matches slider labels)
  const boosted = drift > 1 && maxPayout != null
    ? Math.round(purchasePrice + (maxPayout - purchasePrice) * Math.log10(drift))
    : drift > 1
    ? Math.round(purchasePrice * drift)
    : purchasePrice
  return Math.max(Math.round(floorValue + (boosted - floorValue) * timeFactor), 0)
}

export function buildPayoutCurve(
  epssScore: number | null,
  numCves: number,
  inCisaKev: boolean,
  maxCvss: number | null,
  recentNewsCount: number,
  exploitInNews: boolean,
  purchasePrice: number,
  durationDays = 30,
  steps = 37,
): PayoutPoint[] {
  const grade = computeGrade(numCves, epssScore, inCisaKev, maxCvss)
  return Array.from({ length: steps }, (_, i) => {
    const threshold = 1 + (i / (steps - 1)) * 9
    const prob = computeProbability(epssScore, numCves, Math.max(numCves, 1), inCisaKev, recentNewsCount, exploitInNews, threshold)
    const mult = computeMultiplier(prob, grade, purchasePrice, durationDays)
    return {
      threshold: Math.round(threshold * 4) / 4,
      multiplier: mult,
      probability: prob,
      payout: Math.round(purchasePrice * mult),
    }
  })
}

export function buildDecayCurve(purchasePrice: number, maxPayout: number, durationDays: number, epssDrift = 1.0): DecayPoint[] {
  return Array.from({ length: durationDays + 1 }, (_, day) => ({
    day,
    sellValue: sellValue(purchasePrice, day, durationDays, epssDrift, maxPayout),
    maxPayout,
  }))
}
