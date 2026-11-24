/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const { buildConfig, loadEnvFiles } = require("./lib/config");
const { createApp } = require("./lib/app");

loadEnvFiles();
const config = buildConfig();
const app = createApp({ config });

const server = app.listen(config.port, config.host, () => {
  console.log(
    `[AIGC-SERVER] listening on http://${config.host}:${config.port} (scene=${Object.keys(app.scenes).join(",")})`
  );
});

let closing = false;
async function shutdown(signal) {
  if (closing) {
    return;
  }
  closing = true;
  console.log(`[AIGC-SERVER] 收到 ${signal}，正在关闭活动会话`);
  const forceTimer = setTimeout(() => {
    console.error("[AIGC-SERVER] 关闭超时，强制退出");
    process.exit(1);
  }, 8000);
  forceTimer.unref?.();
  try {
    await app.closeAll();
    await new Promise((resolve) => server.close(resolve));
    clearTimeout(forceTimer);
    process.exit(0);
  } catch (error) {
    console.error("[AIGC-SERVER] 关闭失败", error);
    process.exit(1);
  }
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
