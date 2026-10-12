// src/lib/license/testKey.ts
// 测试密钥对:当前镜像后端联调环境的签发钥(2026-10-13 填入)——本地造码与后台
// 签的码同源可互验。⚠️ 页面运行时验签不读本文件,读 verify.ts 硬编码公钥;
// 后台再换钥须两处同步:本文件(私钥+公钥两行)+ verify.ts 公钥。
// 测试私钥唯一源:scripts/ 下三个涉钥脚本统一经 scripts/read-test-key.mjs 读本文件。
export const TEST_PRIVATE_KEY_HEX = 'f14d6f02f8eab066165074fecdec864f64cb5eeb9f363d40f2dfd3fdc0ed906e'
export const TEST_PUBLIC_KEY_HEX = '6bc88195c75c5b4c05a539e340ef29254decdebd8b5772d949fb26ab201dba6f'
