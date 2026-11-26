# Mission: RTC -> ASR -> LLM -> TTS 全流程开发

## Why
以当前 `rtc-aigc-custom-agent-demo` 仓库为教学载体，掌握火山 RTC、MMPG/ASR、自有 Node Agent、Ark LLM、SeedTTS 与 RTC 下行播放的完整链路，并能独立开发、调试和改造这类实时语音 Agent。

## Success looks like
- 能不看代码讲清一通对话从麦克风采集到扬声器播放的事件顺序与数据格式。
- 能定位 RTC 进房、ASR、LLM、TTS、字幕、打断中的任一故障层。
- 能读懂并修改 `session.create`、`assistant.audio.delta`、`assistant.audio.cancel` 和轮次控制逻辑。
- 能为新的业务场景替换人设、模型、音色和提示词，并完成回归验证。

## Constraints
- 教学优先使用本仓库的真实实现、`docs/` 记录和官方文档。
- 偏向 Node.js 服务端开发方式；前端只学到能联调和排障。
- 课程短小、可直接动手，优先建立可迁移的心智模型。

## Out of scope
- 暂不深入 WebRTC 底层 SDP/ICE 协议实现。
- 暂不改造成多模态视频 Agent。
- 暂不覆盖生产级容器编排、计费优化和高并发压测。
