/**
 * 真·入口测试：像 cordis 那样调用 apply()，看它会不会在 START_DELAY_MS 之后自己跑起来。
 * 干跑测的是 runOnce，这个测的是「装成插件之后到底会不会执行」。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const home = path.join(os.tmpdir(), 'dsh-wbt-apply-' + Date.now())
process.env.DSH_HOME = home
process.env.DSH_PROFILE = 'desktop'
fs.mkdirSync(path.join(home, 'profiles', 'desktop', 'node_modules', '@ljwei-stak', 'dsh-boot-animation'), { recursive: true })

const mod = await import(pathToFileURL(path.join(here, 'lib', 'index.js')).href)

const disposers = []
const ctx = {
  logger: {
    info: (m) => console.log('  · ' + m),
    warn: (m) => console.log('  ! ' + m),
  },
  effect(fn) {
    const dispose = fn()
    if (typeof dispose === 'function') disposers.push(dispose)
  },
}

console.log('name =', mod.name, '| inject =', JSON.stringify(mod.inject))
console.log('DSH_HOME =', home)
console.log('调用 apply()，等 START_DELAY_MS 之后自动执行…')

mod.apply(ctx, { downloadAssets: true, ref: 'de02a7fc92a34ec4e565592e6a2cfa85ecae18b1' })

await new Promise((resolve) => setTimeout(resolve, 60000))

const statusPath = path.join(home, 'profiles', 'desktop', '.dsh-whale-boot-theme.json')
const exists = fs.existsSync(statusPath)
console.log('\nstatus 文件存在 =', exists)
if (exists) console.log(JSON.stringify(JSON.parse(fs.readFileSync(statusPath, 'utf8')), null, 2))

for (const dispose of disposers) dispose()
process.exit(exists ? 0 : 1)
