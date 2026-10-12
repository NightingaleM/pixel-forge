/// <reference types="vite/client" />

// license 验签公钥:vite.config.ts define 按 mode 注入(dev/test=联调钥派生,build=生产钥)
declare const __LICENSE_PUBKEY__: string

declare module '*.vert?raw' {
  const value: string
  export default value
}
declare module '*.frag?raw' {
  const value: string
  export default value
}

declare module '*.vert.chunk?raw' {
  const value: string
  export default value
}

declare module '*.frag.chunk?raw' {
  const value: string
  export default value
}
