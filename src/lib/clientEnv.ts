// 环境检测纯函数:默认读 navigator.userAgent,可注入便于单测。
export function isWeChatUA(ua: string = navigator.userAgent): boolean {
  return /MicroMessenger/i.test(ua)
}
