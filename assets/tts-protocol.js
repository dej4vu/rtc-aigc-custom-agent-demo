(function () {
  "use strict";

  var TAGS = new Set([
    "happy", "excited", "bored", "sad", "distressed", "angry", "nervous",
    "fearful", "panicked", "surprised", "disgusted", "curious", "puzzled",
    "confident", "serious", "commanding", "pleading", "reassuring",
    "sarcastic", "laughing", "crying", "disappointed", "hopeless",
    "desperate", "frustrated", "worried", "embarrassed", "guilty",
    "thoughtful", "sympathetic", "indifferent", "very low pitch",
    "low pitch", "high pitch", "very high pitch", "very slow", "slow",
    "fast", "very fast", "very quiet", "quiet", "loud", "very loud",
    "hurried", "stammering", "whispering", "soft", "shouting", "muttering",
    "weak", "tired", "in pain", "panting", "trembling", "laughs",
    "chuckles", "giggles", "whimpers", "cries", "sobs", "wails",
    "screams", "scoffs", "inhales", "inhales deeply", "gasps", "exhales",
    "exhales sharply", "sighs", "pants", "wheezing", "clears throat",
    "coughs", "grunts", "groans", "sniffs", "sneezes", "smacks lips",
    "clicks tongue", "yawns", "laughing hysterically", "swallows"
  ]);

  var TAG_PATTERN = /\[([a-z][a-z ]*)\]/gi;

  function tokenize(text) {
    var tokens = [];
    var lastIndex = 0;
    text.replace(TAG_PATTERN, function (match, name, offset) {
      if (offset > lastIndex) {
        tokens.push({ kind: "text", value: text.slice(lastIndex, offset) });
      }
      var normalized = name.trim().toLowerCase();
      tokens.push({
        kind: TAGS.has(normalized) ? "tag" : "bracket",
        value: match,
        name: normalized
      });
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < text.length) {
      tokens.push({ kind: "text", value: text.slice(lastIndex) });
    }
    for (var index = 1; index < tokens.length; index += 1) {
      tokens[index].adjacent =
        tokens[index].kind === "tag" &&
        tokens[index - 1].kind === "tag";
    }
    return tokens;
  }

  function visibleText(tokens) {
    return tokens
      .filter(function (token) { return token.kind === "text"; })
      .map(function (token) { return token.value; })
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  }

  function speechText(tokens) {
    return tokens
      .map(function (token) { return token.value; })
      .join("")
      .trim();
  }

  function escapeHtml(value) {
    return String(value).replace(/[<>&"]/g, function (char) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[char];
    });
  }

  function pcmSeconds(bytes, sampleRate) {
    return bytes / (sampleRate * 2);
  }

  function initialize(root) {
    var requestOutput = root.querySelector(".request-output");
    var tokensOutput = root.querySelector(".tokens-output");
    var protocolOutput = root.querySelector(".protocol-output");
    if (!requestOutput || !tokensOutput || !protocolOutput) return;

    var samples = {
      welcome: "[happy] 你终于来啦。[soft] 我还以为……你今天不会找我了呢。",
      badAdjacent: "[happy][soft] 你终于来啦。",
      custom: "[备注] 普通方括号保留，[sighs] 官方标签会被清洗。"
    };

    root.querySelectorAll("[data-sample]").forEach(function (button) {
      button.addEventListener("click", function () {
        var text = samples[button.dataset.sample];
        var tokens = tokenize(text);
        requestOutput.textContent = JSON.stringify({
          text: speechText(tokens),
          model_id: "doubao-seed-tts-3.0",
          language_code: "zh",
          enable_subtitle: true,
          output_format: { format: "pcm", sample_rate: 24000 },
          voice_settings: { speed: 0.96, pitch: 1, instructions: ["甜软、亲密"] },
          session_id: "same-turn-uuid"
        }, null, 2);

        tokensOutput.innerHTML = tokens.map(function (token) {
          var className = token.kind === "tag" ? "token" : token.kind === "bracket" ? "bracket" : "plain";
          return '<span class="' + className + '">' + escapeHtml(token.value) + "</span>";
        }).join("");
        if (tokens.some(function (token) { return token.adjacent; })) {
          tokensOutput.innerHTML += '<p class="invalid">发现 [tag][tag] 连排；提示词约定禁止这种写法。</p>';
        }

        protocolOutput.innerHTML = [
          '{"event":"ready","session_id":"same-turn-uuid"}',
          '{"event":"audio","audio":"' + btoa("PCM") + '"}',
          '{"event":"alignment","text":"你终于来啦。","words":[{"word":"你","startTime":0,"endTime":0.2}]}',
          '{"event":"final","is_final":true}'
        ].map(function (line) { return "<code>" + escapeHtml(line) + "</code>"; }).join("<br>");
        protocolOutput.innerHTML += "<p>4 字节 16-bit PCM @ 24kHz = " +
          pcmSeconds(4, 24000).toFixed(6) + " 秒。</p>";
      });
    });

    requestOutput.textContent = "选择一个输入样例。";
    tokensOutput.textContent = "";
    protocolOutput.textContent = "";
  }

  document.querySelectorAll(".tts-lab").forEach(initialize);
  window.__ttsProtocolDemo = { tokenize: tokenize, visibleText: visibleText, speechText: speechText, pcmSeconds: pcmSeconds };
})();
