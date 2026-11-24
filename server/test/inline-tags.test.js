const test = require("node:test");
const assert = require("node:assert/strict");
const {
  INLINE_TAGS,
  EMOTION_TAGS,
  PARALINGUISTIC_TAGS,
  INLINE_TAG_GUIDE,
  appendInlineTagGuide,
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

test("exposes the complete official tag palette in the system prompt", () => {
  assert.equal(EMOTION_TAGS.length, 54);
  assert.equal(PARALINGUISTIC_TAGS.length, 28);
  assert.equal(
    new Set([...EMOTION_TAGS, ...PARALINGUISTIC_TAGS].map(([tag]) => tag)).size,
    82
  );
  for (const tag of INLINE_TAGS) {
    assert.ok(
      INLINE_TAG_GUIDE.includes(`[${tag}]`),
      `missing [${tag}] in prompt guide`
    );
  }
  const prompt = appendInlineTagGuide("你是绯绯");
  assert.ok(prompt.startsWith("你是绯绯\n\n"));
  assert.ok(prompt.includes(INLINE_TAG_GUIDE));
  assert.equal(appendInlineTagGuide("你是绯绯", { enabled: false }), "你是绯绯");
});
