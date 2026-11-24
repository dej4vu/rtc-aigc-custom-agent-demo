/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const EMOTION_TAGS = [
  ["happy", "开心"],
  ["excited", "兴奋"],
  ["bored", "无聊"],
  ["sad", "伤心"],
  ["distressed", "难受"],
  ["angry", "生气"],
  ["nervous", "紧张"],
  ["fearful", "害怕"],
  ["panicked", "惊慌"],
  ["surprised", "惊讶"],
  ["disgusted", "厌恶"],
  ["curious", "好奇"],
  ["puzzled", "疑惑"],
  ["confident", "自信"],
  ["serious", "严肃"],
  ["commanding", "命令"],
  ["pleading", "恳求"],
  ["reassuring", "安慰"],
  ["sarcastic", "讽刺"],
  ["laughing", "笑着说"],
  ["crying", "哭着说"],
  ["disappointed", "失望"],
  ["hopeless", "绝望"],
  ["desperate", "急切"],
  ["frustrated", "懊恼"],
  ["worried", "担心"],
  ["embarrassed", "尴尬"],
  ["guilty", "内疚"],
  ["thoughtful", "边想边说"],
  ["sympathetic", "同情"],
  ["indifferent", "冷淡"],
  ["very low pitch", "极低音"],
  ["low pitch", "低音"],
  ["high pitch", "高音"],
  ["very high pitch", "极高音"],
  ["very slow", "极慢"],
  ["slow", "慢速"],
  ["fast", "快速"],
  ["very fast", "极快"],
  ["very quiet", "极小声"],
  ["quiet", "小声"],
  ["loud", "大声"],
  ["very loud", "极大声"],
  ["hurried", "匆忙地说"],
  ["stammering", "结巴"],
  ["whispering", "耳语"],
  ["soft", "轻柔"],
  ["shouting", "大喊"],
  ["muttering", "嘟囔"],
  ["weak", "虚弱"],
  ["tired", "疲惫"],
  ["in pain", "忍痛说"],
  ["panting", "喘着说"],
  ["trembling", "声音发抖"],
];

const PARALINGUISTIC_TAGS = [
  ["laughs", "笑声"],
  ["chuckles", "轻笑"],
  ["giggles", "咯咯笑"],
  ["whimpers", "呜咽"],
  ["cries", "哭声"],
  ["sobs", "抽泣"],
  ["wails", "放声哭"],
  ["screams", "尖叫"],
  ["scoffs", "嗤笑"],
  ["inhales", "吸气"],
  ["inhales deeply", "深吸气"],
  ["gasps", "倒吸气"],
  ["exhales", "呼气"],
  ["exhales sharply", "急呼气"],
  ["sighs", "叹气"],
  ["pants", "急喘"],
  ["wheezing", "喘鸣声"],
  ["clears throat", "清嗓子"],
  ["coughs", "咳嗽声"],
  ["grunts", "哼声"],
  ["groans", "痛哼"],
  ["sniffs", "吸鼻子"],
  ["sneezes", "喷嚏声"],
  ["smacks lips", "咂嘴"],
  ["clicks tongue", "弹舌"],
  ["yawns", "打哈欠"],
  ["laughing hysterically", "狂笑"],
  ["swallows", "吞咽"],
];

const INLINE_TAGS = new Set(
  [...EMOTION_TAGS, ...PARALINGUISTIC_TAGS].map(([tag]) => tag)
);

function formatTagList(tags) {
  return tags.map(([tag, label]) => `[${tag}]${label}`).join("、");
}

const INLINE_TAG_GUIDE = [
  "【SeedTTS 3.0 内联标签完整清单】",
  `只允许使用以下 ${INLINE_TAGS.size} 个官方英文标签。标签不会被朗读，而是控制声音表演。`,
  `情绪与语气控制（${EMOTION_TAGS.length}）：`,
  formatTagList(EMOTION_TAGS),
  `副语言与拟声（${PARALINGUISTIC_TAGS.length}）：`,
  formatTagList(PARALINGUISTIC_TAGS),
  "使用规则：",
  "1. 标签写在句首或情绪转折处。控制类标签作用于同一句后续文本；下一句如需同样情绪，可以重新标注。",
  "2. 一次回复通常使用 1-2 个标签，最多 3 个。不要每句机械添加；同一位置只能放一个标签，标签之间必须有正文，禁止写成 [a][b] 连排。",
  "3. 副语言标签只在需要时插入；插入后不要再写“哈哈”“呜呜”“唉”等重复拟声词。",
  "4. 标签必须原样使用英文方括号和下列拼写；不要翻译、不要自造、不要使用中文方括号，也不要把标签念出来。",
  "5. 没有合适标签时宁可不加，优先保证语义自然，不要为了使用标签破坏表达。",
].join("\n");

function appendInlineTagGuide(systemPrompt, { enabled = true } = {}) {
  const base = typeof systemPrompt === "string" ? systemPrompt.trim() : "";
  if (!enabled) {
    return base;
  }
  return base ? `${base}\n\n${INLINE_TAG_GUIDE}` : INLINE_TAG_GUIDE;
}

const COMPLETE_TAG = /\[([a-z][a-z ]*)\]/gi;
const PARTIAL_TAG = /\[[a-z ]*$/i;

function isInlineTag(name) {
  return INLINE_TAGS.has(
    String(name || "")
      .trim()
      .toLowerCase()
  );
}

/**
 * Remove TTS inline tags from user-visible subtitles while preserving the raw
 * text sent to the speech service. Partial streaming tags are hidden too.
 */
function stripInlineTags(text) {
  if (typeof text !== "string" || !text) {
    return "";
  }
  let visible = text.replace(COMPLETE_TAG, (match, name) =>
    isInlineTag(name) ? " " : match
  );
  const partial = visible.match(PARTIAL_TAG);
  if (partial) {
    const prefix = partial[0].slice(1).toLowerCase();
    if ([...INLINE_TAGS].some((tag) => tag.startsWith(prefix))) {
      visible = visible.slice(0, visible.length - partial[0].length);
    }
  }
  return visible
    .replace(/[ \t]+/g, " ")
    .replace(/([\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff])/g, "$1")
    .replace(/([，。！？；：、])[ \t]+/g, "$1")
    .replace(/\s+([，。！？；：、,.!?;:])/g, "$1")
    .replace(/^[，。！？；：、,.!?;:\s]+/, "")
    .trim();
}

module.exports = {
  INLINE_TAGS,
  EMOTION_TAGS,
  PARALINGUISTIC_TAGS,
  INLINE_TAG_GUIDE,
  appendInlineTagGuide,
  isInlineTag,
  stripInlineTags,
};
