/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const fs = require("fs");
const path = require("path");
const Koa = require("koa");
const bodyParser = require("koa-bodyparser");
const cors = require("koa2-cors");
const { v4: uuidv4 } = require("uuid");
const KoaSend = require("koa-send");
const { MmpgClient } = require("./mmpg-client");
const { TurnController } = require("./turn-controller");
const { ArkAgent } = require("./ark-agent");
const { TtsClient } = require("./tts-client");
const { BotConfigResolver } = require("./bot-config");
const { SessionStore } = require("./session-store");
const { createRtcToken } = require("./rtc-token");
const { configIssues, publicConfigStatus } = require("./config");
const { appendInlineTagGuide } = require("./inline-tags");

function loadScenes(sceneDir) {
  const scenes = {};
  for (const name of fs.readdirSync(sceneDir)) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const data = JSON.parse(fs.readFileSync(path.join(sceneDir, name), "utf8"));
    scenes[name.replace(/\.json$/, "")] = data.SceneConfig ? data : data;
  }
  return scenes;
}

function publicScene(sceneId, definition, config, bot) {
  const scene = definition.SceneConfig || definition;
  return {
    id: sceneId,
    icon: scene.icon || "",
    name: scene.name || sceneId,
    description: scene.description || "",
    questions: Array.isArray(scene.questions) ? scene.questions : [],
    botName: bot?.name || scene.botName || config.bot.name || "AI 陪伴",
    botId: bot?.id || config.bot.id || null,
    isVision: false,
    isScreenMode: false,
    isInterruptMode: true,
    isAvatarScene: false,
    avatarBgUrl: "",
    llmModel: config.ark.model,
    ttsSpeaker: config.tts.speaker,
  };
}

async function serveStatic(ctx, config) {
  const relativePath = ctx.path.replace(/^\/rtc-demo\/?/, "") || "index.html";
  const safePath = path.posix.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const sendOptions = {
    root: config.publicDir,
    // Deployments replace index.html without cleaning old precompressed
    // sidecars; never let a stale index.html.gz override the fresh entry.
    gzip: false,
    brotli: false,
  };
  const isIndex = safePath === "index.html";
  try {
    await KoaSend(ctx, safePath, {
      ...sendOptions,
      index: "index.html",
      maxage: 1000 * 60 * 60 * 12,
      immutable: false,
    });
    if (isIndex) {
      ctx.set("Cache-Control", "no-store");
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      await KoaSend(ctx, "index.html", sendOptions);
      ctx.set("Cache-Control", "no-store");
      return;
    }
    throw error;
  }
}

function routePath(ctx) {
  return ctx.path.replace(/^\/rtc-demo/, "") || "/";
}

