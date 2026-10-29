# 发布通道诊断与操作步骤

> 2026-10-29 11:30 实测于本机（DSH 桌面端所在的这台 Windows）。

## 进展（11:45 更新）

- ✅ **Gitee 已经通了**：`ssh -T git@gitee.com` 回 `Hi 海洋之星(@maisutong)!`，仓库
  <https://gitee.com/maisutong/dsh-whale-boot-theme-0.1.0> 已推上去（`main` = `a7cf076`），
  网页 200、README 正常、raw 文件可取。
- ⚠️ 顺带发现这台机器的 git HTTPS 是坏的：默认 schannel 后端报
  `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`，加
  `-c http.sslBackend=openssl` 才正常。这也会连带影响 `pnpm` /`dsh plugin add git+https://…`。
- ⏳ GitHub 仍然打不开：需要手机上做「加公钥 + 建空仓」两件事，之后我这边一条命令推镜像。

## 一、这台机器到底能不能连 GitHub

| 目标 | 结果 | 说明 |
| --- | --- | --- |
| `github.com` 网页（含 `/login`、`/password_reset`） | ❌ 超时，两次各 21000ms | 网页端完全不可用，改密码、加 SSH key、建仓库都做不了 |
| `api.github.com` | ✅ HTTP 200，限流剩余 58 | 有 token 就能全自动操作 |
| `github.com:22`（SSH） | ✅ 能握手到认证阶段 | 网络通，但钥匙没被账号承认 |
| `ssh.github.com:443`（SSH over 443） | ✅ 同上 | 备用端口也通 |
| `raw.githubusercontent.com` / `codeload.github.com` | ✅ 200 | 下载素材没问题 |
| `gitee.com` | ✅ 200，333ms | 国内站直连 |
| `registry.npmjs.org` | ✅ 200，3.9s | 发包通道通 |
| `www.npmjs.com`（网页） | ⚠️ 403（程序抓取被 Cloudflare 挡，浏览器可能正常） | 未验证 |

账号 `bluestar2019`（id 32409000）确实存在，但 `/users/bluestar2019/keys` 返回 `[]` ——
**这个账号一把 SSH 公钥都没有**，所以本机这把钥匙被拒（`Permission denied (publickey)`）。

## 二、为什么"只靠 SSH"走不通

SSH 只是运 git 数据的管子，它解决不了这三件事：

1. **把公钥登记到账号** —— 只能在网页 Settings → SSH keys 做，或调 API（要 token）。
2. **创建仓库** —— GitHub 不支持"首次 push 自动建仓"（那是 GitLab 的行为），必须网页或 API。
3. **拿到 token** —— token 的签发页在网页上。

三件事都指向 `github.com` 网页，而它在这台机器上是超时的。所以必须先有一次
"从别的地方打开 GitHub"的动作，做完之后剩下的我都能在这台机器上完成。

## 三、用手机打通（5 分钟，之后全自动）

手机流量访问 GitHub 通常没问题。只需要在手机上做两件事：

### 1. 加公钥

手机浏览器打开 <https://github.com/settings/keys> → **New SSH key** →
Title 随便填 `DSH-Windows`，Key 里粘贴下面这一整行：

```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCgkR8LIX3Ualp9njpbJLCrqIaV8NkbWKAu978Gsc1ijSJxQPiyjgqE3L9dlIToxu9kDEg4TeEJh33ul3Rq9bslqYSHhWovb0bCOMjmVOOK7IPApUgUjDhYKm34iTAq7lWxHwtagHevfx2HSym7uZX71/LPU/qVPxunbmpuWIVVZ1Jva8JR1UWtJLIS1jDs7hUeJxoet08Pp+FURxSElY7mVdZxQa1SyRDKaKW4gSgj5ZJiGYQ80ZbMZLI7y07h7eJypluFNpWomP/bmZ/FA/+/veX/cHNqfKVG8a0sxQkIwXTPewPkCNlIT0GAIwikHnmsHPNndoCBuzp7rwxZn7pF0Wc1pn6M60OkG0rUUTbaL7rcANSd2fwHSN86S9PQNooX1ihBIUshpEgx14W1Y5tBJgsjlw2p1uSBerq2B5Omp0tqPt2/dWy9zlZMnE5T5fD0dTtWctomqgUtk6jpV0GaGTpqMKYd3YE5mTITT6me0X+uZ2lN5/Kl/0qHbqKntvU= 26081631@qq.com
```

（长按可全选复制。这行是**公钥**，公开无害；私钥始终留在这台机器上。）

### 2. 建一个空仓库

<https://github.com/new> → Repository name 填 `dsh-whale-boot-theme` →
选 **Public**（市场只收公开仓库）→ **不要**勾 README/gitignore/LICENSE（本地已有）→ Create。

### 3. 回来告诉我一声

我这边跑完这些：

```bash
cd dsh-whale-boot-theme
git remote add origin git@github.com:bluestar2019/dsh-whale-boot-theme.git
git push -u origin main
```

然后验证 SSH：`ssh -T git@github.com` 应该回 `Hi bluestar2019!`。

## 四、上架到 DSH 插件市场

市场目录 `https://awesome-dsh-plugin.com/plugins.json` 的 7406 条条目，`url` **全部**是
`https://github.com/<owner>/<repo>`，没有一条来自 Gitee —— 所以仓库必须在 GitHub 上，
Gitee 只能当备份。仓库建好、README 和两张预览图都在位之后，剩下的就是等市场爬取
（或按其页面上的提交通道手动提交）。

`npm` 字段 3823/7406 条有，属于可选（有它市场页会显示下载量）。所以要发 npm 也可以，
但不是上架的前提。

## 五、如果手机也打不开 GitHub

那这台机器上就只剩两条备选：

- **Gitee 备份**：`gitee.com` 直连没问题（333ms）。把仓库先推 Gitee，等哪天能上 GitHub
  了再 `git remote add github` 推一次即可 —— 代码和提交历史都是现成的。
- **找人代推**：把 `dsh-whale-boot-theme-0.1.0.tgz`（`dist/` 里，9.92 MB）和上面那行公钥
  给一个能上 GitHub 的同事，让他建仓库、加钥匙、推一次。

## 六、npm 独立通道（不需要 GitHub）

包名 `dsh-whale-boot-theme` 在 npm 上还是空的（`HTTP 404`）。如果你的 npm 账号能登录
（手机浏览器也行），可以生成一个 **Automation token**：npmjs.com → Access Tokens →
Generate New Token → **Automation**。把 token 给我，我只写进本机 `~/.npmrc`，然后：

```bash
pnpm publish --access public
```

发完你可以在 npm 后台立刻撤销这个 token。**不要给我账号密码**，token 就够，而且可撤销。
