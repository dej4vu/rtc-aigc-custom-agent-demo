/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const { EventEmitter } = require("events");
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");
const { buildMmpgHeaders } = require("./sign");

class MmpgClient extends EventEmitter {
  constructor(config, {
    WebSocketImpl = WebSocket,
    logger = console,
    now = Date.now,
  } = {}) {
    super();
    this.config = config;
    this.WebSocketImpl = WebSocketImpl;
    this.logger = logger;
    this.now = now;
    this.ws = null;
    this.waiters = new Set();
    this.opened = false;
    this.closed = false;
  }

  async connect({ timeoutMs = 15000 } = {}) {
    if (this.opened && this.ws?.readyState === 1) {
      return this;
    }
    const headers = buildMmpgHeaders(this.config);
    const ws = new this.WebSocketImpl(this.config.mmpg.url, {
      headers,
      handshakeTimeout: timeoutMs,
      perMessageDeflate: false,
    });
    this.ws = ws;

    let settled = false;
    let resolveHandshake;
    let rejectHandshake;
    const handshake = new Promise((resolve, reject) => {
      resolveHandshake = resolve;
      rejectHandshake = reject;
    });
    const finish = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      finish(rejectHandshake, new Error(`MMPG WebSocket 连接超时（${timeoutMs}ms）`));
      try {
        ws.terminate();
      } catch {
        // Ignore cleanup failures.
      }
    }, timeoutMs);

    // Attach the data handlers before waiting for `open`, so a gateway that
    // sends `session.created` immediately after the handshake cannot lose it.
    ws.on("message", (data) => this._handleMessage(data));
    ws.on("close", (code, reason) => {
      this.closed = true;
      this.opened = false;
      const message = `MMPG WebSocket 已关闭（code=${code}${
        reason?.length ? `, reason=${reason.toString("utf8")}` : ""
      }）`;
      if (!settled) {
        finish(rejectHandshake, new Error(message));
        return;
      }
      this._rejectWaiters(new Error(message));
      this.emit("gatewayClose", { code, reason: reason?.toString("utf8") || "" });
      if (!this._closing) {
        this.logger.warn?.(`[MMPG] ${message}`);
      }
    });
    ws.on("error", (error) => {
      if (!settled) {
        finish(rejectHandshake, error);
        return;
      }
      this.emit("gatewayError", error);
    });
    ws.once("open", () => {
      this.opened = true;
      this.logger.info?.("[MMPG] WebSocket 已连接");
      finish(resolveHandshake);
    });
    ws.once("unexpected-response", (_req, response) => {
      const status = response?.statusCode;
      const chunks = [];
      response?.on("data", (chunk) => chunks.push(chunk));
      response?.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8").slice(0, 500);
        finish(
          rejectHandshake,
          new Error(
            `MMPG WebSocket 握手失败：HTTP ${status}${body ? ` ${body}` : ""}`
          )
        );
      });
      response?.on("error", (error) => {
        finish(
          rejectHandshake,
          new Error(`MMPG WebSocket 握手失败：HTTP ${status} (${error.message})`)
        );
      });
    });
    await handshake;
    return this;
  }

  _handleMessage(data) {
    let event;
    try {
      const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
      event = JSON.parse(text);
    } catch (error) {
      this.emit("gatewayError", new Error(`MMPG 事件不是 JSON：${error.message}`));
      return;
    }
    this.emit("event", event);
    if (event?.type === "error" || event?.type === "session.error") {
      const error = new Error(event.message || event.error || "MMPG 返回错误");
      error.event = event;
      this.emit("gatewayError", error);
      this._rejectWaiters(error);
      return;
    }
    for (const waiter of [...this.waiters]) {
      if (!waiter.types.has(event?.type)) {
        continue;
      }
      this.waiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(event);
    }
  }

  _rejectWaiters(error) {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters.clear();
  }

  waitForEvent(types, { timeoutMs = 15000 } = {}) {
    const typeSet = new Set(Array.isArray(types) ? types : [types]);
    return new Promise((resolve, reject) => {
      const waiter = { types: typeSet, resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(`等待 MMPG ${[...typeSet].join("/")} 超时（${timeoutMs}ms）`));
      }, timeoutMs);
      this.waiters.add(waiter);
    });
  }

  send(event) {
    if (!this.ws || this.ws.readyState !== (this.WebSocketImpl.OPEN ?? 1)) {
      throw new Error("MMPG WebSocket 未连接");
    }
    this.ws.send(JSON.stringify(event));
  }

  sendEvent(type, payload = {}) {
    this.send({
      event_id: `event_${uuidv4()}`,
      type,
      ...payload,
    });
  }

  async createSession(session, { timeoutMs = 20000 } = {}) {
    const created = this.waitForEvent("session.created", { timeoutMs });
    this.sendEvent("session.create", { session });
    const event = await created;
    this.logger.info?.("[MMPG] session.created");
    return event;
  }

  async close({ timeoutMs = 3000 } = {}) {
    if (
      !this.ws ||
      this.closed ||
      this.ws.readyState === (this.WebSocketImpl.CLOSED ?? 3)
    ) {
      return;
    }
    this._closing = true;
    try {
      if (this.ws.readyState === (this.WebSocketImpl.OPEN ?? 1)) {
        this.sendEvent("session.close");
      }
    } catch {
      // The gateway may already have gone away.
    }
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          this.ws.terminate();
        } catch {
          // Ignore.
        }
        resolve();
      }, timeoutMs);
      this.ws.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        this.ws.close(1000, "demo session closed");
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
    this.closed = true;
    this.opened = false;
  }
}

module.exports = {
  MmpgClient,
};
