/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const fetch = require("node-fetch");
const { signHeaders } = require("./sign");

const ACTION = "AibotxQuery";
const VERSION = "2025-08-01";
const ENDPOINT = "https://rtc.volcengineapi.com";
const REGION = "cn-north-1";
const SERVICE = "rtc";

function normalizeBot(bot) {
  if (!bot || typeof bot !== "object") {
    return null;
  }
  const id = typeof bot.Id === "string" ? bot.Id.trim() : "";
  if (!id) {
    return null;
  }
  return {
    id,
    name: typeof bot.Name === "string" ? bot.Name.trim() : "",
    config: bot.Config && typeof bot.Config === "object" ? bot.Config : {},
    agentConfig:
      bot.AgentConfig && typeof bot.AgentConfig === "object"
        ? bot.AgentConfig
        : {},
  };
}

class BotConfigResolver {
  constructor(config, { fetchImpl = fetch, ttlMs = 5 * 60 * 1000, now = Date.now } = {}) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.ttlMs = ttlMs;
    this.now = now;
    this.cache = null;
  }

  async listBots() {
    if (this.cache && this.now() - this.cache.at < this.ttlMs) {
      return this.cache.bots;
    }

    const all = [];
    const seen = new Set();
    let iterator = "";
    for (let page = 0; page < 20; page += 1) {
      const body = { PageNum: 1, Limit: 12, Iterator: iterator };
      const url = `${ENDPOINT}/?Action=${ACTION}&Version=${VERSION}`;
      const headers = signHeaders({
        method: "POST",
        url,
        body,
        region: REGION,
        service: SERVICE,
        accessKeyId: this.config.mmpg.accessKeyId,
        secretAccessKey: this.config.mmpg.secretAccessKey,
      });
      headers["Content-Type"] = "application/json";

      const res = await this.fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`AibotxQuery 返回非 JSON（HTTP ${res.status}）`);
      }
      if (!res.ok || data?.ResponseMetadata?.Error) {
        const err = data?.ResponseMetadata?.Error;
        throw new Error(
          `AibotxQuery 失败：${err?.Code || res.status} ${err?.Message || ""}`.trim()
        );
      }
      const bots = Array.isArray(data?.Result?.Bots) ? data.Result.Bots : [];
      for (const raw of bots) {
        const bot = normalizeBot(raw);
        if (bot && !seen.has(bot.id)) {
          seen.add(bot.id);
          all.push(bot);
        }
      }
      const next = data?.Result?.NextIterator;
      if (!next || seen.has(`iterator:${next}`)) {
        break;
      }
      seen.add(`iterator:${next}`);
      iterator = next;
    }
    this.cache = { at: this.now(), bots: all };
    return all;
  }

  async resolve() {
    const botId = this.config.bot.id;
    if (!botId) {
      return null;
    }
    const bots = await this.listBots();
    const bot = bots.find((item) => item.id === botId);
    if (!bot) {
      throw new Error(`未找到 BOT_ID=${botId} 对应的智能体`);
    }
    return bot;
  }
}

module.exports = {
  BotConfigResolver,
  normalizeBot,
};
