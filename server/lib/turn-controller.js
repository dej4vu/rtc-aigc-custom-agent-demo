/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const { v4: uuidv4 } = require("uuid");
const { createSentenceSegmenter } = require("./sentence-segmenter");

const STAGE = {
  UNKNOWN: 0,
  LISTENING: 1,
  THINKING: 2,
  SPEAKING: 3,
  INTERRUPTED: 4,
  FINISHED: 5,
};

function mergeTranscript(current, next) {
  if (!next) {
    return current;
  }
  if (!current || next.startsWith(current)) {
    return next;
  }
  if (current.endsWith(next)) {
    return current;
  }
  return `${current}${next}`;
}

function sanitizeForSpeech(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_#>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePayload(payload) {
  if (!payload) {
    return null;
  }
  if (typeof payload === "object") {
    return payload;
  }
  try {
    let parsed = JSON.parse(payload);
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
    return parsed;
  } catch {
    return { type: payload };
  }
}

class TurnController {
  constructor({
    sessionId,
    agentUserId,
    humanUserId,
    systemPrompt,
    welcomeMessage,
    agent,
    tts,
    sendMmpgEvent,
    sendCustom,
    logger = console,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    historyLimit = 10,
    completionTimeoutMs = 30000,
    readyTimeoutMs = 5000,
    logTranscripts = false,
  }) {
    this.sessionId = sessionId;
    this.agentUserId = agentUserId;
    this.humanUserId = humanUserId;
    this.welcomeMessage = welcomeMessage || "";
    this.agent = agent;
    this.tts = tts;
    this.sendMmpgEvent = sendMmpgEvent;
    this.sendCustom = sendCustom;
    this.logger = logger;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.historyLimit = historyLimit;
    this.completionTimeoutMs = completionTimeoutMs;
    this.readyTimeoutMs = readyTimeoutMs;
    this.logTranscripts = logTranscripts;

    this.status = "IDLE";
    this.respId = 0;
    this.convId = "";
    this.userTranscript = "";
    this.userConversationStartedAt = 0;
    this.activeTurn = null;
    this.ttsQueue = [];
    this.ttsDraining = false;
    this.ready = false;
    this.welcomeStarted = false;
    this.closed = false;
    this.chain = Promise.resolve();
    this.readyTimer = null;
    this.messages = [];
    if (systemPrompt) {
      this.messages.push({ role: "system", content: systemPrompt });
    }
  }

  start() {
    this.readyTimer = this.setTimer(() => {
      if (!this.ready) {
        this.trace("client.ready.timeout", {
          detail: "客户端未在预期时间内上报 client.ready",
        });
      }
    }, this.readyTimeoutMs);
  }

  handleEvent(event) {
    this.chain = this.chain
      .then(() => this._handleEvent(event))
      .catch((error) => {
        this.logger.error?.("[TURN] 事件处理失败", error);
        this.trace("error", { detail: error.message });
      });
    return this.chain;
  }

