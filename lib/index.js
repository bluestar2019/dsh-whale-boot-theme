/**
 * dsh-whale-boot-theme — 宿主半边。
 *
 * ## 它做什么
 *
 * 把「鲸鱼娘动态视频背景 + 全息风格主题 + 鲸鱼娘开机动画」三件事一次性装到本机：
 *
 *   1. 皮肤   写进 `<DSH_HOME>/skins/<skinId>/`（皮肤中心 1.2+ 的用户皮肤目录），
 *              由 `@linxin666/dsh-client-ui-skin-center` 在界面上列出并应用。
 *   2. 主题   应用「可读性调优」：把作者原版偏透明的那几个 `--dsw-*` token 和背景
 *              遮罩 scrim 调厚一点（可在配置里关掉，见 README「可调项」）。
 *   3. 开机动画 把随包附带的片段放进 `<profile>/data/dsh-boot-animation/videos/`，
 *              由 `@ljwei-stak/dsh-boot-animation` 自动收录。
 *   4. 首屏版式 把我们写的一段附录 CSS（`assets/hero-left.css`）追加到皮肤的
 *              `patches.css` 末尾：输入卡靠左、DeepSeek 金属字标、左边沿 HUD 细目。
 *
 * ## 关于版权：本包**不含**任何第三方美术资源
 *
 * 鲸鱼娘皮肤的 CSS 与动态视频属于原作者（stushansusu，CC BY-NC-SA 4.0），本包
 * 既不内嵌也不修改分发，只在**用户自己的机器上**从原作者仓库下载，并逐字节校验。
 * 因此本包本身是 MIT；下载到本机的那份素材仍然归原作者、仍然受 CC BY-NC-SA 4.0
 * 约束（非商业、署名、同样方式共享）。署名与链接写在 NOTICE 与 README 里。
 *
 * 随包的启动动画片段来自 `@ljwei-stak/dsh-boot-animation`（MIT），按其 LICENSE
 * 中「The three .mp4 files … distributed under the same MIT terms as the code」
 * 的声明再分发，署名见 NOTICE。
 *
 * ## 为什么在启动后延迟执行，而不是 postinstall
 *
 * 插件市场的红线里有「安装即执行代码」。这里只在 DSH 已经起来、用户看得见界面的
 * 时候做一次幂等安装：失败只写日志，绝不阻断启动；下一次启动自动重试。
 *
 * @packageDocumentation
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

/** Cordis 插件名。 */
export const name = 'whale-boot-theme'

/** 本插件不注入任何宿主服务。 */
export const inject = []

/** 启动后等待多久再干活：避开发动机启动的关键路径。 */
const START_DELAY_MS = 2500

/** 上游仓库与固定提交：固定到 commit 才能保证下载内容可复现、可校验。 */
const REPO = 'zhu1090093659/dsh-web'
const DEFAULT_REF = 'de02a7fc92a34ec4e565592e6a2cfa85ecae18b1'

/** 皮肤在仓库里的目录。 */
const SKIN_SUBPATH = 'market/dist/assets/skins/whale-fantasy'

/** 默认皮肤 id（与原作者的 id 保持一致：皮肤的 CSS 是按这个 id 作用域的）。 */
const DEFAULT_SKIN_ID = 'whale-fantasy'

/** 随包附带的开机动画片段（相对包根目录）。 */
const BUNDLED_BOOT_CLIP = 'assets/boot/whale-boot-theme.mp4'

/** 随包附带的「首屏左岸版式」附录（相对包根目录），追加到 patches.css 末尾。 */
const HERO_LEFT_ASSET = 'assets/hero-left.css'

/**
 * 附录的定位标记：`patches.css` 里出现它就算「已装过」。
 *
 * 只认 `HERO-LEFT` 这一小段、不认整行注释：附录的头注释换过两次排版（单行标记
 * 与方框标记），用整行匹配会让老版本装过的机器被再追加一份。
 */
const HERO_LEFT_MARKER = 'HERO-LEFT'

/**
 * 开机动画插件读取自定义片段的目录（相对 profile）。
 *
 * 文件名必须形如 `<小写 uuid>_<显示名>.mp4` —— 插件的 `src/custom-clips.js` 用
 * `/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}_/i` 认这个前缀，`slice(37)` 之后
 * 才是显示名。
 */
const BOOT_CLIP_DIR = path.join('data', 'dsh-boot-animation', 'videos')
const BOOT_CLIP_NAME = '3c1f7b2e-58a4-4d0e-9a41-5b2f6c8d7e10_whale-boot-theme.mp4'

