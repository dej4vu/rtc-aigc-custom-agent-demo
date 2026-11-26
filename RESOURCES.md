# RTC -> ASR -> LLM -> TTS Resources

## Knowledge

- [快速接入：基于自有 Agent（火山引擎）](https://docs.volcengine.com/docs/real-time-communication/quick-integrate-custom-agent-via-gateway?lang=zh)
  MMPG / 自有 Agent 官方接入主文档。Use for: WebSocket 签名、`session.create`、事件与音频回传。
- [本仓库 `README.md`](README.md)
  项目环境变量、启动命令、MMPG/Bot 配置和完整链路概览。Use for: 联调入口与开发约束。
- [本仓库 `docs/architecture.md`](docs/architecture.md)
  本仓库时序图、组件职责、Gateway 接入步骤、轮次与打断协议。Use for: 全流程心智模型。
- [本仓库 `docs/troubleshooting.md`](docs/troubleshooting.md)
  按链路层定位进房、ASR、LLM、TTS、字幕和打断问题。Use for: 故障排查训练。
- [本仓库 `docs/verification.md`](docs/verification.md)
  2026-11-25 真实凭证全链路验证与耗时参考。Use for: 判断什么是可交付状态。
- [本仓库 `server/lib/app.js`](server/lib/app.js)
  页面 Session、call 生命周期、RTC Token 与 MMPG 组装的唯一业务入口。Use for: 服务端启动协议开发。
- [本仓库 `server/lib/mmpg-client.js`](server/lib/mmpg-client.js)
  AK/SK WebSocket 签名、事件收发、`session.create` 确认和清理。Use for: 网关连接边界。
- [本仓库 `server/test/app.test.js`](server/test/app.test.js)
  用 HTTP 与假网关验证启动返回、AgentUserId、ASR 参数继承。Use for: 修改启动协议前的回归基准。
- [本仓库 `server/lib/turn-controller.js`](server/lib/turn-controller.js)
  ASR 聚合、turn 创建、LLM 流式分句、TTS 队列、播放确认和打断。Use for: 实时 Agent 状态机开发。
- [本仓库 `server/test/turn-controller.test.js`](server/test/turn-controller.test.js)
  把 `resp_id`、`done=true`、打断和情感标签清洗写成可执行规格。Use for: 修改轮次逻辑前后的行为验证。
- [本仓库 `server/lib/sentence-segmenter.js`](server/lib/sentence-segmenter.js)
  中英文流式分句、闭合引号和长句软截断。Use for: 首包延迟与语音自然度调优。
- [本仓库 `web/src/lib/useCommon.ts`](web/src/lib/useCommon.ts)
  RTC 能力检查、创建引擎、进房、麦克风发布、双 ready 与挂断回滚。Use for: 前端通话生命周期开发。
- [本仓库 `web/src/utils/mmpg.ts`](web/src/utils/mmpg.ts)
  `cmsg` TLV 出站包装和多形态自定义消息解析。Use for: 字幕、Trace、状态和控制消息。
- [本仓库 `web/src/utils/handler.ts`](web/src/utils/handler.ts)
  将 `conv`、`subv`、`trace` 分发到 Redux UI 状态。Use for: 前端状态边界调试。
- [本仓库 `server/lib/tts-client.js`](server/lib/tts-client.js)
  SeedTTS 3.0 URL、headers、请求体、JSONL 事件、PCM 与字词级时间戳解析。Use for: TTS 能力接入。
- [本仓库 `server/lib/inline-tags.js`](server/lib/inline-tags.js)
  82 个官方标签清单、提示词注入、白名单清洗和流式半标签处理。Use for: 情感语音与可见字幕分离。
- [本仓库 `server/test/tts-client.test.js`](server/test/tts-client.test.js)
  3.0/2.0 请求契约、JSONL 事件和 PCM 时长断言。Use for: 修改 TTS 客户端前的行为基准。
- [本仓库 `docs/verification.md`](docs/verification.md)
  自动化、浏览器、打断、双 Tab、字幕时间戳和清理的真实验收记录。Use for: 端到端交付标准。
- [本仓库 `docs/troubleshooting.md`](docs/troubleshooting.md)
  按链路层整理的常见故障与修复顺序。Use for: 交付失败时的分层定位。

## Wisdom (Communities)

Gaps:

- 还需要补充火山 AI 音视频互动官方社区或问答入口；暂时优先使用官方文档和仓库内验证记录。
