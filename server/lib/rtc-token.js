/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const TokenManager = require("../token");

const { privileges } = TokenManager;

function createRtcToken({
  appId,
  appKey,
  roomId,
  userId,
  ttlSeconds = 3600,
  now = Date.now(),
}) {
  if (!appId || !appKey || !roomId || !userId) {
    throw new Error("生成 RTC Token 需要 AppId、AppKey、RoomId、UserId");
  }
  const token = new TokenManager.AccessToken(appId, appKey, roomId, userId);
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  token.addPrivilege(privileges.PrivPublishStream, expiresAt);
  token.addPrivilege(privileges.PrivSubscribeStream, expiresAt);
  token.expireTime(expiresAt);
  return {
    token: token.serialize(),
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

module.exports = {
  createRtcToken,
};
