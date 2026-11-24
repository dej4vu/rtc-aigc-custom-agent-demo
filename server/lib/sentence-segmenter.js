/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const HARD_BREAKS = new Set(["。", "！", "？", "!", "?", "；", ";", "…", "\n"]);
const SOFT_BREAKS = new Set(["、", "，", ",", " "]);
const CLOSERS = new Set(["”", "’", "」", "』", "】", "）", ")", "》"]);

class SentenceSegmenter {
  constructor({ maxLength = 80 } = {}) {
    this.maxLength = maxLength;
    this.buffer = "";
  }

  push(text) {
    if (typeof text !== "string" || !text) {
      return [];
    }
    this.buffer += text;
    const output = [];
    let start = 0;
    for (let i = 0; i < this.buffer.length; i += 1) {
      const char = this.buffer[i];
      if (HARD_BREAKS.has(char)) {
        let end = i + 1;
        while (end < this.buffer.length && CLOSERS.has(this.buffer[end])) {
          end += 1;
        }
        const sentence = this.buffer.slice(start, end).trim();
        if (sentence) {
          output.push(sentence);
        }
        start = end;
        i = end - 1;
      }
    }
    this.buffer = this.buffer.slice(start);
    while (this.buffer.length > this.maxLength) {
      let cut = -1;
      for (let i = this.maxLength - 1; i >= Math.floor(this.maxLength * 0.5); i -= 1) {
        if (SOFT_BREAKS.has(this.buffer[i])) {
          cut = i + 1;
          break;
        }
      }
      if (cut < 0) {
        cut = this.maxLength;
      }
      const sentence = this.buffer.slice(0, cut).trim();
      if (sentence) {
        output.push(sentence);
      }
      this.buffer = this.buffer.slice(cut);
    }
    return output;
  }

  flush() {
    const sentence = this.buffer.trim();
    this.buffer = "";
    return sentence ? [sentence] : [];
  }

  reset() {
    this.buffer = "";
  }
}

function createSentenceSegmenter(options) {
  return new SentenceSegmenter(options);
}

module.exports = {
  SentenceSegmenter,
  createSentenceSegmenter,
};
