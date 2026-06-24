import { computeFillRate, sortToRamp, luminanceToIndex, type MeasuredChar } from './ascii/density'
import { cellAverageLuminance, cellContrast, shouldSkipCell, type CellRect } from './ascii/image'
import { matrixToSvg, type CharCell } from './ascii/svg'

export interface AsciiRenderParams {
  charset: string
  caseMode: number       // 0 keep / 1 upper / 2 lower
  charColor: string      // hex like '#00ff66'
  showBg: number         // 0 / 1
  charScale: number
  cellSize: number
  randomScale: number
  bgFilter: number
}

const MAX_PROCESS_SIZE = 1280
const SYSTEM_FONT = 'monospace'

export class AsciiCanvasRenderer {
  private lastMatrix: CharCell[] = []
  private lastWidth = 0
  private lastHeight = 0
  private rampCacheKey = ''
  private ramp: string[] = []

  /** Measure every char's fill rate and build a density ramp (cached). */
  private buildRamp(
    ctx: CanvasRenderingContext2D,
    charset: string,
    fontSize: number,
    font: string,
  ): string[] {
    const key = `${charset}|${fontSize}|${font}`
    if (this.rampCacheKey === key && this.ramp.length > 0) return this.ramp

    const cell = fontSize * 2
    ctx.font = `${fontSize}px ${font}`
    ctx.textBaseline = 'top'
    const measured: MeasuredChar[] = []
    for (const ch of charset) {
      ctx.clearRect(0, 0, cell, cell)
      ctx.fillStyle = '#fff'
      ctx.fillText(ch, 0, 0)
      const data = ctx.getImageData(0, 0, cell, cell).data
      measured.push({ char: ch, fillRate: computeFillRate(data) })
    }
    this.ramp = sortToRamp(measured)
    this.rampCacheKey = key
    return this.ramp
  }

  private applyCase(charset: string, mode: number): string {
    if (mode === 1) return charset.toUpperCase()
    if (mode === 2) return charset.toLowerCase()
    return charset
  }

  render(
    canvas: HTMLCanvasElement,
    image: HTMLImageElement,
    params: AsciiRenderParams,
    fontFace: FontFace | null,
  ): void {
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      console.warn('[ASCII] render: getContext("2d") returned null — canvas is likely already locked to a WebGL context')
      return
    }

    // Limit processing resolution to MAX_PROCESS_SIZE on the long edge.
    const scale = Math.min(1, MAX_PROCESS_SIZE / Math.max(image.naturalWidth, image.naturalHeight))
    const w = Math.max(1, Math.round(image.naturalWidth * scale))
    const h = Math.max(1, Math.round(image.naturalHeight * scale))
    canvas.width = w
    canvas.height = h

    // Off-screen pixel read.
    const off = document.createElement('canvas')
    off.width = w
    off.height = h
    const offCtx = off.getContext('2d')!
    offCtx.drawImage(image, 0, 0, w, h)
    const imgData = offCtx.getImageData(0, 0, w, h).data

    const font = fontFace ? `"${fontFace.family}"` : SYSTEM_FONT
    const charset = this.applyCase(params.charset, params.caseMode)
    const fontSize = Math.max(4, Math.round(params.cellSize))
    const ramp = this.buildRamp(ctx, charset, fontSize, font)
    if (ramp.length === 0) {
      console.warn('[ASCII] render: empty density ramp (charset has no measurable characters)')
      return
    }

    ctx.clearRect(0, 0, w, h)
    if (params.showBg === 1) ctx.drawImage(image, 0, 0, w, h)

    ctx.textBaseline = 'top'
    ctx.fillStyle = params.charColor

    const cells: CharCell[] = []
    for (let y = 0; y < h; y += fontSize) {
      for (let x = 0; x < w; x += fontSize) {
        const cell: CellRect = {
          x,
          y,
          w: Math.min(fontSize, w - x),
          h: Math.min(fontSize, h - y),
        }
        const lum = cellAverageLuminance(imgData, w, cell)
        const contrast = cellContrast(imgData, w, cell)
        if (shouldSkipCell(contrast, params.bgFilter)) continue
        const idx = luminanceToIndex(lum, ramp.length)
        const ch = ramp[idx]
        if (!ch) continue
        const delta = params.randomScale * (Math.random() * 2 - 1)
        const size = fontSize * params.charScale * (1 + delta)
        ctx.font = `${size.toFixed(2)}px ${font}`
        ctx.fillText(ch, x, y)
        cells.push({ char: ch, x, y, size, color: params.charColor })
      }
    }

    this.lastMatrix = cells
    this.lastWidth = w
    this.lastHeight = h
  }

  exportSvg(fontFamily: string): string {
    return matrixToSvg(this.lastMatrix, this.lastWidth, this.lastHeight, fontFamily)
  }
}
