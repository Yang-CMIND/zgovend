/**
 * CSV download & print utilities for list pages
 */

export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const bom = '\uFEFF' // UTF-8 BOM for Excel
  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => {
      const s = String(cell ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"'
        : s
    }).join(','))
  ].join('\n')

  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function printPage() {
  window.print()
}
