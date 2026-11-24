/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const fetch = require("node-fetch");

function contentToText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("");
  }
  return "";
}

async function* readLines(body) {
  let buffer = "";
  for await (const chunk of body) {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      yield line;
      index = buffer.indexOf("\n");
    }
  }
  if (buffer.length) {
    yield buffer.replace(/\r$/, "");
  }
}

class ArkAgent {
  constructor(config, { fetchImpl = fetch, logger = console } = {}) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  async reply({ messages, signal, onDelta = () => {} }) {
    const body = {
      model: this.config.ark.model,
      messages,
      stream: true,
      temperature: this.config.ark.temperature,
      max_tokens: this.config.ark.maxTokens,
      thinking: { type: "disabled" },
    };
    const url = `${this.config.ark.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    this.logger.info?.("[TEXT][LLM-REQUEST]", {
      model: this.config.ark.model,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });
    const startedAt = Date.now();
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.ark.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ark 请求失败：HTTP ${res.status} ${text.slice(0, 500)}`);
    }

    let text = "";
    let firstTokenAt = 0;
    if (!res.body) {
      const data = await res.json();
      const delta = contentToText(data?.choices?.[0]?.message?.content);
      if (delta) {
        text += delta;
        firstTokenAt = Date.now();
        await onDelta(delta, { firstTokenAt, firstTokenLatencyMs: firstTokenAt - startedAt });
      }
      return { text, firstTokenAt, firstTokenLatencyMs: firstTokenAt ? firstTokenAt - startedAt : 0 };
    }

    for await (const rawLine of readLines(res.body)) {
      const line = rawLine.trim();
      if (!line || line.startsWith(":")) {
        continue;
      }
      if (!line.startsWith("data:")) {
        continue;
      }
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") {
        continue;
      }
      let data;
      try {
        data = JSON.parse(payload);
      } catch {
        this.logger.warn?.("[ARK] 忽略无法解析的 SSE 片段");
        continue;
      }
      if (data?.error) {
        throw new Error(
          `Ark 流式错误：${data.error.code || ""} ${data.error.message || ""}`.trim()
        );
      }
      const delta = contentToText(data?.choices?.[0]?.delta?.content);
      if (!delta) {
        continue;
      }
      if (!firstTokenAt) {
        firstTokenAt = Date.now();
      }
      text += delta;
      await onDelta(delta, {
        firstTokenAt,
        firstTokenLatencyMs: firstTokenAt - startedAt,
      });
    }
    return {
      text,
      firstTokenAt,
      firstTokenLatencyMs: firstTokenAt ? firstTokenAt - startedAt : 0,
    };
  }
}

module.exports = {
  ArkAgent,
  contentToText,
  readLines,
};
