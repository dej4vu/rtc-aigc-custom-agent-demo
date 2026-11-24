# RTC + 自有 Agent 音视频互动 Demo

基于火山引擎官方 `rtc-aigc-demo` 前端改造的音频-only Demo，用来验证下面这条完整链路：

```text
浏览器 RTC 上行
  -> MMPG VAD / ASR
  -> 自有 Node Agent
  -> 火山方舟 Ark LLM（流式）
  -> 火山豆包 SeedTTS 3.0（HTTP JSONL 流式）
  -> MMPG assistant.audio.delta
  -> RTC 下行播放
```

前端复用官方 Demo 的进房、设备管理、字幕和 UI；本仓库新增 `server/`，负责 RTC Token、MMPG WebSocket、ASR 事件、LLM、TTS、轮次、打断和 Trace。

## 目录

```text
.
├── server/                 # 自有 Agent 服务
│   ├── index.js            # HTTP 入口，默认 3101
│   ├── preflight.js        # 配置、Bot、AK/SK 预检
│   ├── probe.js            # MMPG session.create 参数探测
│   ├── lib/app.js          # API + MMPG 会话编排
│   ├── lib/turn-controller.js
│   ├── lib/ark-agent.js    # Ark 流式 LLM
│   ├── lib/tts-client.js   # SeedTTS 3.0 流式 PCM + 内联情感标签
│   ├── lib/inline-tags.js  # 官方情感标签白名单与字幕清洗
│   └── scenes/default.json # 人设、欢迎语、推荐问题
├── web/                    # 官方 rtc-aigc-demo 前端改造
└── docs/                   # 架构、验证记录、排障
```

## 快速开始

环境要求：

- Node.js 18+（当前验证使用 Node 26）
- Yarn 1.22
- 可访问火山引擎公网

在仓库根目录安装依赖：

```bash
yarn install
yarn --cwd server install
yarn --cwd web install
```

配置：

```bash
cp .env.example .env.local
```

编辑 `.env.local`，至少填入：

```dotenv
RTC_APP_ID=
RTC_APP_KEY=
VOLC_ACCESS_KEY_ID=
VOLC_SECRET_ACCESS_KEY=
BOT_ID=
BOT_NAME=
ASR_API_KEY=
ASR_RESOURCE_ID=volc.bigasr.sauc.duration
ARK_API_KEY=
ARK_MODEL=doubao-seed-character-260628
TTS_API_KEY=
TTS_API_VERSION=3.0
TTS_MODEL_ID=doubao-seed-tts-3.0
TTS_LANGUAGE_CODE=zh
TTS_SPEAKER=multi_female_sajiaoxuemei_v3_uranus_bigtts
TTS_SPEED=0.96
TTS_PITCH=1
TTS_INSTRUCTIONS=["甜软、亲密、轻声撒娇，表面温柔，藏着一点占有欲和危险感"]
```

启动：

```bash
yarn dev
```

或分别启动：

```bash
yarn --cwd server start
yarn --cwd web start
```

打开 <http://localhost:3000>，点击“通话”，允许麦克风权限。

生产构建与静态托管：

```bash
yarn --cwd web build
rsync -a --delete web/build/ server/public/build/
# 打开 http://127.0.0.1:3101/rtc-demo/
```

前端 `homepage` 固定为 `/rtc-demo/`，因此生产构建必须挂在该子路径下；开发模式仍使用 <http://localhost:3000>。

## BotId 配置

BotId 在火山引擎控制台的 **AI 音视频互动方案 -> 我的智能体** 中获取，例如：

```dotenv
BOT_ID=xbotrbBWpRQkA
BOT_NAME=情感陪伴-自有 agent
```

本 Demo 对 BotId 的使用方式是：

1. 服务端用 AK/SK 调用 `AibotxQuery` 查询 Bot。
2. 读取 Bot 的 ASR / 音频格式 / VAD 默认参数。
3. 用这些参数构造 MMPG `session.create`。

注意：`BotId` **不是** MMPG `session.create` 的字段，不能直接塞进 `session`。如果 BotId 无效，`/getScenes` 会回退到本地场景配置，但 `/session/start` 会失败。

