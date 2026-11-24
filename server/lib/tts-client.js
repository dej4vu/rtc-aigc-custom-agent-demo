/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");
const { readLines } = require("./ark-agent");

const TTS_ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
const END_CODE = 20000000;

function parseTtsLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  let data;
  try {
    data = JSON.parse(trimmed);
  } catch {
    throw new Error(`TTS 返回无法解析的行：${trimmed.slice(0, 200)}`);
  }
  const code = Number(data.code);
  if (code === END_CODE) {
    return { type: "end", raw: data };
  }
  if (code !== 0) {
    throw new Error(
      `TTS 错误：code=${data.code ?? "unknown"} message=${
        data.message || data.msg || ""
      }`.trim()
    );
  }
  const payload = data.data ?? data.audio ?? data.payload;
  if (typeof payload !== "string" || !payload) {
    return { type: "empty", raw: data };
  }
  return {
    type: "audio",
    buffer: Buffer.from(payload, "base64"),
    raw: data,
  };
}

class TtsClient {
  constructor(config, { fetchImpl = fetch, logger = console } = {}) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  buildRequest(text) {
    return {
      req_params: {
        text,
        speaker: this.config.tts.speaker,
        audio_params: {
          format: this.config.tts.format,
          sample_rate: this.config.tts.sampleRate,
        },
        additions: JSON.stringify({
          disable_markdown_filter: true,
          disable_emoji_filter: true,
        }),
      },
    };
  }

  async synthesize(text, { signal, onChunk = async () => {} } = {}) {
    const requestId = uuidv4();
    const res = await this.fetchImpl(TTS_ENDPOINT, {
      method: "POST",
      headers: {
        "X-Api-Key": this.config.tts.apiKey,
        "X-Api-Resource-Id": this.config.tts.resourceId,
        "X-Api-Request-Id": requestId,
        "Content-Type": "application/json",
        Connection: "keep-alive",
      },
      body: JSON.stringify(this.buildRequest(text)),
      signal,
    });

    if (!res.ok) {
      const textBody = await res.text().catch(() => "");
      throw new Error(
        `TTS 请求失败：HTTP ${res.status} ${textBody.slice(0, 500)}`
      );
    }
    if (!res.body) {
      throw new Error("TTS 响应没有音频流");
    }

    let chunks = 0;
    let bytes = 0;
    let ended = false;
    for await (const rawLine of readLines(res.body)) {
      const parsed = parseTtsLine(rawLine);
      if (!parsed) {
        continue;
      }
      if (parsed.type === "end") {
        ended = true;
        break;
      }
      if (parsed.type !== "audio" || !parsed.buffer.length) {
        continue;
      }
      chunks += 1;
      bytes += parsed.buffer.length;
      await onChunk(parsed.buffer);
    }
    return { requestId, chunks, bytes, ended };
  }
}

module.exports = {
  TtsClient,
  parseTtsLine,
  TTS_ENDPOINT,
  END_CODE,
};
