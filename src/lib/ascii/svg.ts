export interface CharCell {
  char: string
  x: number
  y: number
  size: number
  color: string
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Convert a character matrix to a vector SVG string (character layer only). */
export function matrixToSvg(cells: CharCell[], width: number, height: number, fontFamily: string): string {
  const body = cells
    .map((c) => {
      const fs = c.size.toFixed(2)
      return `  <text x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" font-size="${fs}" font-family="${escapeXml(fontFamily)}" fill="${c.color}">${escapeXml(c.char)}</text>`
    })
    .join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${body}\n</svg>`
}
