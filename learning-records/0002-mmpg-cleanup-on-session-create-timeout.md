# 用户理解了 session.created 超时后的 MMPG 清理边界

用户能准确定位 `server/lib/app.js` 中 `catch` 块的 `mmpg.close().catch(() => {})` 和后续 `throw error`，说明他理解了握手成功但 `session.created` 超时时的清理路径：close 错误被吞掉作为兜底，原始超时错误继续冒泡回 HTTP 错误响应。这为他读懂第 3 课的轮次取消和异步错误传播打下了基础。
