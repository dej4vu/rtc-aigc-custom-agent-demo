/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const path = require("path");
const dotenv = require("dotenv");

const ROOT_DIR = path.resolve(__dirname, "../..");

function loadEnvFiles(env = process.env) {
  const files = [path.join(ROOT_DIR, ".env.local"), path.join(ROOT_DIR, ".env")];
  for (const file of files) {
    dotenv.config({ path: file, override: false, processEnv: env });
  }
  return env;
}

function read(env, ...names) {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function readNumber(env, name, fallback) {
  const raw = read(env, name);
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} 必须为数字`);
  }
  return value;
}

function readBoolean(env, name, fallback = false) {
  const raw = read(env, name);
  if (!raw) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function buildConfig(env = process.env) {
  const port = readNumber(env, "PORT", 3101);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("PORT 必须为 1-65535 的整数");
  }
  const asrVolcanoParams = read(env, "ASR_VOLCANO_PARAMS");
  if (asrVolcanoParams) {
    try {
      const parsed = JSON.parse(asrVolcanoParams);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("not an object");
      }
    } catch {
      throw new Error("ASR_VOLCANO_PARAMS 必须是合法的 JSON 对象字符串");
    }
  }

  const allowedOrigins = read(env, "ALLOWED_ORIGINS")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const asrResourceId =
    read(env, "ASR_RESOURCE_ID") ||
    "";
  return {
    env,
    rootDir: ROOT_DIR,
    publicDir:
      read(env, "PUBLIC_DIR") || path.join(ROOT_DIR, "server/public/build"),
    host: read(env, "HOST") || "127.0.0.1",
    port,
    allowedOrigins,
    logTranscripts: readBoolean(env, "LOG_TRANSCRIPTS", false),
    rtc: {
      appId: read(env, "RTC_APP_ID"),
      appKey: read(env, "RTC_APP_KEY"),
      businessId: read(env, "RTC_BUSINESS_ID"),
    },
    mmpg: {
      url: read(env, "MMPG_URL") || "wss://interactai.volcvideo.com/api/v2/mmpg",
      region: read(env, "MMPG_REGION") || "cn-north-1",
      service: read(env, "MMPG_SERVICE") || "rtc",
      accessKeyId: read(env, "VOLC_ACCESS_KEY_ID", "VOLCENGINE_ACCESS_KEY_ID"),
      secretAccessKey: read(
        env,
        "VOLC_SECRET_ACCESS_KEY",
        "VOLCENGINE_SECRET_ACCESS_KEY"
      ),
    },
    bot: {
      id: read(env, "BOT_ID"),
      name: read(env, "BOT_NAME"),
    },
    asr: {
      appId: read(env, "ASR_APP_ID"),
      accessToken: read(env, "ASR_ACCESS_TOKEN"),
      apiKey: read(env, "ASR_API_KEY"),
      resourceId: asrResourceId,
      volcanoParams: asrVolcanoParams,
    },
    ark: {
      apiKey: read(env, "ARK_API_KEY"),
      baseUrl:
        read(env, "ARK_BASE_URL") || "https://ark.cn-beijing.volces.com/api/v3",
      model: read(env, "ARK_MODEL") || "doubao-seed-character-260628",
      temperature: readNumber(env, "ARK_TEMPERATURE", 0.3),
      maxTokens: readNumber(env, "ARK_MAX_TOKENS", 512),
    },
    tts: {
      apiKey: read(env, "TTS_API_KEY"),
      resourceId: read(env, "TTS_RESOURCE_ID") || "seed-tts-2.0",
      speaker: read(env, "TTS_SPEAKER") || "zh_female_vv_uranus_bigtts",
      sampleRate: readNumber(env, "TTS_SAMPLE_RATE", 24000),
      format: read(env, "TTS_FORMAT") || "pcm",
    },
  };
}

function configIssues(config) {
  const issues = [];
  const requirePair = (a, b, label) => {
    if (Boolean(a) !== Boolean(b)) {
      issues.push(`${label} 必须同时配置`);
    }
  };
  requirePair(
    config.mmpg.accessKeyId,
    config.mmpg.secretAccessKey,
    "VOLC_ACCESS_KEY_ID / VOLC_SECRET_ACCESS_KEY"
  );
  if (!config.asr.apiKey) {
    issues.push("缺少 ASR_API_KEY");
  }

  const required = [
    [config.rtc.appId, "RTC_APP_ID"],
    [config.rtc.appKey, "RTC_APP_KEY"],
    [config.mmpg.accessKeyId, "VOLC_ACCESS_KEY_ID"],
    [config.mmpg.secretAccessKey, "VOLC_SECRET_ACCESS_KEY"],
    [config.bot.id, "BOT_ID"],
    [config.ark.apiKey, "ARK_API_KEY"],
    [config.tts.apiKey, "TTS_API_KEY"],
  ];
  for (const [value, name] of required) {
    if (!value) {
      issues.push(`缺少 ${name}`);
    }
  }
  if (!Number.isInteger(config.tts.sampleRate) || config.tts.sampleRate <= 0) {
    issues.push("TTS_SAMPLE_RATE 必须为正整数");
  }
  return issues;
}

function assertConfig(config) {
  const issues = configIssues(config);
  if (issues.length) {
    throw new Error(`配置不完整：${issues.join("；")}`);
  }
  return config;
}

function publicConfigStatus(config) {
  return {
    rtc: {
      appId: Boolean(config.rtc.appId),
      appKey: Boolean(config.rtc.appKey),
      businessId: Boolean(config.rtc.businessId),
    },
    mmpg: {
      url: config.mmpg.url,
      region: config.mmpg.region,
      service: config.mmpg.service,
      accessKey: Boolean(config.mmpg.accessKeyId),
      secretKey: Boolean(config.mmpg.secretAccessKey),
    },
    bot: {
      id: config.bot.id || null,
      name: config.bot.name || null,
      configured: Boolean(config.bot.id),
    },
    asr: {
      appId: Boolean(config.asr.appId),
      accessToken: Boolean(config.asr.accessToken),
      apiKey: Boolean(config.asr.apiKey),
      hasVolcanoParams: Boolean(config.asr.volcanoParams),
    },
    ark: {
      apiKey: Boolean(config.ark.apiKey),
      model: config.ark.model,
      baseUrl: config.ark.baseUrl,
    },
    tts: {
      apiKey: Boolean(config.tts.apiKey),
      resourceId: config.tts.resourceId,
      speaker: config.tts.speaker,
      sampleRate: config.tts.sampleRate,
      format: config.tts.format,
    },
    logTranscripts: config.logTranscripts,
  };
}

module.exports = {
  ROOT_DIR,
  loadEnvFiles,
  buildConfig,
  configIssues,
  assertConfig,
  publicConfigStatus,
};