function buildMmpgSession({ config, roomId, userId, agentUserId, bot }) {
  const botConfig = bot?.config || {};
  const botAudio = botConfig.AudioConfig || {};
  const botFormat = botAudio.AudioFormat || {};
  const botVad = botAudio.VADConfig || {};
  const botAsr = botConfig.ASRConfig || {};
  const botAsrParams = botAsr.ProviderParams || {};
  const botCredential = botAsrParams.Credential || {};
  const streamMode = Number.isInteger(botAsrParams.StreamMode)
    ? botAsrParams.StreamMode
    : 0;
  const resourceId =
    config.asr.resourceId ||
    botAsrParams.ApiResourceId ||
    botCredential.ApiResourceId ||
    "";
  const providerParams = {
    Mode: botAsrParams.Mode || "bigmodel",
    ApiKey: config.asr.apiKey,
    ApiResourceId: resourceId,
    StreamMode: streamMode,
  };
  const volcanoParams = config.asr.volcanoParams;
  if (volcanoParams) {
    providerParams.VolcanoASRParameters = volcanoParams;
  }

  return {
    AgentConfig: {
      TransmitConfig: {
        Type: "rtc",
        AppId: config.rtc.appId,
        RoomId: roomId,
        UserId: agentUserId,
        TargetUserId: [userId],
        ...(config.rtc.businessId
          ? { BusinessId: config.rtc.businessId }
          : {}),
      },
      IdleTimeout: 180,
      TurnDetectionMode: 0,
      SubtitleConfig: {
        DisableRTSSubtitle: true,
        UserTranscriptMode: 1,
      },
    },
    AudioConfig: {
      AudioFormat: {
        UserAudioFormat: botFormat.UserAudioFormat || "pcm16",
        AssistantAudioFormat: botFormat.AssistantAudioFormat || "pcm24",
        AnsMode: 0,
      },
      UserAudioCallbackMode: 0,
      VADConfig: {
        SilenceTime: botVad.SilenceTime || 600,
        ForceBeginThreshold: 200,
        ForceEnd: false,
        ExpireTime: 2500,
        EnablePrefetch: true,
        AIVAD: true,
      },
      VoicePrint: { Mode: 0 },
      VolumeGain: 1.0,
      FarfieldConfig: { Enable: false },
    },
    VisionConfig: { Enable: false },
    ASRConfig: {
      Provider: "volcano",
      ProviderParams: providerParams,
    },
  };
}

function envelope(action, result) {
  return {
    ResponseMetadata: {
      Action: action,
      RequestId: uuidv4(),
    },
    Result: result,
  };
}

function errorEnvelope(action, error) {
  return {
    ResponseMetadata: {
      Action: action,
      RequestId: uuidv4(),
      Error: {
        Code: error.code || "-1",
        Message: error.message || String(error),
      },
    },
  };
}

function createLogger(logger) {
  return logger || console;
}

