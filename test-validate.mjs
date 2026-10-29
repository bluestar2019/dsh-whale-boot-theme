/**
 * 用**真实的**皮肤中心校验器验证干跑产物能不能被加载。
 *
 * 这一步比自检更有意义：皮肤中心是 fail-closed 的，任何未知字段或非法路径都会
 * 让整张皮肤被静默丢弃，光看文件在不在是发现不了的。
 *
 *   node test-validate.mjs [DSH_HOME]
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const home = process.argv[2] || path.join(os.tmpdir(), 'dsh-wbt-validate-' + Date.now())
process.env.DSH_HOME = home
process.env.DSH_PROFILE = 'desktop'
fs.mkdirSync(path.join(home, 'profiles', 'desktop', 'node_modules', '@ljwei-stak', 'dsh-boot-animation'), { recursive: true })

const ctx = { logger: { info: () => {}, warn: (m) => console.log('  ! ' + m) } }
const mod = await import(pathToFileURL(path.join(here, 'lib', 'index.js')).href)
const summary = await mod.runOnce(ctx, {
  packageRoot: here,
  skinId: 'whale-fantasy',
  ref: 'de02a7fc92a34ec4e565592e6a2cfa85ecae18b1',
  downloadAssets: true,
  tuneReadability: true,
  activateSkin: true,
  installBootClip: false,
})
console.log('安装 ok =', summary.ok, '| 缺失 =', summary.missing.join(',') || '无')

const centerEntry = process.env.DSH_SKIN_CENTER
  || path.join(os.homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', '@linxin666', 'dsh-client-ui-skin-center', 'lib', 'index.js')
const center = await import(pathToFileURL(centerEntry).href)
console.log('皮肤中心导出:', ['validateSkinManifestV2', 'transformSkinCss', 'resolveInsideSkin'].filter((k) => typeof center[k] === 'function').join(', '))

const skinDir = path.join(home, 'skins', 'whale-fantasy')
const manifest = JSON.parse(fs.readFileSync(path.join(skinDir, 'skin.json'), 'utf8'))
const verdict = center.validateSkinManifestV2(manifest, { dir: skinDir })
console.log('\nvalidateSkinManifestV2 =', JSON.stringify(verdict))

for (const file of ['skin.css', 'patches.css']) {
  const css = fs.readFileSync(path.join(skinDir, file), 'utf8')
  try {
    const out = await center.transformSkinCss(css, { skinId: 'whale-fantasy', filename: file })
    const text = typeof out === 'string' ? out : out?.css || ''
    console.log(`${file}: transform ok, ${text.length} bytes, warnings=${JSON.stringify((out && out.warnings) || [])}`)
  } catch (error) {
    console.log(`${file}: transform FAILED -> ${error && error.message}`)
  }
}

const good = verdict && verdict.ok === true && (verdict.errors || []).length === 0
console.log(good ? '\n皮肤可被皮肤中心加载 ✅' : '\n皮肤会被拒载 ❌')
process.exit(good ? 0 : 1)
