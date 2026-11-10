// CSV export: RFC 4180 quoting, downloaded as a Blob. Numbers stay raw (no thousands separators) so spreadsheets
// read them as numbers.

export type CsvCell = string | number | boolean | null | undefined
export interface CsvTable {
  header: string[]
  rows: CsvCell[][]
}

function cell(v: CsvCell): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v)
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv({ header, rows }: CsvTable): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

/** "Iron ore: produced per month" -> "iron-ore-produced-per-month". */
export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'export'
  )
}

/** Downloads the table as `coi-<name>.csv` (the name is slugged). */
export function downloadCsv(name: string, table: CsvTable) {
  // A BOM makes Excel read UTF-8 names correctly.
  const blob = new Blob(['﻿' + toCsv(table)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `coi-${slug(name)}.csv`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
