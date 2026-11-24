/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const { v4: uuidv4 } = require("uuid");

class SessionStore {
  constructor({ ttlMs = 2 * 60 * 60 * 1000, callTtlMs = 60 * 60 * 1000, now = Date.now } = {}) {
    this.ttlMs = ttlMs;
    this.callTtlMs = callTtlMs;
    this.now = now;
    this.sessions = new Map();
  }

  createPageSession({ scenes }) {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      scenes,
      createdAt: this.now(),
      updatedAt: this.now(),
      activeCall: null,
      startPromise: null,
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    if (this.now() - session.updatedAt > this.ttlMs) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  touch(session) {
    session.updatedAt = this.now();
  }

  setActiveCall(session, call) {
    session.activeCall = call;
    this.touch(session);
  }

  clearActiveCall(session, callId) {
    if (!session?.activeCall) {
      return;
    }
    if (callId && session.activeCall.id !== callId) {
      return;
    }
    session.activeCall = null;
    this.touch(session);
  }

  listActiveCalls() {
    return [...this.sessions.values()]
      .map((session) => session.activeCall)
      .filter(Boolean);
  }

  cleanup() {
    const now = this.now();
    for (const [id, session] of this.sessions) {
      if (now - session.updatedAt > this.ttlMs) {
        if (!session.activeCall) {
          this.sessions.delete(id);
        }
      }
      if (
        session.activeCall &&
        now - session.activeCall.startedAt > this.callTtlMs
      ) {
        session.activeCall.expired = true;
      }
    }
  }

  delete(sessionId) {
    this.sessions.delete(sessionId);
  }
}

module.exports = {
  SessionStore,
};