  async _handleEvent(event) {
    if (!event || typeof event.type !== "string") {
      return;
    }
    if (this.closed && event.type !== "assistant.audio.canceled") {
      return;
    }
    switch (event.type) {
      case "session.created":
        this.trace("mmpg.session.created");
        break;
      case "user.conversation.created": {
        this.convId = event.conv_id || this.convId;
        this.userTranscript = "";
        this.userConversationStartedAt = this.now();
        if (!this.activeTurn && this.status !== "SPEAKING") {
          this.setStatus("LISTENING");
          this.sendStage(STAGE.LISTENING, "listening");
        }
        this.trace("asr.conversation.created");
        break;
      }
      case "user.audio.transcription.started":
        this.convId = event.conv_id || this.convId;
        if (this.activeTurn && !this.activeTurn.finished) {
          await this.cancelCurrent("barge_in");
        } else {
          this.setStatus("LISTENING");
          this.sendStage(STAGE.LISTENING, "listening");
        }
        this.trace("asr.started");
        break;
      case "user.audio.transcription.delta": {
        this.convId = event.conv_id || this.convId;
        this.userTranscript = mergeTranscript(
          this.userTranscript,
          event.transcript || ""
        );
        this.sendSubtitle({
          text: this.userTranscript,
          userId: this.humanUserId,
          definite: false,
          paragraph: false,
        });
        break;
      }
      case "user.audio.transcription.segment": {
        this.convId = event.conv_id || this.convId;
        const segment = event.transcript || "";
        this.userTranscript = segment.startsWith(this.userTranscript)
          ? segment
          : mergeTranscript(this.userTranscript, segment);
        this.sendSubtitle({
          text: this.userTranscript,
          userId: this.humanUserId,
          definite: false,
          paragraph: false,
        });
        break;
      }
      case "user.audio.transcription.done": {
        this.convId = event.conv_id || this.convId;
        const transcript = (event.transcript || this.userTranscript || "").trim();
        this.userTranscript = "";
        if (!transcript) {
          this.setStatus("LISTENING");
          this.trace("asr.empty");
          break;
        }
        this.sendSubtitle({
          text: transcript,
          userId: this.humanUserId,
          definite: true,
          paragraph: true,
        });
        this.trace("asr.done", {
          latencyMs: this.userConversationStartedAt
            ? this.now() - this.userConversationStartedAt
            : undefined,
          detail: this.logTranscripts ? transcript : undefined,
        });
        this.logger.info?.("[TEXT][ASR->LLM]", {
          callId: this.sessionId,
          convId: this.convId,
          user: this.humanUserId,
          text: transcript,
        });
        this.startReplyTurn(transcript);
        break;
      }
      case "user.conversation.done":
        if (!this.activeTurn) {
          this.setStatus("LISTENING");
        }
        break;
      case "user.conversation.canceled":
        if (event.reason === "speaker_mismatch") {
          this.trace("asr.canceled.speaker_mismatch");
          break;
        }
        if (!this.activeTurn) {
          this.setStatus("LISTENING");
        }
        this.userTranscript = "";
        this.trace("asr.canceled", { detail: event.reason || "canceled" });
        break;
      case "assistant.audio.started":
        this.onPlaybackStarted(event);
        break;
      case "assistant.audio.done":
        this.onPlaybackDone(event);
        break;
      case "assistant.audio.canceled":
        this.onPlaybackCanceled(event);
        break;
      case "user.message":
        await this.onUserMessage(event);
        break;
      case "error":
      case "session.error":
        this.logger.error?.("[TURN] MMPG error", {
          event_id: event.event_id,
          message: event.message,
        });
        this.trace("error", { detail: event.message || "MMPG error" });
        await this.cancelCurrent("gateway_error");
        this.setStatus("IDLE");
        break;
      default:
        break;
    }
  }

  async onUserMessage(event) {
    const payload = parsePayload(event.payload);
    const type = payload?.type || event.type;
    if (type === "client.ready") {
      await this.onClientReady(payload);
      return;
    }
    if (type === "client.bye") {
      this.trace("client.bye");
      return;
    }
    if (type === "client.interrupt") {
      await this.cancelCurrent("manual_interrupt");
      this.setStatus("LISTENING");
      this.sendStage(STAGE.LISTENING, "manual_interrupt");
      return;
    }
    if (type === "client.trace") {
      this.trace("client.trace", { detail: payload.value });
    }
    if (type === "client.interrupt" || payload?.Command === "interrupt") {
      await this.cancelCurrent("user_click");
    }
  }

  async onClientReady(payload = {}) {
    if (!this.ready) {
      this.ready = true;
      if (this.readyTimer) {
        this.clearTimer(this.readyTimer);
        this.readyTimer = null;
      }
      this.trace("client.ready", { detail: payload.value });
      this.sendStage(STAGE.LISTENING, "listening");
    }
    if (!this.welcomeStarted && this.welcomeMessage) {
      this.welcomeStarted = true;
      this.startWelcome();
    }
  }

  startWelcome() {
    if (this.closed || !this.welcomeMessage) {
      return;
    }
    const turn = this.createTurn({ kind: "welcome", convId: "" });
    turn.llmDone = true;
    turn.text = this.welcomeMessage;
    this.setStatus("SPEAKING");
    this.sendStage(STAGE.SPEAKING, "welcome");
    this.sendSubtitle({
      text: this.welcomeMessage,
      userId: this.agentUserId,
      definite: true,
      paragraph: true,
    });
    this.enqueueTts(turn, this.welcomeMessage);
  }

  startReplyTurn(transcript) {
    if (this.closed) {
      return;
    }
    this.messages.push({ role: "user", content: transcript });
    this.trimMessages();
    const turn = this.createTurn({ kind: "reply", convId: this.convId });
    this.setStatus("THINKING");
    this.sendStage(STAGE.THINKING, "thinking");
    this.runAgent(turn).catch((error) => {
      if (error?.name === "AbortError" || turn.cancelled) {
        return;
      }
      this.logger.error?.("[TURN] Agent 失败", error);
      this.trace("error", { detail: error.message });
      this.sendStage(STAGE.FINISHED, "agent_error");
      this.setStatus("IDLE");
    });
  }