/** 要下载的文件：`min` 是最小合理字节数，`sha256` 有值时逐字节校验。 */
const REMOTE_FILES = [
  { rel: 'skin.json', min: 800 },
  { rel: 'skin.css', min: 4000 },
  { rel: 'patches.css', min: 20000 },
  {
    rel: 'assets/whale-fantasy-loop.mp4',
    min: 5000000,
    sha256: 'db8a022ac3bf877efb764ca4962e79c9b32cc07fa4be2cbc8ac98d4df0310e4d',
    /* 6.6 MB 的大文件：给宽一点的停滞窗口，镜像慢也不至于半途放弃。 */
    stallMs: 90000,
  },
]

/**
 * 「可读性调优」：作者原版把面板底色压得很透（`#05070d1a` ≈ 10% 不透明），
 * 深色视频背景下正文会糊。这几条替换只在本机落盘，属于 CC BY-NC-SA 允许的改编
 * （需标注改动），NOTICE 里已写明。
 */
const TOKEN_PATCHES = [
  ['--dsw-alias-bg-base', '#05070d1a', '#05070d73'],
  ['--dsw-alias-bg-layer-1', '#0a102080', '#0a1020b8'],
  ['--dsw-alias-bg-layer-2', '#1428478f', '#142847bf'],
  ['--dsw-alias-bg-layer-3', '#1830598f', '#183059bf'],
]

/** 背景遮罩：原版整屏几乎无遮罩，这里加一层由浅到深的暗罩。 */
const SCRIM_PATCH = {
  from: 'linear-gradient(180deg, rgba(5,7,13,0) 0%, rgba(5,7,13,0) 86%, rgba(5,7,13,0.16) 96%, rgba(5,7,13,0.22) 100%)',
  to: 'linear-gradient(180deg, rgba(5,7,13,0.34) 0%, rgba(5,7,13,0.38) 86%, rgba(5,7,13,0.44) 96%, rgba(5,7,13,0.50) 100%)',
}

/**
 * 把未知异常转成一行文本。
 *
 * @param error - 任意异常值。
 * @returns 字符串描述。
 */
function describe(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * 输出一条日志：优先走 Cordis logger，退回 console。
 *
 * @param ctx - 宿主上下文（可为 null）。
 * @param level - 'info' | 'warn'。
 * @param message - 日志正文。
 */
function emit(ctx, level, message) {
  try {
    const logger = ctx && typeof ctx.logger === 'function' ? ctx.logger('dsh-whale-boot-theme') : ctx?.logger
    const fn = logger && typeof logger[level] === 'function' ? logger[level].bind(logger) : null
    if (fn) {
      fn(message)
      return
    }
  } catch {
    /* 落到 console */
  }
  try {
    const text = '[dsh-whale-boot-theme] ' + message
    if (level === 'warn') console.warn(text)
    else console.log(text)
  } catch {
    /* 彻底静默 */
  }
}

/**
 * 解析 DSH 家目录与 profile 名（环境变量优先，兼容自定义安装）。
 *
 * @returns {{ home: string, profile: string }}
 */
function resolvePaths() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const profile = process.env.DSH_PROFILE || 'desktop'
  return { home, profile }
}

/**
 * 状态文件路径：纯诊断用途，写不了也不影响功能。
 *
 * @param home - DSH 家目录。
 * @param profile - profile 名。
 * @returns 绝对路径。
 */
function statusFile(home, profile) {
  return path.join(home, 'profiles', profile, '.dsh-whale-boot-theme.json')
}

/**
 * 记一次安装结果，方便排障时直接看现场。
 *
 * @param file - 目标文件。
 * @param payload - 要写入的对象。
 */
function writeStatus(file, payload) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ ...payload, at: new Date().toISOString() }, null, 2))
  } catch {
    /* 诊断文件，失败无所谓 */
  }
}

/**
 * 判断一个文件是否已经「够好」：够大，且（有哈希时）哈希对得上。
 *
 * @param file - 绝对路径。
 * @param spec - `REMOTE_FILES` 里的一项。
 * @returns 是否可跳过下载。
 */
async function isUsable(file, spec) {
  try {
    const stat = await fsp.stat(file)
    if (!stat.isFile() || stat.size < spec.min) return false
    if (!spec.sha256) return true
    const buffer = await fsp.readFile(file)
    return sha256(buffer) === spec.sha256
  } catch {
    return false
  }
}

/**
 * 计算 sha256。
 *
 * @param buffer - 内容。
 * @returns 十六进制小写摘要。
 */
function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * 拼出所有下载地址（jsDelivr 两个入口 + GitHub raw 兜底）。
 *
 * @param ref - 提交号或分支名。
 * @param rel - 皮肤目录内的相对路径。
 * @returns 地址数组，按优先级排序。
 */