验证 Bot 是否可用：

```bash
yarn preflight
```

输出中应包含：

```text
Bot：情感陪伴-自有 agent (xbotrbBWpRQkA)
```

## 环境变量

| 变量                                            | 必填 | 说明                                                                                         |
| ----------------------------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| `RTC_APP_ID` / `RTC_APP_KEY`                    | 是   | RTC 应用凭证，服务端用于签发 RTC Token、创建 MMPG 会话                                       |
| `RTC_BUSINESS_ID`                               | 否   | RTC 业务标识                                                                                 |
| `VOLC_ACCESS_KEY_ID` / `VOLC_SECRET_ACCESS_KEY` | 是   | 火山 AK/SK，用于 MMPG WebSocket 签名和 `AibotxQuery`                                         |
| `BOT_ID` / `BOT_NAME`                           | 是   | 控制台智能体 ID 和展示名                                                                     |
| `ASR_API_KEY`                                   | 是   | 豆包语音 API Key，当前 MMPG 网关要求                                                         |
| `ASR_RESOURCE_ID`                               | 否   | 1.0 用 `volc.bigasr.sauc.duration`，2.0 用 `volc.seedasr.sauc.duration`；留空则继承 Bot 配置 |
| `ASR_APP_ID` / `ASR_ACCESS_TOKEN`               | 否   | 旧版语音凭证，仅兼容保留；当前主路径使用 `ASR_API_KEY`                                       |
| `ARK_API_KEY`                                   | 是   | 方舟 API Key                                                                                 |
| `ARK_MODEL`                                     | 否   | Ark 模型或 Endpoint ID                                                                       |
| `TTS_API_KEY`                                   | 是   | 豆包 TTS API Key                                                                             |
| `TTS_API_VERSION`                               | 否   | `3.0`（默认）或 `2.0`，用于回退旧接口                                                        |
| `TTS_MODEL_ID`                                  | 否   | 3.0 默认 `doubao-seed-tts-3.0`                                                               |
| `TTS_LANGUAGE_CODE`                             | 否   | 3.0 默认 `zh`                                                                                |
| `TTS_SPEAKER`                                   | 否   | 3.0 默认 `multi_female_sajiaoxuemei_v3_uranus_bigtts`（撒娇学妹 3.0）                        |
| `TTS_SPEED` / `TTS_PITCH`                       | 否   | 3.0 语速/音高，默认 `0.96` / `1`                                                             |
| `TTS_INSTRUCTIONS`                              | 否   | 3.0 表达风格指令，JSON 字符串数组                                                            |
| `TTS_RESOURCE_ID`                               | 否   | 仅 `TTS_API_VERSION=2.0` 时使用，默认 `seed-tts-2.0`                                         |
| `TTS_SAMPLE_RATE`                               | 否   | 默认 24000，必须与 MMPG 的 `pcm24` 匹配                                                      |
| `HOST` / `PORT`                                 | 否   | 服务端监听地址，默认 `127.0.0.1:3101`                                                        |
| `PUBLIC_DIR`                                    | 否   | 生产前端目录，默认 `server/public/build`                                                     |
| `MMPG_URL`                                      | 否   | 默认 `wss://interactai.volcvideo.com/api/v2/mmpg`                                            |
| `LOG_TRANSCRIPTS`                               | 否   | 设为 `1` 时 Trace 中记录完整识别文本                                                         |

密钥只放在 `.env.local`，该文件已被 `.gitignore` 忽略。前端只拿到每次调用独立的 RTC Token，不会拿到 AK/SK 或模型 Key。

## TTS 3.0 与情感音色

SeedTTS 3.0 使用音色级 JSONL 流式接口，不再使用 2.0 的
`openspeech.bytedance.com/api/v3/tts/unidirectional`：

```text
POST https://voice.cn-beijing.volces.com/api/v3/text-to-speech/{voice_id}/streaming
X-Api-Key: <TTS_API_KEY>
Content-Type: application/json
```