function createApp({
  config,
  sceneDir = path.join(__dirname, "../scenes"),
  store = new SessionStore(),
  botResolver,
  agentFactory,
  ttsFactory,
  mmpgFactory,
  logger = console,
  now = Date.now,
} = {}) {
  const log = createLogger(logger);
  const scenes = loadScenes(sceneDir);
  const resolver =
    botResolver ||
    new BotConfigResolver(config, { logger: log, now });
  const makeAgent = agentFactory || ((cfg) => new ArkAgent(cfg, { logger: log }));
  const makeTts = ttsFactory || ((cfg) => new TtsClient(cfg, { logger: log }));
  const makeMmpg =
    mmpgFactory ||
    ((cfg) =>
      new MmpgClient(cfg, {
        logger: log,
        now,
      }));

  const stopCall = async (session, call, reason = "stop") => {
    if (!call || call.stopping || call.stopped) {
      return;
    }
    call.stopping = true;
    try {
      await call.controller?.close();
      await call.mmpg?.close();
    } catch (error) {
      log.warn?.("[CALL] 关闭会话时出现异常", error.message);
    } finally {
      call.stopped = true;
      call.stopReason = reason;
      store.clearActiveCall(session, call.id);
      log.info?.(`[CALL] 已结束 ${call.id}`);
    }
  };

  const stopAll = async () => {
    const calls = store.listActiveCalls();
    await Promise.allSettled(
      calls.map((call) => {
        const session = [...store.sessions.values()].find(
          (item) => item.activeCall?.id === call.id
        );
        return stopCall(session, call, "shutdown");
      })
    );
  };

  const app = new Koa();
  app.use(
    cors({
      origin: (ctx) => {
        const origin = ctx.get("Origin").trim();
        if (!origin) {
          return "";
        }
        if (
          config.allowedOrigins.includes(origin) ||
          /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin.trim())
        ) {
          return origin;
        }
        return "";
      },
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    })
  );
  app.use(bodyParser({ enableTypes: ["json", "form"] }));

  app.use(async (ctx, next) => {
    if (ctx.method === "GET" && ctx.path === "/health") {
      const issues = configIssues(config);
      ctx.status = 200;
      ctx.body = {
        ok: issues.length === 0,
        service: "rtc-aigc-custom-agent-demo",
        now: new Date(now()).toISOString(),
        config: publicConfigStatus(config),
        issues,
        activeCalls: store.listActiveCalls().length,
        bot: {
          id: config.bot.id || null,
          name: config.bot.name || null,
        },
      };
      return;
    }

    if (ctx.method === "POST" && routePath(ctx) === "/getScenes") {
      const action = "getScenes";
      try {
        let bot = null;
        if (config.bot.id) {
          try {
            bot = await resolver.resolve();
          } catch (error) {
            log.warn?.("[BOT] 解析 BOT_ID 失败，暂用本地场景配置", error.message);
          }
        }
        const session = store.createPageSession({ scenes });
        const result = {
          SessionID: session.id,
          scenes: Object.entries(scenes).map(([sceneId, definition]) => ({
            scene: publicScene(sceneId, definition, config, bot),
          })),
        };
        ctx.body = envelope(action, result);
      } catch (error) {
        log.error?.("[APP] getScenes 失败", error);
        ctx.body = errorEnvelope(action, error);
      }
      return;
    }

    if (ctx.method === "POST" && routePath(ctx) === "/session/start") {
      const action = "StartSession";
      const body = ctx.request.body || {};
      const sessionId = body.SessionID || body.sessionId;
      const sceneId = body.SceneID || body.sceneId;
      const session = store.get(sessionId);
      if (!session) {
        ctx.body = errorEnvelope(action, new Error("会话不存在或已过期，请刷新页面"));
        return;
      }
      const definition = session.scenes[sceneId];
      if (!definition) {
        ctx.body = errorEnvelope(action, new Error(`未知场景 ${sceneId}`));
        return;
      }
      const issues = configIssues(config);
      if (issues.length) {
        ctx.body = errorEnvelope(action, new Error(issues.join("；")));
        return;
      }
      if (session.startPromise) {
        ctx.body = errorEnvelope(action, new Error("会话正在启动，请稍候"));
        return;
      }
      session.startPromise = (async () => {
        if (session.activeCall) {
          await stopCall(session, session.activeCall, "replace");
        }
        const bot = config.bot.id ? await resolver.resolve() : null;
        const roomId = `demo_${uuidv4().replace(/-/g, "")}`;
        const userId = `web_${uuidv4().replace(/-/g, "")}`;
        const agentUserId = `agent_${uuidv4().replace(/-/g, "")}`;
        const rtcToken = createRtcToken({
          appId: config.rtc.appId,
          appKey: config.rtc.appKey,
          roomId,
          userId,
          ttlSeconds: 3600,
          now: now(),
        });
        const call = {
          id: `call_${uuidv4()}`,
          sessionId,
          sceneId,
          roomId,
          userId,
          agentUserId,
          startedAt: now(),
          stopping: false,
          stopped: false,
        };
        const mmpg = makeMmpg(config);
        call.mmpg = mmpg;
        const scene = definition.SceneConfig || definition;
        const callLogger = {
          info: (...args) => log.info?.(`[CALL ${call.id}]`, ...args),
          warn: (...args) => log.warn?.(`[CALL ${call.id}]`, ...args),
          error: (...args) => log.error?.(`[CALL ${call.id}]`, ...args),
        };
        const systemPrompt =
          config.tts.apiVersion === "3.0"
            ? appendInlineTagGuide(scene.systemPrompt)
            : scene.systemPrompt;
        const controller = new TurnController({
          sessionId: call.id,
          agentUserId,
          humanUserId: userId,
          systemPrompt,
          welcomeMessage: scene.welcomeMessage,
          agent: makeAgent(config),
          tts: makeTts(config),
          now,
          logger: callLogger,
          logTranscripts: config.logTranscripts,
          sendMmpgEvent: (type, payload) => mmpg.sendEvent(type, payload),
          sendCustom: (type, value) => {
            try {
              mmpg.sendEvent("assistant.message", {
                payload: JSON.stringify({ v: 1, type, value }),
              });
            } catch (error) {
              log.warn?.("[MMPG] 自定义消息发送失败", error.message);
            }
          },
        });
        call.controller = controller;
        mmpg.on("event", (event) => {
          controller.handleEvent(event);
        });
        mmpg.on("gatewayError", (error) => {
          controller.handleEvent({
            type: "error",
            message: error.message,
          });
        });
        mmpg.on("gatewayClose", () => {
          if (!call.stopping && !call.stopped) {
            controller
              .handleEvent({
                type: "error",
                message: "MMPG 连接已断开",
              })
              .finally(() => stopCall(session, call, "gateway_close"));
          }
        });

        try {
          await mmpg.connect();
          const mmpgSession = buildMmpgSession({
            config,
            roomId,
            userId,
            agentUserId,
            bot,
          });
          await mmpg.createSession(mmpgSession);
        } catch (error) {
          await mmpg.close().catch(() => {});
          throw error;
        }
        store.setActiveCall(session, call);
        controller.start();
        log.info?.("[CALL] 已创建", {
          callId: call.id,
          roomId,
          agentUserId,
          sceneId,
          botId: bot?.id || null,
        });
        return {
          callId: call.id,
          agentUserId,
          RTC: {
            AppId: config.rtc.appId,
            BusinessId: config.rtc.businessId || undefined,
            RoomId: roomId,
            UserId: userId,
            Token: rtcToken.token,
            ExpiresAt: rtcToken.expiresAt,
          },
          scene: publicScene(sceneId, definition, config, bot),
          botId: bot?.id || config.bot.id || null,
          botName:
            bot?.name ||
            config.bot.name ||
            (definition.SceneConfig || definition).botName ||
            null,
        };
      })();
      try {
        const result = await session.startPromise;
        ctx.body = envelope(action, result);
      } catch (error) {
        log.error?.("[APP] StartSession 失败", error);
        ctx.body = errorEnvelope(action, error);
      } finally {
        session.startPromise = null;
      }
      return;
    }

    if (ctx.method === "POST" && ctx.path === "/rtc-demo/session/stop" || routePath(ctx) === "/session/stop") {
      const action = "StopSession";
      const body = ctx.request.body || {};
      const sessionId = body.SessionID || body.sessionId;
      const session = store.get(sessionId);
      if (!session) {
        ctx.body = envelope(action, { stopped: false });
        return;
      }
      try {
        if (session.startPromise) {
          await session.startPromise.catch(() => {});
        }
        if (!session.activeCall) {
          ctx.body = envelope(action, { stopped: false });
          return;
        }
        const call = session.activeCall;
        await stopCall(session, call, body.reason || "user_stop");
        ctx.body = envelope(action, { stopped: true, callId: call.id });
      } catch (error) {
        log.error?.("[APP] StopSession 失败", error);
        ctx.body = errorEnvelope(action, error);
      }
      return;
    }

    if ((ctx.method === "GET" || ctx.method === "HEAD") && (ctx.path === "/rtc-demo" || ctx.path.startsWith("/rtc-demo/"))) {
      await serveStatic(ctx, config);
      return;
    }

    if (ctx.method === "GET" && routePath(ctx) === "/") {
      ctx.body = {
        name: "rtc-aigc-custom-agent-demo",
        endpoints: ["/health", "/getScenes", "/session/start", "/session/stop"],
      };
      return;
    }

    await next();
  });

  app.on("error", (error) => {
    log.error?.("[APP] 未捕获错误", error);
  });
  app.closeAll = stopAll;
  app.store = store;
  app.scenes = scenes;
  app.config = config;
  app.botResolver = resolver;
  return app;
}

module.exports = {
  createApp,
  loadScenes,
  publicScene,
  buildMmpgSession,
  envelope,
  errorEnvelope,
};
