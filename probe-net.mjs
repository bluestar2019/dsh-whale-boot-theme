/**
 * GitHub / npm 连通性探测：逐个 URL 计时，报告状态码与耗时。
 * 顺便测一下 DNS 与 TLS，区分「DNS 不通」「TLS 握手失败」「连上但超时」。
 */

import dns from 'node:dns/promises'
import https from 'node:https'

const targets = [
  ['github.com', 'https://github.com/'],
  ['api.github.com', 'https://api.github.com/zen'],
  ['raw.githubusercontent.com', 'https://raw.githubusercontent.com/zhu1090093659/dsh-web/main/README.md'],
  ['codeload.github.com', 'https://codeload.github.com/zhu1090093659/dsh-web/tar.gz/refs/heads/main'],
  ['objects.githubusercontent.com', 'https://objects.githubusercontent.com/'],
  ['gitee.com', 'https://gitee.com/'],
  ['npm registry', 'https://registry.npmjs.org/-/ping'],
  ['npmjs.com', 'https://www.npmjs.com/'],
]

const hostOf = (url) => new URL(url).hostname

async function probeDns(host) {
  const started = Date.now()
  try {
    const addrs = await dns.lookup(host, { all: true })
    return { ok: true, ms: Date.now() - started, addrs: addrs.map((a) => a.address).join(',') }
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: String(error.code || error.message) }
  }
}

/* 只要响应头，不读 body：能连上就够判断了。 */
function probeHttps(url, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const started = Date.now()
    const req = https.request(url, { method: 'GET', timeout: timeoutMs }, (res) => {
      resolve({ ok: true, status: res.statusCode, ms: Date.now() - started })
      res.destroy()
    })
    req.on('timeout', () => {
      resolve({ ok: false, error: 'TIMEOUT ' + timeoutMs + 'ms', ms: Date.now() - started })
      req.destroy()
    })
    req.on('error', (error) => {
      resolve({ ok: false, error: String(error.code || error.message), ms: Date.now() - started })
    })
    req.end()
  })
}

console.log('DNS 解析：')
for (const [label, url] of targets) {
  const host = hostOf(url)
  const r = await probeDns(host)
  console.log(`  ${r.ok ? 'OK  ' : 'FAIL'} ${host.padEnd(32)} ${r.ms}ms  ${r.ok ? r.addrs : r.error}`)
}

console.log('\nHTTPS（只取响应头）：')
for (const [label, url] of targets) {
  const r = await probeHttps(url)
  console.log(`  ${r.ok ? 'OK  ' : 'FAIL'} ${label.padEnd(32)} ${r.ms}ms  ${r.ok ? 'HTTP ' + r.status : r.error}`)
}