function mirrorUrls(ref, rel) {
  const suffix = `${SKIN_SUBPATH}/${rel}`
  return [
    `https://cdn.jsdelivr.net/gh/${REPO}@${ref}/${suffix}`,
    `https://fastly.jsdelivr.net/gh/${REPO}@${ref}/${suffix}`,
    `https://raw.githubusercontent.com/${REPO}/${ref}/${suffix}`,
  ]
}

/**
 * 下载单个文件到目标路径：多镜像重试，完整校验后才原子落盘。
 *
 * @param file - 目标绝对路径。
 * @param spec - `REMOTE_FILES` 里的一项。
 * @param ref - 提交号。
 * @param ctx - 宿主上下文（日志用）。
 * @returns 是否成功。
 */
async function downloadFile(file, spec, ref, ctx) {
  const tmp = file + '.part'
  for (const url of mirrorUrls(ref, spec.rel)) {
    /* 每个镜像各给一份「停滞超时」：大文件慢慢下可以，但不能卡住不动。 */
    const controller = new AbortController()
    let stallTimer = null
    const touch = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = setTimeout(() => controller.abort(), spec.stallMs ?? 30000)
    }
    try {
      touch()
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok || !response.body) {
        emit(ctx, 'warn', `下载 ${spec.rel} 失败 (${response.status}) via ${hostOf(url)}`)
        continue
      }
      await fsp.mkdir(path.dirname(file), { recursive: true })
      const hash = crypto.createHash('sha256')
      const sink = fs.createWriteStream(tmp)
      let received = 0
      for await (const chunk of response.body) {
        touch()
        hash.update(chunk)
        received += chunk.length
        if (!sink.write(chunk)) await new Promise((resolve) => sink.once('drain', resolve))
      }
      await new Promise((resolve, reject) => {
        sink.end(() => resolve(null))
        sink.on('error', reject)
      })
      if (stallTimer) clearTimeout(stallTimer)

      if (received < spec.min) {
        emit(ctx, 'warn', `下载 ${spec.rel} 内容过小 (${received}B) via ${hostOf(url)}`)
        await fsp.rm(tmp, { force: true })
        continue
      }
      if (spec.sha256 && hash.digest('hex') !== spec.sha256) {
        emit(ctx, 'warn', `下载 ${spec.rel} 校验不符 via ${hostOf(url)}`)
        await fsp.rm(tmp, { force: true })
        continue
      }
      await fsp.rename(tmp, file)
      emit(ctx, 'info', `已下载 ${spec.rel} (${(received / 1048576).toFixed(2)} MB) via ${hostOf(url)}`)
      return true
    } catch (error) {
      if (stallTimer) clearTimeout(stallTimer)
      emit(ctx, 'warn', `下载 ${spec.rel} 异常 via ${hostOf(url)}: ${describe(error)}`)
      try {
        await fsp.rm(tmp, { force: true })
      } catch {
        /* ignore */
      }
    }
  }
  return false
}

/**
 * 从 URL 里取主机名，日志里好看一点。
 *
 * @param url - 完整地址。
 * @returns 主机名。
 */
function hostOf(url) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * 应用「可读性调优」：token 替换 + scrim 加深。幂等。
 *
 * @param skinDir - 皮肤目录。
 * @param ctx - 宿主上下文。
 * @returns 是否改动过文件。
 */
async function tuneReadability(skinDir, ctx) {
  let changed = false

  const cssFile = path.join(skinDir, 'skin.css')
  try {
    const original = await fsp.readFile(cssFile, 'utf8')
    let next = original
    for (const [, from, to] of TOKEN_PATCHES) next = next.split(from).join(to)
    if (next !== original) {
      await fsp.writeFile(cssFile, next)
      changed = true
      emit(ctx, 'info', '已应用主题可读性调优 (skin.css)')
    }
  } catch (error) {
    emit(ctx, 'warn', '皮肤 token 调优跳过: ' + describe(error))
  }

  const manifest = path.join(skinDir, 'skin.json')
  try {
    const raw = await fsp.readFile(manifest, 'utf8')
    const parsed = JSON.parse(raw)
    const media = parsed?.contributes?.backgroundMedia
    let touched = false
    for (const key of ['dark', 'light']) {
      const entry = media?.[key]
      if (entry && entry.scrim === SCRIM_PATCH.from) {
        entry.scrim = SCRIM_PATCH.to
        touched = true
      }
    }
    if (touched) {
      await fsp.writeFile(manifest, JSON.stringify(parsed, null, 2) + '\n')
      changed = true
      emit(ctx, 'info', '已加深背景遮罩 (skin.json)')
    }
  } catch (error) {
    emit(ctx, 'warn', '皮肤遮罩调优跳过: ' + describe(error))
  }

  return changed
}

