const test = require("node:test");
const assert = require("node:assert/strict");
const { parseTtsLine, END_CODE } = require("../lib/tts-client");

test("parses base64 audio and end marker", () => {
  const audio = parseTtsLine(JSON.stringify({ code: 0, data: Buffer.from([1, 2, 3]).toString("base64") }));
  assert.equal(audio.type, "audio");
  assert.deepEqual([...audio.buffer], [1, 2, 3]);
  assert.equal(parseTtsLine(JSON.stringify({ code: END_CODE })).type, "end");
});

test("rejects provider errors", () => {
  assert.throws(
    () => parseTtsLine(JSON.stringify({ code: 45000001, message: "invalid speaker" })),
    /TTS 错误/
  );
});
