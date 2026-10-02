// src/lib/downloadFlow.ts
import { isWeChatUA } from './clientEnv'

/** 下载路径决策:微信内或移动端 svg → 长按保存灯箱;其余走 a[download]。 */
export function planDownload(env: { wechat?: boolean; isSvg: boolean; forceLightbox?: boolean }): 'anchor' | 'lightbox' {
  const wechat = env.wechat ?? isWeChatUA()
  return wechat || env.forceLightbox ? 'lightbox' : 'anchor'
}

/** 触发浏览器下载(非微信路径)。 */
export function anchorDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