请求体包含 `text`、`model_id`、`language_code`、`output_format` 和
`voice_settings`；响应逐行返回 `ready` / `audio` / `final` / `error` 事件。
服务端按行解析，把 `audio` 的 Base64 PCM 通过
`assistant.audio.delta` 回传 RTC。

默认人设「绯绯」使用撒娇学妹 3.0 作为底声，并通过
`TTS_INSTRUCTIONS` 和官方内联标签叠加病娇感：

```text
[happy] 你终于来啦。[soft] 我还以为……你今天不会找我了呢。
```

实现约定：

- LLM 输出保留 `[happy]`、`[soft]`、`[whispering]` 等官方英文标签，原样送给 TTS。
- 字幕和历史消息会去掉标签，用户不会看到标签文本。
- 标签只允许来自官方 82 个标签集合；每次情绪转折最多一个，避免堆叠。
- 病娇人格只做亲密关系里的吃醋、撒娇和占有欲表达，不生成威胁、控制现实行动、自伤或伤害他人的内容。

账号未授权某个 3.0 音色时接口会返回 403。可在火山语音控制台开通后，
把 `TTS_SPEAKER` 换成其他 3.0 音色，例如：

```text
multi_female_vv_xi_v3_uranus_bigtts      # Vivi 3.0
multi_female_mizai_v3_uranus_bigtts      # 黑猫侦探社咪仔 3.0
multi_female_tvbnv_v3_uranus_bigtts      # TVB 女声 3.0
```

需要回退 2.0 时设置：

```dotenv
TTS_API_VERSION=2.0
TTS_RESOURCE_ID=seed-tts-2.0
TTS_SPEAKER=zh_female_vv_uranus_bigtts
```

## 常用命令

```bash
yarn dev              # 同时启动 server 和 web
yarn test             # server + web 测试
yarn preflight        # 配置、Bot、凭证预检
yarn preflight -- --handshake
                      # 只验证 MMPG WebSocket 签名与握手
yarn probe            # 真实创建一次 MMPG session，验证参数
yarn --cwd web build  # 前端生产构建
```

健康检查：

```bash
curl -s http://127.0.0.1:3101/health
```

## 接口

| 方法   | 路径             | 说明                                                       |
| ------ | ---------------- | ---------------------------------------------------------- |
| `GET`  | `/health`        | 配置、Bot、活动会话数；不返回密钥                          |
| `POST` | `/getScenes`     | 创建页面会话，返回场景与 BotId                             |
| `POST` | `/session/start` | 创建 call、房间、Agent UserId、RTC Token，并建立 MMPG 会话 |
| `POST` | `/session/stop`  | 停止本轮 call，关闭 MMPG                                   |

## 已验证

2026-11-25 使用真实火山凭证、真实 `BOT_ID=xbotrbBWpRQkA`，在
Microsoft Edge 158 访问测试环境 <https://tapi.tuban.zone/rtc-demo/> 验证通过：

- SeedTTS 3.0 `doubao-seed-tts-3.0` + 撒娇学妹 3.0 音色
- 病娇欢迎语字幕与 TTS 播放，字幕不显示 `[happy]` / `[soft]` 标签
- RTC 上行 -> MMPG ASR -> 自有 Agent -> Ark LLM -> TTS -> RTC 下行
- 同一 call 内完成两轮对话，两轮都有 `turn.finished(audio_done)`
- 用户插话打断，旧 `resp_id` 取消，新 `resp_id` 递增
- TTS 请求保留内联标签，字幕与 LLM 历史使用纯文本
- `client.ready` 每次 call 只上报一次
- 双轮对话均完成 `TTS 首包 -> 播放完成 -> 本轮结束`
- 双 Tab 房间与 Agent UserId 隔离
- 显式挂断后 `activeCalls` 归零
- MMPG 连接断开后服务端自动清理活动 call

服务端 34 项测试、前端 14 项测试全部通过，前端生产构建通过。

详细记录见 [docs/verification.md](docs/verification.md)。

## 更多文档

- [架构与会话协议](docs/architecture.md)
- [全链路验证记录](docs/verification.md)
- [常见问题排查](docs/troubleshooting.md)
