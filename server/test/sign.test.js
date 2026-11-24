const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { signHeaders, buildMmpgHeaders } = require("../lib/sign");

test("MMPG GET is signed with Host and X-Date", () => {
  const headers = buildMmpgHeaders({
    mmpg: {
      url: "wss://interactai.volcvideo.com/api/v2/mmpg",
      region: "cn-north-1",
      service: "rtc",
      accessKeyId: "test-ak",
      secretAccessKey: "test-sk",
    },
  });
  assert.equal(headers.Host, "interactai.volcvideo.com");
  assert.match(headers["X-Date"], /^\d{8}T\d{6}Z$/);
  assert.match(
    headers.Authorization,
    /^HMAC-SHA256 Credential=test-ak\/\d{8}\/cn-north-1\/rtc\/request, SignedHeaders=host;x-date, Signature=[0-9a-f]{64}$/
  );
});

test("OpenAPI POST includes a body hash", () => {
  const headers = signHeaders({
    method: "POST",
    url: "https://rtc.volcengineapi.com/?Action=AibotxQuery&Version=2025-08-01",
    body: { PageNum: 1 },
    region: "cn-north-1",
    service: "rtc",
    accessKeyId: "test-ak",
    secretAccessKey: "test-sk",
  });
  assert.match(headers["X-Content-Sha256"], /^[0-9a-f]{64}$/);
  assert.match(headers.Authorization, /SignedHeaders=host;x-content-sha256;x-date/);
});

test("OpenAPI POST signature uses the configured secret key", () => {
  const date = new Date("2026-01-01T00:00:00.000Z");
  const body = { Action: "Ping" };
  const headers = signHeaders({
    method: "POST",
    url: "https://rtc.volcengineapi.com/?Action=Ping&Version=2025-08-01",
    body,
    region: "cn-north-1",
    service: "rtc",
    accessKeyId: "test-ak",
    secretAccessKey: "test-sk",
    date,
  });

  const bodyHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");
  assert.equal(headers["X-Content-Sha256"], bodyHash);

  const canonicalRequest = [
    "POST",
    "/",
    "Action=Ping&Version=2025-08-01",
    `host:rtc.volcengineapi.com\nx-content-sha256:${bodyHash}\nx-date:20260101T000000Z\n`,
    "host;x-content-sha256;x-date",
    bodyHash,
  ].join("\n");
  const scope = "20260101/cn-north-1/rtc/request";
  const stringToSign = [
    "HMAC-SHA256",
    "20260101T000000Z",
    scope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
  const hmac = (key, value) =>
    crypto.createHmac("sha256", key).update(value).digest();
  const signingKey = hmac(
    hmac(hmac(hmac("test-sk", "20260101"), "cn-north-1"), "rtc"),
    "request"
  );
  const expected = crypto
    .createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  assert.equal(
    headers.Authorization,
    `HMAC-SHA256 Credential=test-ak/${scope}, SignedHeaders=host;x-content-sha256;x-date, Signature=${expected}`
  );
});
