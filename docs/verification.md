# 全链路验证记录

验证日期：2026-11-25（Asia/Shanghai）

验证环境：

- macOS + Chrome（Playwright headless，虚拟麦克风）
- 前端 `http://localhost:3000`
- 服务端 `http://127.0.0.1:3101`
- 真实火山 RTC / MMPG / Ark / TTS 凭证
- `BOT_ID=xbotrbBWpRQkA`
- `BOT_NAME=情感陪伴-自有 agent`

## 自动化测试

```bash
yarn --cwd server test
# 22 passed

yarn --cwd web test --runInBand
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
| 欢迎语         | 字幕显示“你好呀，我在呢。今天想聊点什么？”，TTS 开始播放             |
| ASR            | 用户字幕“你好，请用一句话介绍一下你自己”                             |
| LLM            | 流式返回，例如“我是能陪你聊天解闷、还能帮你出主意的语音陪伴助手呀。” |
| TTS            | `tts.first_chunk` 正常                                               |
| 下行播放       | `playback.started` / `playback.done` 正常                            |
| 轮次结束       | `turn.finished`（`audio_done`）                                      |
| 打断           | `barge_in`，旧 `resp_id` 取消，新回复使用更高 `resp_id`              |
| 多轮           | 同一 call 内连续完成 2 轮 ASR -> LLM -> TTS                          |

一次成功链路的耗时示例：

```text
ASR 完成       约 5.4s（含测试音频静音段）
LLM 首 Token   约 0.4 ~ 0.7s
LLM 完成       约 0.6 ~ 1.0s
TTS 首包       约 1.1 ~ 1.5s
开始播放       约 1.2 ~ 1.6s
```

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

验证 MMPG 参数：

```bash
yarn probe
```

期望结果：

```text
session.create 成功；等待 1.5 秒确认无异步校验错误
MMPG 会话参数校验通过
```