/**
 * 写皮肤激活状态：只在「还没有人选过」时写，绝不覆盖用户已经选定的皮肤。
 *
 * @param home - DSH 家目录。
 * @param skinId - 皮肤 id。
 * @param ctx - 宿主上下文。
 * @returns 是否写入。
 */
async function activateSkin(home, skinId, ctx) {
  const file = path.join(home, 'skin-center-active.json')
  try {
    let state = {}
    try {
      state = JSON.parse(await fsp.readFile(file, 'utf8'))
    } catch {
      state = {}
    }
    const current = typeof state?.active === 'string' ? state.active.trim() : ''
    if (current && current !== 'blue-fantasy') {
      emit(ctx, 'info', `皮肤中心已有选择 (${current})，保持不动`)
      return false
    }
    await fsp.mkdir(path.dirname(file), { recursive: true })
    await fsp.writeFile(file, JSON.stringify({ ...state, active: skinId, initialized: true }, null, 2) + '\n')
    emit(ctx, 'info', `已把皮肤中心激活到 ${skinId}`)
    return true
  } catch (error) {
    emit(ctx, 'warn', '写皮肤激活状态失败: ' + describe(error))
    return false
  }
}

/**
 * 安装开机动画片段：只在开机动画插件已经装好时动手。
 *
 * 不会碰用户的 `disabledClips` 配置 —— 那属于另一个插件的设置，越权改它不礼貌。
 * README 里写清了「放好之后在设置里勾一下」这一步。
 *
 * @param home - DSH 家目录。
 * @param profile - profile 名。
 * @param packageRoot - 本包根目录。
 * @param ctx - 宿主上下文。
 * @returns 'installed' | 'skipped' | 'missing-source'
 */
async function installBootClip(home, profile, packageRoot, ctx) {
  const target = path.join(home, 'profiles', profile, BOOT_CLIP_DIR, BOOT_CLIP_NAME)
  const source = path.join(packageRoot, BUNDLED_BOOT_CLIP)
  try {
    const pluginDir = path.join(home, 'profiles', profile, 'node_modules', '@ljwei-stak', 'dsh-boot-animation')
    if (!fs.existsSync(pluginDir)) {
      emit(ctx, 'info', '未安装 @ljwei-stak/dsh-boot-animation，跳过开机片段')
      return 'skipped'
    }
    if (!fs.existsSync(source)) {
      emit(ctx, 'warn', '随包的开机片段缺失: ' + BUNDLED_BOOT_CLIP)
      return 'missing-source'
    }
    let same = false
    try {
      const [a, b] = await Promise.all([fsp.stat(source), fsp.stat(target)])
      same = a.size === b.size
    } catch {
      same = false
    }
    if (!same) {
      await fsp.mkdir(path.dirname(target), { recursive: true })
      await fsp.copyFile(source, target)
      emit(ctx, 'info', '已安装开机动画片段')
    }
    return 'installed'
  } catch (error) {
    emit(ctx, 'warn', '安装开机片段失败: ' + describe(error))
    return 'skipped'
  }
}

/**
 * 装「首屏左岸版式」：把随包的 CSS 附录追加到皮肤 patches.css 末尾。幂等、可升级。
 *
 * 为什么是追加而不是改下载源：作者原版的 patches.css 是 CC BY-NC-SA 的改编对象，
 * 我们只**追加**自己写的一段（且能整段删除），原作者的字节一个不动；换皮肤中心
 * 重新下载 patches.css 时这段会被覆盖掉，下次启动再补回来。
 *
 * 为什么先截断再写：附录永远在文件末尾，所以「找到标记 → 从该注释的 `/*` 处截断
 * → 重新追加」是一条可重复的更新路径 —— 包升级后新版本会自动替换旧版附录，而不是
 * 叠第二份。找不到标记就说明是干净的原版文件，直接追加。
 *
 * @param skinDir - 皮肤目录。
 * @param packageRoot - 本包根目录。
 * @param ctx - 宿主上下文。
 * @returns 'applied' | 'updated' | 'unchanged' | 'missing-target' | 'skipped'
 */
