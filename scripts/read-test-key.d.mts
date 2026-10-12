// scripts/read-test-key.d.mts
// read-test-key.mjs 的类型声明:tsc -b 会检查 vite.config.ts 对它的 import
// (noImplicitAny),没有此声明会 TS7016。纯类型文件,node 不执行。
export declare const TEST_PRIVATE_KEY_HEX: string