  createTurn({ kind, convId }) {
    this.respId += 1;
    const turn = {
      id: uuidv4(),
      kind,
      convId,
      respId: this.respId,
      startedAt: this.now(),
      firstAudioAt: 0,
      firstTokenAt: 0,
      text: "",
      cancelled: false,
      finished: false,
      llmDone: false,
      sentAudioDone: false,
      abort: new AbortController(),
      finishTimer: null,
    };
    this.activeTurn = turn;
    return turn;
  }

  async runAgent(turn) {
    const segmenter = createSentenceSegmenter({ maxLength: 80 });
    let firstToken = true;

    const result = await this.agent.reply({
      messages: this.messages,
      signal: turn.abort.signal,
      onDelta: async (delta, meta = {}) => {
        if (turn.cancelled) {
          return;
        }
        if (firstToken) {
          firstToken = false;
          turn.firstTokenAt = this.now();
          this.trace("llm.first_token", {
            latencyMs: meta.firstTokenLatencyMs,
          });
        }
        turn.text += delta;
        this.sendSubtitle({
          text: turn.text,
          userId: this.agentUserId,
          definite: false,
          paragraph: false,
        });
        for (const sentence of segmenter.push(delta)) {
          this.enqueueTts(turn, sentence);
        }
      },
    });

    if (turn.cancelled) {
      return;
    }
    for (const sentence of segmenter.flush()) {
      this.enqueueTts(turn, sentence);
    }
    if (!turn.text && result?.text) {
      turn.text = result.text;
    }
    turn.llmDone = true;
    this.logger.info?.("[TEXT][LLM->TTS]", {
      callId: this.sessionId,
      respId: turn.respId,
      agent: this.agentUserId,
      text: turn.text.trim(),
    });
    this.trace("llm.done", {
      latencyMs: this.now() - turn.startedAt,
    });
    if (turn.text.trim()) {
      this.messages.push({ role: "assistant", content: turn.text.trim() });
      this.trimMessages();
      this.sendSubtitle({
        text: turn.text,
        userId: this.agentUserId,
        definite: true,
        paragraph: true,
      });
    } else {
      this.trace("llm.empty");
      this.sendStage(STAGE.FINISHED, "empty_reply");
      this.setStatus("IDLE");
    }
    this.drainTtsQueue();
  }

  enqueueTts(turn, text) {
    const speech = sanitizeForSpeech(text);
    if (!speech || turn.cancelled || turn.finished) {
      return;
    }
    this.ttsQueue.push({ turn, text: speech });
    this.drainTtsQueue();
  }

  async drainTtsQueue() {
    if (this.ttsDraining) {
      return;
    }
    this.ttsDraining = true;
    try {
      while (this.ttsQueue.length) {
        const job = this.ttsQueue.shift();
        if (job.turn.cancelled || job.turn.finished) {
          continue;
        }
        await this.speakJob(job.turn, job.text);
      }
    } finally {
      this.ttsDraining = false;
    }
    const turn = this.activeTurn;
    if (
      turn &&
      turn.llmDone &&
      !turn.cancelled &&
      !turn.finished &&
      !turn.sentAudioDone
    ) {
      await this.sendAudio(turn, Buffer.alloc(0), true);
      turn.sentAudioDone = true;
      this.armFinishTimer(turn);
    }
  }

  async speakJob(turn, text) {
    let pending = null;
    try {
      this.logger.info?.("[TEXT][TTS->TTS-REQUEST]", {
        callId: this.sessionId,
        respId: turn.respId,
        agent: this.agentUserId,
        text,
      });
      await this.tts.synthesize(text, {
        signal: turn.abort.signal,
        onChunk: async (buffer) => {
          if (turn.cancelled || turn.finished || !buffer?.length) {
            return;
          }
          if (!turn.firstAudioAt) {
            turn.firstAudioAt = this.now();
            this.trace("tts.first_chunk", {
              latencyMs: turn.firstAudioAt - turn.startedAt,
            });
            this.setStatus("SPEAKING");
            this.sendStage(STAGE.SPEAKING, "speaking");
          }
          if (pending) {
            await this.sendAudio(turn, pending, false);
          }
          pending = buffer;
        },
      });
    } catch (error) {
      if (turn.cancelled || error?.name === "AbortError") {
        return;
      }
      this.logger.error?.("[TURN] TTS 失败", error);
      this.trace("error", { detail: `tts: ${error.message}` });
      this.sendStage(STAGE.FINISHED, "tts_error");
      this.setStatus("IDLE");
      turn.finished = true;
      return;
    }
    if (turn.cancelled || turn.finished || !pending) {
      return;
    }
    const isFinal = turn.llmDone && this.ttsQueue.length === 0;
    await this.sendAudio(turn, pending, isFinal);
    if (isFinal) {
      turn.sentAudioDone = true;
      this.armFinishTimer(turn);
    }
  }

