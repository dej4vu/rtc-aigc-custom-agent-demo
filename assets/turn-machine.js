(function () {
  "use strict";

  function initializeTurnMachine(root) {
    var output = root.querySelector(".machine-status");
    var respOutput = root.querySelector(".machine-resp");
    var buttons = Array.from(root.querySelectorAll("[data-action]"));
    var machine = { status: "IDLE", respId: 0, hasTurn: false, cancelled: false };

    function render(message) {
      output.textContent = machine.status + " · resp_id=" + machine.respId + (machine.hasTurn ? " · active turn" : " · no turn");
      if (message) {
        respOutput.textContent = message;
      }
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        var action = button.dataset.action;
        if (action === "asr-started") {
          if (machine.hasTurn) {
            machine.cancelled = true;
            machine.hasTurn = false;
            machine.respId += 1;
            machine.status = "INTERRUPTED";
            render("旧 AbortController 取消；TTS 队列清空；assistant.audio.cancel 已发送。");
          } else {
            machine.status = "LISTENING";
            render("没有旧回复可打断；继续听用户输入。");
          }
        } else if (action === "asr-done") {
          machine.hasTurn = true;
          machine.cancelled = false;
          machine.respId += 1;
          machine.status = "THINKING";
          render("ASR done 创建新 turn；用户文本进入 messages。");
        } else if (action === "llm-delta") {
          if (!machine.hasTurn || machine.cancelled) {
            render("没有有效 turn；delta 被忽略。");
            return;
          }
          render("LLM delta 进入 segmenter；能成句的文本进入 TTS 队列。");
        } else if (action === "tts-chunk") {
          if (!machine.hasTurn || machine.cancelled) {
            render("没有有效音频；PCM 丢弃。");
            return;
          }
          machine.status = "SPEAKING";
          render("第一个 PCM chunk 变成 assistant.audio.delta。");
        } else if (action === "playback-done") {
          if (!machine.hasTurn || machine.cancelled) {
            render("resp_id 不匹配或 turn 已取消；结束事件被忽略。");
            return;
          }
          machine.hasTurn = false;
          machine.status = "FINISHED";
          render("resp_id 匹配；turn.finished(audio_done)。");
        }
      });
    });

    render("点击一个事件开始。");
  }

  document.querySelectorAll(".turn-machine").forEach(initializeTurnMachine);
})();
