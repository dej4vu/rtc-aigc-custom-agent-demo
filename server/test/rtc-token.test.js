const test = require("node:test");
const assert = require("node:assert/strict");
const { createRtcToken } = require("../lib/rtc-token");

test("creates an RTC token bound to the call identity", () => {
  const { token, expiresAt } = createRtcToken({
    appId: "123456789012345678901234",
    appKey: "secret",
    roomId: "room-1",
    userId: "web-user",
    now: 1700000000000,
  });
  assert.equal(token.startsWith("001123456789012345678901234"), true);
  assert.ok(token.length > 48);
  assert.equal(new Date(expiresAt).getTime(), 1700003600000);
});
