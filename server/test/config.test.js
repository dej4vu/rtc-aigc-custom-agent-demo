const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildConfig,
  configIssues,
  publicConfigStatus,
} = require("../lib/config");

const baseEnv = {
  RTC_APP_ID: "app-id",
  RTC_APP_KEY: "app-key",
  VOLC_ACCESS_KEY_ID: "ak",
  VOLC_SECRET_ACCESS_KEY: "sk",
  ASR_APP_ID: "asr-app",
  ASR_ACCESS_TOKEN: "asr-token",
  ASR_API_KEY: "speech-api-key",
  ARK_API_KEY: "ark-key",
  TTS_API_KEY: "tts-key",
  BOT_ID: "xbot-test",
};

test("buildConfig accepts VOLC_* aliases and reports no issues", () => {
  const config = buildConfig(baseEnv);
  assert.equal(config.mmpg.accessKeyId, "ak");
  assert.equal(config.mmpg.secretAccessKey, "sk");
  assert.equal(config.bot.id, "xbot-test");
  assert.deepEqual(configIssues(config), []);
});

test("buildConfig accepts VOLCENGINE_* legacy aliases", () => {
  const config = buildConfig({
    ...baseEnv,
    VOLC_ACCESS_KEY_ID: undefined,
    VOLC_SECRET_ACCESS_KEY: undefined,
    VOLCENGINE_ACCESS_KEY_ID: "legacy-ak",
    VOLCENGINE_SECRET_ACCESS_KEY: "legacy-sk",
  });
  assert.equal(config.mmpg.accessKeyId, "legacy-ak");
  assert.equal(config.mmpg.secretAccessKey, "legacy-sk");
});

test("missing provider credentials are reported without leaking values", () => {
  const config = buildConfig({
    ...baseEnv,
    ASR_APP_ID: "",
    TTS_API_KEY: "",
  });
  const issues = configIssues(config);
  assert.ok(issues.some((item) => item.includes("TTS_API_KEY")));
  const health = JSON.stringify(publicConfigStatus(config));
  assert.equal(health.includes("speech-api-key"), false);
  assert.equal(health.includes("ark-key"), false);
  assert.equal(health.includes("tts-key"), false);
});

test("accepts optional ASR stream settings and rejects invalid values", () => {
  const config = buildConfig({
    ...baseEnv,
    ASR_API_KEY: "speech-api-key",
    ASR_RESOURCE_ID: "volc.seedasr.sauc.duration",
    ASR_VOLCANO_PARAMS: '{"request":{"end_window_size":500}}',
  });
  assert.equal(config.asr.volcanoParams, '{"request":{"end_window_size":500}}');
  assert.deepEqual(configIssues(config), []);

  assert.throws(
    () => buildConfig({ ...baseEnv, ASR_VOLCANO_PARAMS: "not-json" }),
    /ASR_VOLCANO_PARAMS/
  );
});

test("requires the current ASR API key", () => {
  const config = buildConfig({
    ...baseEnv,
    ASR_APP_ID: "",
    ASR_ACCESS_TOKEN: "",
    ASR_API_KEY: "",
  });
  const issues = configIssues(config);
  assert.ok(issues.includes("缺少 ASR_API_KEY"));
});

test("requires BOT_ID for the console-managed agent", () => {
  const config = buildConfig({
    ...baseEnv,
    BOT_ID: "",
  });
  assert.ok(configIssues(config).includes("缺少 BOT_ID"));
});

test("accepts an ASR API key without the legacy AppId pair", () => {
  const config = buildConfig({
    ...baseEnv,
    ASR_APP_ID: "",
    ASR_ACCESS_TOKEN: "",
    ASR_API_KEY: "speech-api-key",
  });
  assert.deepEqual(configIssues(config), []);
  assert.equal(config.asr.apiKey, "speech-api-key");
});

test("defaults to SeedTTS 3.0 with the yandere companion voice", () => {
  const config = buildConfig(baseEnv);
  assert.equal(config.tts.apiVersion, "3.0");
  assert.equal(config.tts.modelId, "doubao-seed-tts-3.0");
  assert.equal(config.tts.languageCode, "zh");
  assert.equal(config.tts.enableSubtitle, true);
  assert.equal(
    config.tts.speaker,
    "multi_female_sajiaoxuemei_v3_uranus_bigtts"
  );
  assert.deepEqual(config.tts.instructions, [
    "甜软、亲密、轻声撒娇，表面温柔，藏着一点占有欲和危险感",
  ]);
  assert.equal(publicConfigStatus(config).tts.apiVersion, "3.0");
  assert.equal(publicConfigStatus(config).tts.instructionCount, 1);
});

test("parses TTS instructions as a JSON string array", () => {
  const config = buildConfig({
    ...baseEnv,
    TTS_INSTRUCTIONS: '[" 甜而亲密 ","轻声撒娇"]',
    TTS_SPEED: "0.94",
    TTS_PITCH: "1",
  });
  assert.deepEqual(config.tts.instructions, ["甜而亲密", "轻声撒娇"]);
  assert.equal(config.tts.speed, 0.94);
  assert.throws(
    () => buildConfig({ ...baseEnv, TTS_INSTRUCTIONS: "甜而亲密" }),
    /TTS_INSTRUCTIONS/
  );
  assert.throws(
    () => buildConfig({ ...baseEnv, TTS_INSTRUCTIONS: '["ok", 1]' }),
    /TTS_INSTRUCTIONS/
  );
});

test("supports the 2.0 fallback and rejects unknown API versions", () => {
  const config = buildConfig({ ...baseEnv, TTS_API_VERSION: "2.0" });
  assert.equal(config.tts.apiVersion, "2.0");
  assert.equal(config.tts.speaker, "zh_female_vv_uranus_bigtts");
  assert.throws(
    () => buildConfig({ ...baseEnv, TTS_API_VERSION: "1.0" }),
    /TTS_API_VERSION/
  );
});
