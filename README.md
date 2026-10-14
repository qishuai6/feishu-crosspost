# feishu-crosspost

> 在飞书里发一条消息，自动同步发布到**微博、即刻、豆瓣**。

Cross-post a single Feishu/Lark message to Weibo, Jike and Douban — with one command or one chat message.

```
你在飞书发消息 ──▶ 飞书开放平台（长连接）──▶ 本服务 ──▶ 微博 / 即刻 / 豆瓣
                                                └─▶ 把每个平台的发布结果回复给你
```

本机运行，通过飞书官方「长连接」接收消息，**无需公网服务器、无需域名备案**。

## 特性

- 📮 **飞书长连接**：给机器人发消息即发布，发完机器人把每个平台的结果链接回复给你
- 🔁 **凭据自愈**：微博 XSRF 令牌自动刷新（约 20 分钟轮换）、即刻 access token 自动续期（约 30 分钟过期）并写回 `.env`，日常零维护
- 🧰 **CLI 工具**：不接飞书也能用，`npm run post -- "内容"` 直接三平台同步发
- 🧪 **可验证**：`npm run verify` 一键检查所有凭据是否有效；支持 `--dry` 试运行
- 📝 **留底**：每次发布记录追加在 `data/posted.jsonl`

## 快速开始

```bash
git clone <this-repo> && cd feishu-crosspost
npm install                      # 国内网络慢可加 --registry=https://registry.npmmirror.com
cp .env.example .env             # 按「凭据获取」逐项填写
npm run verify                   # 确认凭据都有效
npm start                        # 启动飞书服务，保持运行
```

## 飞书应用创建（一次性，约 10 分钟）

1. 打开 https://open.feishu.cn → 开发者后台 → **创建企业自建应用**
2. 「添加应用能力」→ 添加 **机器人**
3. 「权限管理」→ 开通以下权限：
   - `im:message.p2p_msg:readonly`（接收用户发给机器人的单聊消息）
   - `im:message.group_at_msg:readonly`（接收群里 @机器人 的消息，不用群聊可不开）
   - `im:message:send_as_bot`（以机器人身份发消息，用于回复发布结果）
4. 「事件与回调」→ 订阅方式选择 **使用长连接接收事件** → 添加事件 `im.message.receive_v1`（接收消息）
5. 「版本管理与发布」→ 创建版本并发布（多数企业内应用免审批，提交即生效）
6. 「凭据与基础信息」→ 把 App ID / App Secret 填进 `.env`
7. `npm start`，在飞书里搜索你的应用名，直接发消息即可

## 使用方式

### 飞书侧
- 默认 `TRIGGER_MODE=all`：发给机器人的**任何文字**都会被发布
- 想更稳妥就改 `TRIGGER_MODE=prefix`，此时消息需以 `/发` 开头（`/发今天天气不错`）
- 群聊里 @机器人 + 内容（需开通群聊权限）
- 以 `/` 开头的消息**不会**发布；内置命令：`/状态` 查看配置、`/帮助` 查看用法
- 发布完成后机器人会回复每个平台的结果（链接或失败原因）

### 命令行
```bash
npm run post -- "内容"                    # 发到所有已配置平台
npm run post -- "内容" --only=weibo,jike  # 只发指定平台（weibo/jike/douban，别名 wb/jk/db）
npm run post -- "内容" --skip=jike        # 排除某平台
npm run post -- --file draft.txt          # 从文件读取长文
npm run verify                            # 校验各平台凭据
DRY_RUN=1 npm run post -- "内容"          # 试运行，不真正发布
```

## 凭据获取

### 微博（Cookie 模式，实测可用）

微博开放平台 API 个人开发者很难拿到发博权限，本项目走 m.weibo.cn 网页版同款接口。

1. 浏览器登录 https://m.weibo.cn
2. 复制完整 Cookie：F12 → 网络 → 刷新页面 → 点任意 `m.weibo.cn` 请求 → 请求标头 → 复制 `Cookie:` 整行
3. `WEIBO_COOKIE` 填入整串（至少需含 `SUB`；`SUB` 是 httpOnly，`document.cookie` 取不到，必须从请求头复制）
4. `XSRF-TOKEN` 不用管：有效期仅约 20 分钟且随浏览轮换，服务每次发布前会**自动取最新值**，被拒时自动重试

### 即刻（非官方接口）

1. 浏览器登录 https://web.okjike.com
2. F12 → Console 依次执行并复制两项输出：
   ```js
   localStorage.getItem("JK_ACCESS_TOKEN")
   localStorage.getItem("JK_REFRESH_TOKEN")
   ```
3. 分别填入 `JIKE_ACCESS_TOKEN`、`JIKE_REFRESH_TOKEN`
4. access token 约 30 分钟过期，服务收到 401 时会自动用 refresh token 续期并**写回 `.env`**，无需手动维护

> 发布端点：`https://api.ruguoapp.com/1.0/originalPosts/create`（2026-10 实测可用；
> 老域名 `app.jike.ruguoapp.com` 已失效）。如有变动用 `JIKE_API` 环境变量覆盖。

### 豆瓣（非官方接口）

1. 浏览器登录 https://www.douban.com
2. 复制完整 Cookie：F12 → 网络 → 刷新 → 请求标头 → 复制 `Cookie:` 整行
3. 填入 `DOUBAN_COOKIE`，需包含 `ck=xxx`（CSRF 令牌，也是 httpOnly 之外的关键字段）
4. `npm run verify` 会显示当前登录的豆瓣昵称，便于确认

> 发布端点：`POST https://m.douban.com/rexxar/api/v2/topic/post`（网页版发布框同款，2026-10 抓包确认）。
> 两个坑已内置处理：body 必须是 JSON 且需携带 `ck` 字段（缺失会被伪装成 `need_login`）；
> 内容为 DraftJS blocks 格式。端点变动可用 `DOUBAN_API` 覆盖。

## 稳定性与风险

- ✅ **官方接口**：飞书（长连接）——完全稳定
- ⚠️ **非官方接口**：微博/即刻/豆瓣走网页端同款接口，平台改版即可能失效。所有端点均支持环境变量覆盖，
  一般只需更新端点即可恢复，无需改代码；失效信号是发布报错时返回的 HTTP 状态或错误文案
- 🔐 `.env` 集中所有账号凭据，**已加入 .gitignore**，切勿提交或外传
- 🚦 各平台对自动发布有风控，正常频率使用（一天几条）没问题，请勿刷屏
- ⚖️ 使用非官方接口存在账号风险与条款风险，请自行评估，本项目的 MIT 许可不构成对平台条款的豁免

## 常驻运行（macOS）

服务需要进程常驻才能一直收消息。推荐用 launchd 配置开机自启；临时用法：

```bash
npm start > data/service.log 2>&1 &   # 后台运行
```

## 常见问题

**收不到消息？** 依次检查：飞书后台「事件与回调」是否选了长连接方式、事件 `im.message.receive_v1`
是否已添加、应用版本是否已发布。启动时加 `DEBUG_EVENT=1` 可打印事件结构辅助排查。

**发布报「请求非法」(errno 100006)？** 微博令牌过期。本项目已内置自愈，如果仍出现请检查
`WEIBO_COOKIE` 是否包含 `SUB`。

**即刻报 401？** 检查 `JIKE_REFRESH_TOKEN` 是否填写；两者都失效时重新从网页版抓一次即可。

## License

[MIT](./LICENSE)
