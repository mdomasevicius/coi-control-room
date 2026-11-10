const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const full = new Intl.NumberFormat('en')

/** 1234 -> "1,234", 1234567 -> "1.2M". */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '–'
  return Math.abs(n) >= 100_000 ? compact.format(n) : full.format(n)
}

export function formatSigned(n: number): string {
  return (n > 0 ? '+' : '') + formatNumber(n)
}
