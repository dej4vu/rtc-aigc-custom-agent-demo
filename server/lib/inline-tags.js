/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const INLINE_TAGS = new Set([
  "happy",
  "excited",
  "bored",
  "sad",
  "distressed",
  "angry",
  "nervous",
  "fearful",
  "panicked",
  "surprised",
  "disgusted",
  "disappointed",
  "hopeless",
  "desperate",
  "frustrated",
  "worried",
  "embarrassed",
  "guilty",
  "curious",
  "puzzled",
  "thoughtful",
  "confident",
  "serious",
  "commanding",
  "pleading",
  "reassuring",
  "sarcastic",
  "sympathetic",
  "indifferent",
  "very low pitch",
  "low pitch",
  "high pitch",
  "very high pitch",
  "very slow",
  "slow",
  "fast",
  "very fast",
  "very quiet",
  "quiet",
  "loud",
  "very loud",
  "hurried",
  "stammering",
  "whispering",
  "soft",
  "shouting",
  "muttering",
  "weak",
  "tired",
  "in pain",
  "panting",
  "laughing",
  "crying",
  "trembling",
  "laughs",
  "chuckles",
  "giggles",
  "whimpers",
  "cries",
  "sobs",
  "wails",
  "screams",
  "scoffs",
  "inhales",
  "inhales deeply",
  "gasps",
  "exhales",
  "exhales sharply",
  "sighs",
  "pants",
  "wheezing",
  "clears throat",
  "coughs",
  "grunts",
  "groans",
  "sniffs",
  "sneezes",
  "smacks lips",
  "clicks tongue",
  "yawns",
  "laughing hysterically",
  "swallows",
]);

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
  isInlineTag,
  stripInlineTags,
};
