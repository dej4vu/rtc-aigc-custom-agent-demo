const test = require("node:test");
const assert = require("node:assert/strict");
const { createSentenceSegmenter } = require("../lib/sentence-segmenter");

test("segments Chinese sentences across streaming chunks", () => {
  const segmenter = createSentenceSegmenter({ maxLength: 80 });
  assert.deepEqual(segmenter.push("你好。今天"), ["你好。"]);
  assert.deepEqual(segmenter.push("天气不错！"), ["今天天气不错！"]);
  assert.deepEqual(segmenter.flush(), []);
});

test("keeps closing quotes with the sentence", () => {
  const segmenter = createSentenceSegmenter();
  assert.deepEqual(segmenter.push("他说：“好的。”然后"), ["他说：“好的。”"]);
  assert.deepEqual(segmenter.flush(), ["然后"]);
});

test("forces long text to split near a soft break", () => {
  const segmenter = createSentenceSegmenter({ maxLength: 10 });
  const output = segmenter.push("一二三四五，六七八九十十一");
  assert.ok(output.length >= 1);
  assert.ok(output[0].length <= 11);
  assert.equal(output.join("").includes("，"), true);
});
