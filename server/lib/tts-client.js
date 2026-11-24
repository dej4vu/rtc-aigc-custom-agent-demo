/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");
const { readLines } = require("./ark-agent");

const TTS_V2_ENDPOINT =
  "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
const TTS_V3_ENDPOINT_BASE =
  "https://voice.cn-beijing.volces.com/api/v3/text-to-speech";
// Backward-compatible alias for the 2.0 endpoint.
const TTS_ENDPOINT = TTS_V2_ENDPOINT;
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

function parseTts3Line(line) {
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
  const event = String(data.event || data.type || "").toLowerCase();
  if (event === "error" || data.error) {
    const error = data.error || {};
    const message =
      error.message ||
      data.message ||
      (typeof data.error === "string" ? data.error : "") ||
      "unknown error";
    const code = error.code || data.code || "unknown";
    const requestId = data.request_id || error.request_id || "";
    throw new Error(
      `TTS 错误：code=${code} message=${message}${
        requestId ? ` request_id=${requestId}` : ""
      }`
    );
  }
  if (event === "ready") {
    return { type: "ready", raw: data };
  }
  if (event === "final") {
    return { type: "end", raw: data };
  }
  if (event === "alignment") {
    return { type: "alignment", raw: data };
  }
  if (event === "audio") {
    const payload = data.audio ?? data.data ?? data.payload;
    if (typeof payload !== "string" || !payload) {
      return { type: "empty", raw: data };
    }
    return {
      type: "audio",
      buffer: Buffer.from(payload, "base64"),
      raw: data,
    };
  }
  if (Number(data.code) && Number(data.code) !== END_CODE) {
    throw new Error(
      `TTS 错误：code=${data.code} message=${
        data.message || data.msg || ""
      }`.trim()
    );
  }
  return { type: "other", raw: data };
}

class TtsClient {
  constructor(config, { fetchImpl = fetch, logger = console } = {}) {
    this.config = config;
    this.fetchImpl = fetchImpl;
    this.logger = logger;
  }

  get apiVersion() {
    return this.config.tts.apiVersion === "2.0" ? "2.0" : "3.0";
  }

  buildRequest(text, { sessionId } = {}) {
    if (this.apiVersion === "3.0") {
      const voiceSettings = {
        speed: this.config.tts.speed ?? 1,
        pitch: this.config.tts.pitch ?? 1,
      };
      const instructions = this.config.tts.instructions || [];
      if (instructions.length) {
        voiceSettings.instructions = instructions;
      }
      return {
        text,
        model_id: this.config.tts.modelId || "doubao-seed-tts-3.0",
        language_code: this.config.tts.languageCode || "zh",
        output_format: {
          format: this.config.tts.format,
          sample_rate: this.config.tts.sampleRate,
        },
        voice_settings: voiceSettings,
        ...(sessionId ? { session_id: sessionId } : {}),
      };
    }
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

  buildUrl() {
    if (this.apiVersion === "3.0") {
      return `${TTS_V3_ENDPOINT_BASE}/${encodeURIComponent(
        this.config.tts.speaker
      )}/streaming`;
    }
    return TTS_V2_ENDPOINT;
  }

  buildHeaders(requestId) {
    const headers = {
      "X-Api-Key": this.config.tts.apiKey,
      "Content-Type": "application/json",
      Connection: "keep-alive",
    };
    if (this.apiVersion === "3.0") {
      headers["X-Request-Id"] = requestId;
    } else {
      headers["X-Api-Resource-Id"] = this.config.tts.resourceId;
      headers["X-Api-Request-Id"] = requestId;
    }
    return headers;
  }

  async synthesize(text, { signal, onChunk = async () => {}, sessionId } = {}) {
    const requestId = uuidv4();
    const res = await this.fetchImpl(this.buildUrl(), {
      method: "POST",
      headers: this.buildHeaders(requestId),
      body: JSON.stringify(this.buildRequest(text, { sessionId })),
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
    const parseLine = this.apiVersion === "3.0" ? parseTts3Line : parseTtsLine;
    for await (const rawLine of readLines(res.body)) {
      const parsed = parseLine(rawLine);
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
    return { requestId, chunks, bytes, ended, apiVersion: this.apiVersion };
  }
}

module.exports = {
  TtsClient,
  parseTtsLine,
  parseTts3Line,
  TTS_ENDPOINT,
  TTS_V2_ENDPOINT,
  TTS_V3_ENDPOINT_BASE,
  END_CODE,
};
