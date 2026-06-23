export interface CellRect {
  x: number
  y: number
  w: number
  h: number
}

/** Rec. 709 luminance, 0-255. */
export function rgbaToLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Average normalized luminance [0,1] over a cell region. */
export function cellAverageLuminance(pixels: Uint8ClampedArray, imgW: number, cell: CellRect): number {
  let sum = 0
  let count = 0
  for (let y = cell.y; y < cell.y + cell.h; y++) {
    for (let x = cell.x; x < cell.x + cell.w; x++) {
      const i = (y * imgW + x) * 4
      sum += rgbaToLuminance(pixels[i], pixels[i + 1], pixels[i + 2])
      count++
    }
  }
  return count === 0 ? 0 : sum / count / 255
}

/** Local contrast [0,1] = standard deviation of normalized luminance over a cell. */
export function cellContrast(pixels: Uint8ClampedArray, imgW: number, cell: CellRect): number {
  const lums: number[] = []
  for (let y = cell.y; y < cell.y + cell.h; y++) {
    for (let x = cell.x; x < cell.x + cell.w; x++) {
      const i = (y * imgW + x) * 4
      lums.push(rgbaToLuminance(pixels[i], pixels[i + 1], pixels[i + 2]) / 255)
    }
  }
  if (lums.length === 0) return 0
  const mean = lums.reduce((a, b) => a + b, 0) / lums.length
  const variance = lums.reduce((a, b) => a + (b - mean) ** 2, 0) / lums.length
  return Math.sqrt(variance)
}

/** Skip flat/low-contrast cells (background filtering). */
export function shouldSkipCell(contrast: number, threshold: number): boolean {
  return contrast < threshold
}
