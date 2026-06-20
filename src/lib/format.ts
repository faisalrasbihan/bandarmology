// Compact USD formatting for relationship exposure figures.
export function formatMoney(usd: number): string {
  const abs = Math.abs(usd)
  if (abs >= 1e9) return `$${(usd / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${Math.round(usd / 1e3)}K`
  return `$${Math.round(usd)}`
}

// Nominal exposure weighted by the current risk score — the monetary
// "importance" of a client when size and risk are combined.
export function exposureAtRisk(exposureUsd: number, riskScore: number): number {
  return exposureUsd * (riskScore / 100)
}
