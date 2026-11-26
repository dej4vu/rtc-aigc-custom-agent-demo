# Teaching Notes

- 用户希望掌握全流程和开发方式，不只是概念科普。
- 工作区初始为空；第一课从「一次通话的最短完整链路」开始，再进入服务端开发。
- 当前仓库已由官方 rtc-aigc-demo 改造，`server/` 是自有 Agent 教学重点。
- 仓库 `docs/verification.md` 记录了 2026-11-25 的真实链路验证，可作为可信项目证据。
- 课程语言使用中文；文件名与代码标识保留英文。
- 第 2 课后用户已准确定位 `session.created` 超时清理边界，可进入异步取消和状态所有权主题。
- 第 3 课未等待用户微任务答案即进入第 4 课；后续应继续主线，但在 TTS 课前复测 `resp_id` 所有权概念。
- 第 5 课需强调：SeedTTS `final` 只结束单句，MMPG `done=true` 由 TurnController 在整个 turn 音频完成后发送。
