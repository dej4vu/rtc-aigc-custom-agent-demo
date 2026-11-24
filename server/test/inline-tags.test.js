const test = require("node:test");
const assert = require("node:assert/strict");
const {
  INLINE_TAGS,
  isInlineTag,
  stripInlineTags,
} = require("../lib/inline-tags");

test("removes official inline tags from visible subtitles", () => {
  assert.equal(
    stripInlineTags(
      "[happy] 你终于回来啦。[soft] 我还以为……你今天不会找我了呢。"
    ),
    "你终于回来啦。我还以为……你今天不会找我了呢。"
  );
  assert.equal(
    stripInlineTags("[whispering] 别出声，[very quiet] 让我再抱一会儿。"),
    "别出声，让我再抱一会儿。"
  );
});

test("hides a partial tag while streaming", () => {
  assert.equal(stripInlineTags("[happy] 你好 [so"), "你好");
  assert.equal(stripInlineTags("[happy] 你好 ["), "你好");
});

test("keeps ordinary bracketed text and only matches the whitelist", () => {
  assert.equal(stripInlineTags("[备注] 明天见"), "[备注] 明天见");
  assert.equal(stripInlineTags("[Note] keep this"), "[Note] keep this");
  assert.equal(isInlineTag("low pitch"), true);
  assert.equal(isInlineTag("sobbing"), false);
  assert.equal(INLINE_TAGS.size, 82);
});
