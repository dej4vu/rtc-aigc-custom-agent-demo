/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const { v4: uuidv4 } = require("uuid");
const { loadEnvFiles, buildConfig, configIssues } = require("./lib/config");
const { BotConfigResolver } = require("./lib/bot-config");
const { MmpgClient } = require("./lib/mmpg-client");
const { buildMmpgSession } = require("./lib/app");

async function main() {
  loadEnvFiles();
  const config = buildConfig();
  const issues = configIssues(config);
  if (issues.length) {
    throw new Error(`配置不完整：${issues.join("；")}`);
  }
  const bot = config.bot.id
    ? await new BotConfigResolver(config).resolve()
    : null;
  const roomId = `probe_${uuidv4().replace(/-/g, "")}`;
  const userId = `probe_user_${uuidv4().replace(/-/g, "")}`;
  const agentUserId = `agent_${uuidv4().replace(/-/g, "")}`;
  const client = new MmpgClient(config);
  let gatewayError = null;
  client.on("event", (event) => {
    console.log(
      JSON.stringify({
        type: event.type,
        event_id: event.event_id,
        conv_id: event.conv_id,
        resp_id: event.resp_id,
        message: event.message,
      })
    );
  });
  client.on("gatewayError", (error) => {
    gatewayError = error;
    console.error(`[PROBE] gateway error: ${error.message}`);
  });
  try {
    await client.connect();
    await client.createSession(
      buildMmpgSession({ config, roomId, userId, agentUserId, bot }),
      { timeoutMs: 25000 }
    );
    console.log("session.create 成功；等待 1.5 秒确认无异步校验错误");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (gatewayError) {
      throw gatewayError;
    }
    console.log("MMPG 会话参数校验通过");
  } finally {
    await client.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`[PROBE] 失败：${error.message}`);
  process.exitCode = 1;
});
