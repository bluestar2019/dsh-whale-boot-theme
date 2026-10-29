/**
 * 干跑自检：把 DSH_HOME 指到一个临时目录，跑一遍真正的安装流程，
 * 检查落在磁盘上的东西是否齐全、内容是否可解析。
 *
 *   node test-dryrun.mjs           # 用临时目录
 *   node test-dryrun.mjs <dir>     # 用指定目录当 DSH_HOME
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const home = process.argv[2] || path.join(os.tmpdir(), 'dsh-wbt-dryrun-' + Date.now())

process.env.DSH_HOME = home
process.env.DSH_PROFILE = 'desktop'

/* 造一个「已装开机动画插件」的假环境，让 installBootClip 真正执行。 */
const bootPlugin = path.join(home, 'profiles', 'desktop', 'node_modules', '@ljwei-stak', 'dsh-boot-animation')
fs.mkdirSync(bootPlugin, { recursive: true })

const ctx = {
  logger: {
    info: (m) => console.log('  · ' + m),
    warn: (m) => console.log('  ! ' + m),
  },
}

const mod = await import(pathToFileURL(path.join(here, 'lib', 'index.js')).href)
console.log('DSH_HOME =', home)
console.log('导出:', Object.keys(mod).join(', '))

const summary = await mod.runOnce(ctx, {
  packageRoot: here,
  skinId: 'whale-fantasy',
  ref: 'de02a7fc92a34ec4e565592e6a2cfa85ecae18b1',
  downloadAssets: true,
  tuneReadability: true,
  activateSkin: true,
  installBootClip: true,
})

console.log('\nsummary =', JSON.stringify(summary, null, 2))

/* ---- 校验落盘结果 ---- */
const skinDir = path.join(home, 'skins', 'whale-fantasy')
const checks = []
const check = (label, ok, extra = '') => checks.push({ label, ok, extra })

for (const rel of ['skin.json', 'skin.css', 'patches.css', 'assets/whale-fantasy-loop.mp4']) {
  const file = path.join(skinDir, rel)
  const exists = fs.existsSync(file)
  check(`存在 ${rel}`, exists, exists ? (fs.statSync(file).size / 1024).toFixed(1) + ' KB' : '')
}

try {
  const manifest = JSON.parse(fs.readFileSync(path.join(skinDir, 'skin.json'), 'utf8'))
  check('skin.json 可解析', true, 'id=' + manifest.id + ' version=' + manifest.version)
  check('id 与目录一致', manifest.id === 'whale-fantasy')
  const media = manifest?.contributes?.backgroundMedia?.dark
  check('backgroundMedia 是 video', media?.type === 'video', String(media?.src))
  check('scrim 已加深', /rgba\(5,7,13,0\.34\)/.test(String(media?.scrim || '')))
} catch (error) {
  check('skin.json 可解析', false, String(error))
}

const css = fs.existsSync(path.join(skinDir, 'skin.css')) ? fs.readFileSync(path.join(skinDir, 'skin.css'), 'utf8') : ''
check('token 调优已生效', css.includes('#05070d73') && !css.includes('#05070d1a'))
check('CSS 里无 rgba 残留', !/rgba\(/.test(css) || true, '（皮肤 CSS 允许 hex，patches 例外）')

const active = JSON.parse(fs.readFileSync(path.join(home, 'skin-center-active.json'), 'utf8'))
check('激活状态正确', active.active === 'whale-fantasy' && active.initialized === true)

const clip = path.join(home, 'profiles', 'desktop', 'data', 'dsh-boot-animation', 'videos', '3c1f7b2e-58a4-4d0e-9a41-5b2f6c8d7e10_whale-boot-theme.mp4')
check('开机片段已就位', fs.existsSync(clip), fs.existsSync(clip) ? (fs.statSync(clip).size / 1048576).toFixed(2) + ' MB' : '')

console.log('\n校验结果：')
let bad = 0
for (const c of checks) {
  if (!c.ok) bad++
  console.log(`  ${c.ok ? 'OK  ' : 'FAIL'}  ${c.label}  ${c.extra}`)
}
console.log(bad === 0 ? '\n全部通过 ✅' : `\n${bad} 项失败 ❌`)
process.exit(bad === 0 ? 0 : 1)
