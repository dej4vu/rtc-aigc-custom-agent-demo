(function () {
  "use strict";

  document.querySelectorAll(".exercise").forEach(function (exercise) {
    var feedback = exercise.querySelector(".feedback");
    if (!feedback) return;

    exercise.querySelectorAll(".options button").forEach(function (button) {
      button.addEventListener("click", function () {
        var correct = button.dataset.answer === "right";
        if (button.dataset.reveal) {
          return;
        }
        feedback.textContent = correct
          ? "正确。这是最终文本边界；下一课我们把它变成可运行的 Agent 代码。"
          : "再想一想：增量事件会变化，音频播放开始时输入轮次已经结束。";
        feedback.style.color = correct ? "#0f6b62" : "#a9630b";
      });
    });
  });
})();