async function ensureHeroLeft(skinDir, packageRoot, ctx) {
  const source = path.join(packageRoot, HERO_LEFT_ASSET)
  const target = path.join(skinDir, 'patches.css')
  try {
    if (!fs.existsSync(target)) {
      emit(ctx, 'info', 'patches.css 还没就绪，首屏版式下次启动再装')
      return 'missing-target'
    }
    const appendix = (await fsp.readFile(source, 'utf8')).trimEnd() + '\n'
    const original = await fsp.readFile(target, 'utf8')

    let start = -1
    const at = original.indexOf(HERO_LEFT_MARKER)
    if (at >= 0) {
      const open = original.lastIndexOf('/*', at)
      start = open >= 0 ? open : at
    }

    const base = start >= 0 ? original.slice(0, start) : original
    const head = start >= 0 ? base : base.replace(/\s+$/, '\n') + '\n'
    const next = head + appendix
    if (next === original) return 'unchanged'

    await fsp.writeFile(target, next)
    emit(ctx, 'info', start >= 0 ? '已更新首屏「左岸」版式 (patches.css)' : '已应用首屏「左岸」版式 (patches.css)')
    return start >= 0 ? 'updated' : 'applied'
  } catch (error) {
    emit(ctx, 'warn', '首屏版式安装跳过: ' + describe(error))
    return 'skipped'
  }
}

/**
 * 主流程：同步皮肤文件 → 调优 → 激活 → 装开机片段。
 *
 * @param ctx - 宿主上下文。
 * @param options - 规整后的配置。
 * @returns 结果摘要。
 */
export async function runOnce(ctx, options) {
  const { home, profile } = resolvePaths()
  const status = statusFile(home, profile)
  const skinDir = path.join(home, 'skins', options.skinId)
  const summary = { ok: true, skinDir, downloaded: [], missing: [], bootClip: 'skipped', activated: false }

  /* 1. 皮肤文件：缺什么下什么，齐全就完全不动网络。 */
  if (options.downloadAssets) {
    for (const spec of REMOTE_FILES) {
      const file = path.join(skinDir, spec.rel)
      if (await isUsable(file, spec)) continue
      const ok = await downloadFile(file, spec, options.ref, ctx)
      if (ok) summary.downloaded.push(spec.rel)
      else {
        summary.missing.push(spec.rel)
        summary.ok = false
      }
    }
  }

  /* 2. 可读性调优：本地改编，幂等。 */
  if (options.tuneReadability) {
    try {
      await tuneReadability(skinDir, ctx)
    } catch (error) {
      emit(ctx, 'warn', '调优流程异常: ' + describe(error))
    }
  }

  /* 2.5 首屏左岸版式：追加我们自己的 CSS 附录。 */
  if (options.heroLayout) {
    summary.heroLayout = await ensureHeroLeft(skinDir, options.packageRoot, ctx)
  }

  /* 3. 激活皮肤（只在用户还没选过时）。 */
  if (options.activateSkin) {
    summary.activated = await activateSkin(home, options.skinId, ctx)
  }

  /* 4. 开机动画片段。 */
  if (options.installBootClip) {
    summary.bootClip = await installBootClip(home, profile, options.packageRoot, ctx)
  }

  writeStatus(status, summary)
  return summary
}

/**
 * 规整配置：缺省值 + 类型兜底。
 *
 * @param config - patch 层传来的原始配置。
 * @param packageRoot - 本包根目录。
 * @returns 完整配置。
 */
function normalize(config, packageRoot) {
  const src = config && typeof config === 'object' ? config : {}
  const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback)
  return {
    packageRoot,
    skinId: typeof src.skinId === 'string' && src.skinId.trim() ? src.skinId.trim() : DEFAULT_SKIN_ID,
    ref: typeof src.ref === 'string' && /^[0-9a-f]{40}$/i.test(src.ref.trim()) ? src.ref.trim() : DEFAULT_REF,
    downloadAssets: bool(src.downloadAssets, true),
    tuneReadability: bool(src.tuneReadability, true),
    heroLayout: bool(src.heroLayout, true),
    activateSkin: bool(src.activateSkin, true),
    installBootClip: bool(src.installBootClip, true),
  }
}

/**
 * Cordis 入口。
 *
 * @param ctx - 宿主上下文。
 * @param config - 可选配置（见 README「可调项」）。
 */
export function apply(ctx, config) {
  const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const options = normalize(config, packageRoot)

  try {
    ctx.effect(() => {
      const timer = setTimeout(() => {
        void runOnce(ctx, options).catch((error) => {
          emit(ctx, 'warn', '安装流程异常: ' + describe(error))
        })
      }, START_DELAY_MS)
      if (typeof timer.unref === 'function') timer.unref()
      return () => clearTimeout(timer)
    })
  } catch (error) {
    emit(ctx, 'warn', '注册启动任务失败: ' + describe(error))
  }
}

export default apply
