/** 把手松手时的吸附决策。offsetPx=松手时顶边距视口底部(即当前高度);
 *  velocityPxPerSec 下正值(<0=向上抛)。阈值:下移速度>800 或高度跌破
 *  closeThresholdPx 判 close;上抛速度<-600 判 full;否则取最近档。
 *  (brief 原稿为 offsetPx > closeThresholdPx,与其用例 settleSnap(80,…,80)
 *  期望 close 矛盾——80>80 为假;按高度轴语义改为 <=,五条用例全绿。) */
export function settleSnap(
  offsetPx: number,
  velocityPxPerSec: number,
  peekPx: number,
  fullPx: number,
  closeThresholdPx: number,
): 'peek' | 'full' | 'close' {
  if (velocityPxPerSec > 800 || offsetPx <= closeThresholdPx) return 'close'
  if (velocityPxPerSec < -600) return 'full'
  const dPeek = Math.abs(offsetPx - peekPx)
  const dFull = Math.abs(offsetPx - fullPx)
  return dPeek <= dFull ? 'peek' : 'full'
}