  async sendAudio(turn, buffer, done) {
    if (turn.cancelled || turn.finished) {
      return;
    }
    await this.sendMmpgEvent("assistant.audio.delta", {
      resp_id: turn.respId,
      payload: buffer.length ? buffer.toString("base64") : "",
      done: Boolean(done),
    });
  }

  armFinishTimer(turn) {
    if (turn.finishTimer) {
      this.clearTimer(turn.finishTimer);
    }
    turn.finishTimer = this.setTimer(() => {
      this.finishTurn(turn, "timeout");
    }, Math.min(this.completionTimeoutMs, 5000));
  }

  onPlaybackStarted(event) {
    const turn = this.activeTurn;
    if (!turn || turn.respId !== event.resp_id || turn.finished) {
      return;
    }
    this.setStatus("SPEAKING");
    this.sendStage(STAGE.SPEAKING, "speaking");
    this.trace("playback.started", {
      latencyMs: turn.startedAt ? this.now() - turn.startedAt : undefined,
    });
  }

  onPlaybackDone(event) {
    const turn = this.activeTurn;
    if (!turn || turn.respId !== event.resp_id) {
      return;
    }
    this.trace("playback.done", {
      latencyMs: turn.startedAt ? this.now() - turn.startedAt : undefined,
    });
    this.finishTurn(turn, "audio_done");
  }

  onPlaybackCanceled(event) {
    const turn = this.activeTurn;
    if (turn && turn.respId === event.resp_id) {
      this.trace("playback.canceled", {
        latencyMs: turn.startedAt ? this.now() - turn.startedAt : undefined,
      });
    }
  }

  finishTurn(turn, reason) {
    if (!turn || turn.finished) {
      return;
    }
    turn.finished = true;
    if (turn.finishTimer) {
      this.clearTimer(turn.finishTimer);
      turn.finishTimer = null;
    }
    if (this.activeTurn?.id === turn.id) {
      this.activeTurn = null;
    }
    this.setStatus("FINISHED");
    this.sendStage(STAGE.FINISHED, reason);
    this.trace("turn.finished", { detail: reason });
  }

  async cancelCurrent(reason) {
    const turn = this.activeTurn;
    if (!turn || turn.finished) {
      return false;
    }
    turn.cancelled = true;
    try {
      turn.abort.abort();
    } catch {
      // Ignore abort failures.
    }
    if (turn.finishTimer) {
      this.clearTimer(turn.finishTimer);
      turn.finishTimer = null;
    }
    this.ttsQueue.length = 0;
    this.respId = Math.max(this.respId, turn.respId) + 1;
    this.activeTurn = null;
    try {
      await this.sendMmpgEvent("assistant.audio.cancel", {});
    } catch (error) {
      this.logger.warn?.("[TURN] 发送 assistant.audio.cancel 失败", error.message);
    }
    this.setStatus("INTERRUPTED");
    this.sendStage(STAGE.INTERRUPTED, reason || "interrupted");
    this.trace("barge_in", { detail: reason || "interrupted" });
    return true;
  }

  setStatus(status) {
    this.status = status;
  }

  sendStage(code, description) {
    this.sendCustom("conv", {
      Stage: { Code: code, Description: description },
    });
  }

  sendSubtitle({ text, userId, definite, paragraph }) {
    if (!text || !userId) {
      return;
    }
    this.sendCustom("subv", {
      data: [{ text, userId, definite, paragraph }],
    });
  }

  trace(stage, { latencyMs, detail } = {}) {
    const entry = {
      stage,
      convId: this.convId || null,
      respId: this.activeTurn?.respId || null,
      at: new Date(this.now()).toISOString(),
      latencyMs: Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : null,
      detail: detail ?? null,
      status: this.status,
    };
    this.sendCustom("trace", entry);
    this.logger.info?.(`[TRACE] ${stage}`, entry);
  }

  trimMessages() {
    const system = this.messages[0]?.role === "system" ? [this.messages[0]] : [];
    const rest = this.messages.filter((item) => item.role !== "system");
    this.messages = [...system, ...rest.slice(-this.historyLimit * 2)];
  }

  async close() {
    this.closed = true;
    if (this.readyTimer) {
      this.clearTimer(this.readyTimer);
      this.readyTimer = null;
    }
    if (this.activeTurn) {
      this.ttsQueue.length = 0;
      this.activeTurn.cancelled = true;
      if (this.activeTurn.finishTimer) {
        this.clearTimer(this.activeTurn.finishTimer);
      }
      try {
        this.activeTurn.abort.abort();
      } catch {
        // Ignore.
      }
      this.activeTurn = null;
    }
  }
}

module.exports = {
  TurnController,
  STAGE,
  mergeTranscript,
  parsePayload,
  sanitizeForSpeech,
};
