const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { EventEmitter } = require("events");
const { buildConfig } = require("../lib/config");
const { createApp } = require("../lib/app");

const config = buildConfig({
  RTC_APP_ID: "123456789012345678901234",
  RTC_APP_KEY: "rtc-secret",
  VOLC_ACCESS_KEY_ID: "volc-ak",
  VOLC_SECRET_ACCESS_KEY: "volc-sk",
  ASR_APP_ID: "asr-app",
  ASR_ACCESS_TOKEN: "asr-secret",
  ASR_API_KEY: "speech-api-key",
  ASR_RESOURCE_ID: "volc.bigasr.sauc.duration",
  ARK_API_KEY: "ark-secret",
  TTS_API_KEY: "tts-secret",
  BOT_ID: "xbot-test",
  BOT_NAME: "测试 Bot",
});

class FakeMmpg extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
    this.closed = false;
    this.connected = false;
  }
  async connect() {
    this.connected = true;
  }
  async createSession(session) {
    this.session = session;
    return { type: "session.created" };
  }
  sendEvent(type, payload = {}) {
    this.sent.push({ type, ...payload });
  }
  async close() {
    this.closed = true;
  }
}

async function withServer(fn) {
  const mmpgs = [];
  const app = createApp({
    config,
    sceneDir: path.join(__dirname, "../scenes"),
    botResolver: {
      async resolve() {
        return {
          id: "xbot-test",
          name: "测试 Bot",
          config: {
            ASRConfig: {
              ProviderParams: {
                Mode: "bigmodel",
                Credential: { ApiResourceId: "volc.bigasr.sauc.duration" },
              },
            },
            AudioConfig: {
              AudioFormat: {
                UserAudioFormat: "pcm16",
                AssistantAudioFormat: "pcm24",
              },
            },
          },
        };
      },
    },
    agentFactory: () => ({ async reply() { return { text: "ok" }; } }),
    ttsFactory: () => ({ async synthesize() { return {}; } }),
    mmpgFactory: () => {
      const mmpg = new FakeMmpg();
      mmpgs.push(mmpg);
      return mmpg;
    },
    logger: { info() {}, warn() {}, error() {} },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ base, app, mmpgs });
  } finally {
    await app.closeAll();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function post(base, pathname, body) {
  const res = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

test("health and scenes do not expose credentials", async () => {
  await withServer(async ({ base }) => {
    const healthRes = await fetch(`${base}/health`);
    const healthText = await healthRes.text();
    assert.equal(healthRes.status, 200);
    for (const secret of ["rtc-secret", "volc-sk", "speech-api-key", "ark-secret", "tts-secret"]) {
      assert.equal(healthText.includes(secret), false);
    }
    const health = JSON.parse(healthText);
    assert.equal(health.ok, true);
    assert.equal(health.config.tts.apiKey, true);

    const scenes = await post(base, "/getScenes", {});
    assert.equal(scenes.ResponseMetadata.Action, "getScenes");
    assert.ok(scenes.Result.SessionID);
    assert.equal(scenes.Result.scenes[0].scene.botId, "xbot-test");
    assert.equal(scenes.Result.scenes[0].scene.rtc, undefined);
  });
});

test("start returns per-call RTC identity and stop is idempotent", async () => {
  await withServer(async ({ base, mmpgs }) => {
    const scenes = await post(base, "/getScenes", {});
    const sessionId = scenes.Result.SessionID;
    const sceneId = scenes.Result.scenes[0].scene.id;
    const started = await post(base, "/session/start", {
      SessionID: sessionId,
      SceneID: sceneId,
    });
    assert.equal(started.ResponseMetadata.Error, undefined);
    assert.match(started.Result.agentUserId, /^agent_/);
    assert.match(started.Result.RTC.RoomId, /^demo_/);
    assert.ok(started.Result.RTC.Token);
    assert.equal(started.Result.botId, "xbot-test");
    assert.equal(started.Result.botName, "测试 Bot");
    assert.equal(mmpgs[0].connected, true);
    assert.equal(mmpgs[0].session.ASRConfig.Provider, "volcano");
    assert.deepEqual(mmpgs[0].session.ASRConfig.ProviderParams, {
      Mode: "bigmodel",
      ApiKey: "speech-api-key",
      ApiResourceId: "volc.bigasr.sauc.duration",
      StreamMode: 0,
    });
    assert.equal(mmpgs[0].session.AgentConfig.TransmitConfig.RoomId, started.Result.RTC.RoomId);

    const stopped = await post(base, "/session/stop", { SessionID: sessionId });
    assert.equal(stopped.Result.stopped, true);
    assert.equal(mmpgs[0].closed, true);
    const stoppedAgain = await post(base, "/session/stop", { SessionID: sessionId });
    assert.equal(stoppedAgain.Result.stopped, false);
  });
});

test("gateway close clears the active call", async () => {
  await withServer(async ({ base, mmpgs }) => {
    const scenes = await post(base, "/getScenes", {});
    const sessionId = scenes.Result.SessionID;
    const sceneId = scenes.Result.scenes[0].scene.id;
    const started = await post(base, "/session/start", {
      SessionID: sessionId,
      SceneID: sceneId,
    });
    assert.equal(started.ResponseMetadata.Error, undefined);

    mmpgs[0].emit("gatewayClose", { code: 1006 });
    await new Promise((resolve) => setImmediate(resolve));

    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.activeCalls, 0);
    assert.equal(mmpgs[0].closed, true);
  });
});

test("buildMmpgSession inherits BotId ASR settings", () => {
  const { buildMmpgSession } = require("../lib/app");
  const bot = {
    id: "xbot-test",
    config: {
      ASRConfig: {
        ProviderParams: {
          Mode: "bigmodel",
          StreamMode: 0,
          Credential: { ApiResourceId: "volc.bigasr.sauc.duration" },
        },
      },
      AudioConfig: {
        AudioFormat: { UserAudioFormat: "pcm16", AssistantAudioFormat: "pcm24" },
        VADConfig: { SilenceTime: 600, AIVAD: false },
      },
    },
  };
  const inherited = buildMmpgSession({
    config,
    roomId: "room",
    userId: "web",
    agentUserId: "agent",
    bot,
  });
  assert.equal(inherited.ASRConfig.ProviderParams.Mode, "bigmodel");
  assert.equal(inherited.ASRConfig.ProviderParams.StreamMode, 0);
  assert.equal(inherited.ASRConfig.ProviderParams.ApiKey, "speech-api-key");
  assert.equal(
    inherited.ASRConfig.ProviderParams.ApiResourceId,
    "volc.bigasr.sauc.duration"
  );
  assert.equal(inherited.ASRConfig.ProviderParams.VolcanoASRParameters, undefined);
});
