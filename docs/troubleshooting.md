# 常见问题排查

## 前端提示 Failed to fetch / 3101 连接失败

确认服务端已启动：

```bash
curl -s http://127.0.0.1:3101/health
```

如果前端不是访问 `127.0.0.1:3101`，启动前端时指定：

```bash
REACT_APP_AIGC_PROXY_HOST=http://127.0.0.1:3101 yarn --cwd web start
```

检查端口占用：

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:3101 -sTCP:LISTEN
```

## `AibotxQuery 失败`

常见原因：

- `VOLC_ACCESS_KEY_ID` / `VOLC_SECRET_ACCESS_KEY` 不正确
- 子账户没有 `RTCFullAccess`
- AK/SK 不属于当前 RTC 应用所在账号
- `BOT_ID` 不属于当前账号或已被删除

先运行：

```bash
yarn preflight
```

如果输出 `未找到 BOT_ID=... 对应的智能体`，请到控制台 **AI 音视频互动方案 -> 我的智能体** 重新复制 BotId。

## `session.create` 参数校验失败

优先运行：

```bash
yarn probe
```

重点检查 ASR：

- 当前网关要求 `ProviderParams.ApiKey`
- 不要把凭证包在 `ProviderParams.Credential` 里
- `ApiResourceId` 必须和语音版本匹配：
  - 1.0：`volc.bigasr.sauc.duration`
  - 2.0：`volc.seedasr.sauc.duration`
- `ASR_API_KEY` 必须与资源 ID 对应

## 能进房但没有用户字幕

依次检查：

1. 浏览器麦克风权限是否授予
2. `client.ready` 是否出现在 Trace
3. MMPG 是否返回 `user.audio.transcription.*`
4. `ASR_API_KEY` / `ASR_RESOURCE_ID` 是否正确
5. 是否把音频发布到了 RTC（`isAutoPublish: true`）

如果服务端日志出现 `register stream failed`，通常是流注册失败或会话空闲超时，重新进房即可。

## 有 LLM 文本但没有声音

- 检查 `TTS_API_KEY` 是否有效
- 检查 `TTS_RESOURCE_ID` 与 `TTS_SPEAKER` 是否匹配
- 检查 `TTS_SAMPLE_RATE` 是否为 24000（与 `pcm24` 对应）
- 检查 `assistant.audio.delta` 最后一个包是否 `done=true`
- 浏览器可能拦截自动播放，点击页面后再试

## 没有欢迎语

欢迎语由业务服务端生成，不依赖 MMPG 的 `WelcomeMessage`。需要满足：

1. 前端进房并成功订阅 AI 音频
2. 前端通过 `cmsg` TLV 发送 `client.ready`
3. 服务端收到 `user.message`，解析出 `client.ready`

如果 Trace 只有 `client.ready.timeout`，检查客户端是否使用了 `encodeMmpgMessage`。

## 用户说话无法打断 AI

- 确认 Trace 中出现 `asr.started` 或 `barge_in`
- 确认 MMPG 返回的是同一会话的用户语音事件
- 确认前端没有把音频静音或停止采集
- 点击打断按钮时，客户端应发送 `client.interrupt`

## 挂断后 `activeCalls` 不为 0

正常路径：

- 点击挂断 -> `/session/stop` -> `stopCall` -> `activeCalls` 减 1
- MMPG 连接关闭 -> `gatewayClose` -> `stopCall`

如果仍有残留：

```bash
curl -s http://127.0.0.1:3101/health
```

可以重启服务端清理：

```bash
kill $(lsof -ti tcp:3101)
yarn --cwd server start
```

## 端口被占用

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:3101 -sTCP:LISTEN
kill <PID>
```

## 密钥安全

- 不要把 `.env.local` 提交到 Git
- 不要把 AK/SK、模型 Key、TTS Key 写进前端代码
- `/health` 只返回布尔状态，不返回密钥值
- 生产环境应把 RTC Token 签发和 MMPG 连接放在受控服务端
