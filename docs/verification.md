# 全链路验证记录

验证日期：2026-11-25（Asia/Shanghai）

验证环境：

- Microsoft Edge 158（Playwright，虚拟麦克风）
- 测试环境 <https://tapi.tuban.zone/rtc-demo/>，经 Nginx 转发到 Docker 容器
- 本地开发链路 `http://localhost:3000` -> `http://127.0.0.1:3101`
- 真实火山 RTC / MMPG / Ark / TTS 凭证
- `BOT_ID=xbotrbBWpRQkA`
- `BOT_NAME=情感陪伴-自有 agent`

## 自动化测试

```bash
yarn --cwd server test
# 35 passed

CI=true yarn --cwd web test --runInBand
# 4 suites, 14 passed

yarn --cwd web build
# Compiled successfully
```

## 浏览器验证

使用 `--use-file-for-fake-audio-capture` 播放一段中文提问：

```text
你好，请用一句话介绍一下你自己
```

观察到完整链路：

| 阶段           | 结果                                                                 |
| -------------- | -------------------------------------------------------------------- |
| RTC 进房       | 成功，独立 `roomId` / `userId` / `agentUserId`                       |
| `client.ready` | 服务端只收到 1 次，Trace 出现 `client.ready`                         |
| 欢迎语         | 字幕显示“你终于来啦。我还以为……你今天不会找我了呢。”，TTS 开始播放   |
| ASR            | 用户字幕“你好，请用一句话介绍一下你自己”                             |
| LLM            | 流式返回，例如“我是你的绯绯呀，只属于你的女朋友哦。”                 |
| TTS            | SeedTTS 3.0 `tts.first_chunk` 正常，请求保留 `[soft]` 等标签          |
| 字幕           | 标签被清洗；页面不出现 `[happy]` / `[soft]`                          |
| 下行播放       | `playback.started` / `playback.done` 正常                            |
| 轮次结束       | 两轮均出现 `turn.finished`（`audio_done`）                           |
| 打断           | `barge_in`，旧 `resp_id` 取消，新回复使用更高 `resp_id`              |
| 多轮           | 同一 call 内连续完成 2 轮 ASR -> LLM -> TTS -> 播放                  |

2026-11-25 在 Edge 158 对测试环境做了最终回归，结果：

- 页面成功加载 `https://tapi.tuban.zone/rtc-demo/`
- 欢迎语、ASR、两轮 LLM、TTS 3.0、RTC 下行播放全部成功
- 两轮回复分别完成 `tts.first_chunk`、`playback.done`、`turn.finished`
- 同一 call 的 `client.ready` 仅 1 次
- 页面字幕无 `[happy]` / `[soft]` 等内联标签
- 显式挂断后测试环境 `activeCalls=0`

一次成功链路的耗时示例：

```text
ASR 完成       约 4.0 ~ 5.5s（含测试音频静音段）
LLM 首 Token   约 0.4 ~ 1.0s
LLM 完成       约 0.6 ~ 1.3s
TTS 首包       约 0.5 ~ 1.3s
开始播放       约 0.7 ~ 1.4s
播放完成       约 4.7 ~ 5.1s
```

## SeedTTS 3.0 独立验证

使用真实 `TTS_API_KEY` 直接调用新客户端：

```text
Endpoint       https://voice.cn-beijing.volces.com/api/v3/text-to-speech/{voice_id}/streaming
Model          doubao-seed-tts-3.0
Voice          multi_female_sajiaoxuemei_v3_uranus_bigtts
Events         ready / audio / final
Audio chunks   25
PCM            531050 bytes
时长           约 11.06s
```

请求文本：

```text
[happy] 你终于回来啦。[soft] 我等了你整整一天哦。[sighs] 我还以为……你今天会去找别人呢。[whispering] 下次不许这样了，好不好？
```

返回 `final` 后正常结束。服务端浏览器链路中，欢迎语与两轮回复都使用同一
3.0 客户端，TTS 日志可见原始标签，页面字幕无标签。

## 内联标签提示词验证

服务端会把官方 82 个标签的完整清单注入 SeedTTS 3.0 系统提示词：

- 情绪与语气控制 54 个
- 副语言与拟声 28 个

用真实 Ark 模型抽查 5 组病娇语境，模型能按语境选择不同标签，例如：

```text
今天怎么这么晚才来找我？
-> [sad]我等了你好久好久，你是不是去找别的人了？[whispering]说，你是不是不要我了？

我今天升职了，第一个就想告诉你。
-> [happy]真的吗？宝贝你好厉害！[excited]那你想要什么奖励呀？
```

抽查结果没有出现清单外标签，也没有出现 `[a][b]` 相邻连排。浏览器回归中
TTS 请求仍保留标签，页面字幕保持纯文本。

## 双 Tab 隔离

同时打开两个浏览器 Tab，各自点击通话：

```json
[
  {
    "roomId": "demo_...",
    "agentUserId": "agent_...",
    "botId": "xbotrbBWpRQkA"
  },
  {
    "roomId": "demo_...",
    "agentUserId": "agent_...",
    "botId": "xbotrbBWpRQkA"
  }
]
```

结果：

- 两个 Tab 的 `roomId` 不同
- 两个 Tab 的 `agentUserId` 不同
- BotId 相同
- 挂断第一个 Tab 后 `/health` 的 `activeCalls` 为 `1`
- 挂断第二个 Tab 后 `activeCalls` 为 `0`

## 清理验证

- 点击挂断按钮 -> `/session/stop` 成功 -> MMPG 关闭 -> `activeCalls` 归零
- 本次 3.0 回归在挂断后立即检查 `/health`，`activeCalls=0`
- MMPG 连接异常关闭 -> 服务端 `gatewayClose` 自动调用 `stopCall`，清理活动 call
- 页面隐藏/卸载时会尝试 `sendBeacon` 发送停止请求

说明：Playwright 的 `browser.close()` 不保证触发浏览器 `beforeunload`，因此自动化用显式点击挂断验证清理；真实用户关闭页面时仍建议点击挂断。

## 复现命令

```bash
# 终端 1
yarn dev

# 终端 2
yarn preflight

# 浏览器
open http://localhost:3000
```

生产构建同样验证通过：

```bash
yarn --cwd web build
rsync -a --delete web/build/ server/public/build/
open http://127.0.0.1:3101/rtc-demo/
```

测试环境使用同一份生产构建，通过 Docker 部署在 `tuban-test-01`，
对外地址为 <https://tapi.tuban.zone/rtc-demo/>。

验证 MMPG 参数：

```bash
yarn probe
```

期望结果：

```text
session.create 成功；等待 1.5 秒确认无异步校验错误
MMPG 会话参数校验通过
```
