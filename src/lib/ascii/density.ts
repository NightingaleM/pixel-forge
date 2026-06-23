export interface MeasuredChar {
  char: string
  fillRate: number
}

/** Count the fraction of pixels whose alpha exceeds the threshold. */
export function computeFillRate(pixels: Uint8ClampedArray, alphaThreshold = 128): number {
  if (pixels.length === 0) return 0
  let filled = 0
  let total = 0
  for (let i = 3; i < pixels.length; i += 4) {
    total++
    if (pixels[i] > alphaThreshold) filled++
  }
  return total === 0 ? 0 : filled / total
}

/** Sort measured chars by fillRate ascending into a ramp (sparse -> dense). */
export function sortToRamp(measured: MeasuredChar[]): string[] {
  return [...measured]
    .sort((a, b) => a.fillRate - b.fillRate)
    .map((m) => m.char)
}

/** Map luminance [0,1] to a ramp index. Bright -> 0 (sparsest), dark -> last (densest). */
export function luminanceToIndex(luminance: number, rampLength: number): number {
  if (rampLength <= 1) return 0
  const clamped = Math.min(1, Math.max(0, luminance))
  const idx = Math.round((1 - clamped) * (rampLength - 1))
  return Math.min(rampLength - 1, Math.max(0, idx))
}
