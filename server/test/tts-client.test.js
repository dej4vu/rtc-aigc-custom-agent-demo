const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("stream");
const {
  TtsClient,
  parseTtsLine,
  parseTts3Line,
  TTS_V3_ENDPOINT_BASE,
  END_CODE,
} = require("../lib/tts-client");
const { buildConfig } = require("../lib/config");

const baseEnv = {
  TTS_API_KEY: "tts-key",
  TTS_SPEAKER: "multi_female_sajiaoxuemei_v3_uranus_bigtts",
};

function ttsConfig(overrides = {}) {
  return buildConfig({ ...baseEnv, ...overrides });
}

function responseBody(lines) {
  return Readable.from(lines.map((line) => Buffer.from(`${line}\n`)));
}

test("parses base64 audio and end marker", () => {
  const audio = parseTtsLine(
    JSON.stringify({ code: 0, data: Buffer.from([1, 2, 3]).toString("base64") })
  );
  assert.equal(audio.type, "audio");
  assert.deepEqual([...audio.buffer], [1, 2, 3]);
  assert.equal(parseTtsLine(JSON.stringify({ code: END_CODE })).type, "end");
});

test("rejects provider errors", () => {
  assert.throws(
    () =>
      parseTtsLine(
        JSON.stringify({ code: 45000001, message: "invalid speaker" })
      ),
    /TTS 错误/
  );
});

test("parses SeedTTS 3.0 JSONL events", () => {
  assert.equal(
    parseTts3Line(JSON.stringify({ event: "ready", session_id: "s" })).type,
    "ready"
  );
  const audio = parseTts3Line(
    JSON.stringify({
      event: "audio",
      audio: Buffer.from([4, 5, 6]).toString("base64"),
    })
  );
  assert.equal(audio.type, "audio");
  assert.deepEqual([...audio.buffer], [4, 5, 6]);
  assert.equal(
    parseTts3Line(
      JSON.stringify({ event: "final", is_final: true, reason: "closed" })
    ).type,
    "end"
  );
  assert.equal(
    parseTts3Line(JSON.stringify({ event: "alignment", words: [] })).type,
    "alignment"
  );
});

test("rejects SeedTTS 3.0 error events with request id", () => {
  assert.throws(
    () =>
      parseTts3Line(
        JSON.stringify({
          event: "error",
          error: { code: "InvalidVoice", message: "voice not granted" },
          request_id: "req-1",
        })
      ),
    /TTS 错误：code=InvalidVoice message=voice not granted request_id=req-1/
  );
});

test("builds SeedTTS 3.0 URL, headers, body and streams audio", async () => {
  const config = ttsConfig({
    TTS_INSTRUCTIONS: '["甜而亲密，轻声撒娇","带一点占有欲"]',
  });
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      body: responseBody([
        JSON.stringify({ event: "ready", session_id: "session-1" }),
        JSON.stringify({
          event: "audio",
          audio: Buffer.from([1, 2]).toString("base64"),
        }),
        JSON.stringify({
          event: "audio",
          audio: Buffer.from([3, 4]).toString("base64"),
        }),
        JSON.stringify({ event: "final", is_final: true }),
      ]),
    };
  };
  const client = new TtsClient(config, { fetchImpl });
  const chunks = [];
  const result = await client.synthesize("[happy] 你回来啦。", {
    sessionId: "turn-1",
    onChunk: async (chunk) => chunks.push(chunk),
  });

  assert.equal(
    captured.url,
    `${TTS_V3_ENDPOINT_BASE}/multi_female_sajiaoxuemei_v3_uranus_bigtts/streaming`
  );
  assert.equal(captured.options.headers["X-Api-Key"], "tts-key");
  assert.equal(captured.options.headers["X-Api-Resource-Id"], undefined);
  assert.equal(captured.options.headers["X-Request-Id"], result.requestId);
  const body = JSON.parse(captured.options.body);
  assert.equal(body.text, "[happy] 你回来啦。");
  assert.equal(body.model_id, "doubao-seed-tts-3.0");
  assert.equal(body.language_code, "zh");
  assert.equal(body.session_id, "turn-1");
  assert.deepEqual(body.output_format, { format: "pcm", sample_rate: 24000 });
  assert.deepEqual(body.voice_settings.instructions, [
    "甜而亲密，轻声撒娇",
    "带一点占有欲",
  ]);
  assert.equal(result.apiVersion, "3.0");
  assert.equal(result.chunks, 2);
  assert.equal(result.bytes, 4);
  assert.equal(result.ended, true);
  assert.deepEqual(Buffer.concat(chunks), Buffer.from([1, 2, 3, 4]));
});

test("keeps the Doubao TTS 2.0 request shape behind the version switch", async () => {
  const config = ttsConfig({
    TTS_API_VERSION: "2.0",
    TTS_SPEAKER: "zh_female_vv_uranus_bigtts",
  });
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      body: responseBody([JSON.stringify({ code: END_CODE })]),
    };
  };
  const client = new TtsClient(config, { fetchImpl });
  await client.synthesize("你好", { sessionId: "ignored" });

  assert.equal(
    captured.url,
    "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
  );
  assert.equal(captured.options.headers["X-Api-Resource-Id"], "seed-tts-2.0");
  const body = JSON.parse(captured.options.body);
  assert.equal(body.req_params.text, "你好");
  assert.equal(body.req_params.speaker, "zh_female_vv_uranus_bigtts");
  assert.equal(body.session_id, undefined);
});
