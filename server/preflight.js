/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const { loadEnvFiles, buildConfig, configIssues, publicConfigStatus } = require("./lib/config");
const { BotConfigResolver } = require("./lib/bot-config");
const { MmpgClient } = require("./lib/mmpg-client");

async function main() {
  loadEnvFiles();
  const config = buildConfig();
  const handshakeOnly =
    process.argv.includes("--handshake") || process.argv.includes("--connect");
  const issues = configIssues(config);
  console.log(JSON.stringify(publicConfigStatus(config), null, 2));

  if (handshakeOnly) {
    if (!config.mmpg.accessKeyId || !config.mmpg.secretAccessKey) {
      throw new Error("MMPG 握手需要 VOLC_ACCESS_KEY_ID / VOLC_SECRET_ACCESS_KEY");
    }
    const client = new MmpgClient(config);
    try {
      await client.connect();
      console.log("MMPG WebSocket 握手成功");
    } finally {
      await client.close().catch(() => {});
    }
    console.log("\nMMPG 签名与握手验证完成（未创建会话）。");
    return;
  }

  if (issues.length) {
    console.error("\n配置问题：");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  if (config.bot.id) {
    try {
      const bot = await new BotConfigResolver(config).resolve();
      console.log(`Bot：${bot.name || "(no name)"} (${bot.id})`);
    } catch (error) {
      console.error(`Bot 解析失败：${error.message}`);
      process.exitCode = 1;
      return;
    }
  }

  console.log("\n预检完成。加 --handshake 可只验证 MMPG 签名与握手。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
