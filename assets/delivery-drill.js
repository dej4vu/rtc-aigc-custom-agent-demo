(function () {
  "use strict";

  var CHECKS = [
    {
      stage: "静态与配置",
      command: "curl -s http://127.0.0.1:3101/health",
      pass: "ok=true，issues=[]，密钥只出现布尔值。",
      fail: "先补齐缺失环境变量或启动服务。",
      keywords: ["ok", "issues"]
    },
    {
      stage: "凭证与 Bot",
      command: "yarn preflight",
      pass: "输出 Bot 名称与 BotId；可选 --handshake 验证签名握手。",
      fail: "按 AK/SK 权限、账号归属、BOT_ID 顺序排查。",
      keywords: ["Bot", "AK"]
    },
    {
      stage: "MMPG 参数",
      command: "yarn probe",
      pass: "session.create 成功且短窗口无异步校验错误。",
      fail: "检查 ASR ApiKey、ApiResourceId、RTC 身份。",
      keywords: ["session.create", "ASR"]
    },
    {
      stage: "自动化行为",
      command: "yarn test",
      pass: "服务端与前端全部通过；当前仓库基准 37 + 16 项。",
      fail: "先判断测试是行为规格还是实现细节，不要盲改。",
      keywords: ["test", "37"]
    },
    {
      stage: "浏览器全链路",
      command: "yarn dev",
      pass: "client.ready、ASR、LLM、TTS、playback、turn.finished 都出现。",
      fail: "Trace 停在哪一段，就进入对应层排障。",
      keywords: ["client.ready", "trace"]
    },
    {
      stage: "清理",
      command: "curl -s http://127.0.0.1:3101/health",
      pass: "挂断后 activeCalls=0。",
      fail: "检查 /session/stop、gatewayClose 和浏览器卸载。",
      keywords: ["activeCalls"]
    }
  ];

  function escapeHtml(value) {
    return String(value).replace(/[<>&"]/g, function (char) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[char];
    });
  }

  function initialize(root) {
    var question = root.querySelector(".drill-question");
    var output = root.querySelector(".drill-output");
    var log = root.querySelector(".drill-log");
    if (!question || !output || !log) return;

    function renderQueue() {
      question.innerHTML = CHECKS.map(function (check, index) {
        return '<button type="button" data-index="' + index + '">' + escapeHtml(check.stage) + "</button>";
      }).join("");
      question.querySelectorAll("button").forEach(function (button) {
        button.addEventListener("click", function () {
          answer(Number(button.dataset.index));
        });
      });
    }

    function answer(index) {
      var check = CHECKS[index];
      log.innerHTML += "<p><strong>" + escapeHtml(check.stage) + "</strong><br><code>" +
        escapeHtml(check.command) + "</code><br>" + escapeHtml(check.pass) + "</p>";
      CHECKS.splice(index, 1);
      if (!CHECKS.length) {
        output.textContent = "交付顺序完成。现在按同一个顺序检查你自己的改动。";
        return;
      }
      output.textContent = "继续选择下一个必须通过的验收层。";
      renderQueue();
    }

    output.textContent = "按从左到右、可自动化的顺序点击。";
    renderQueue();
  }

  document.querySelectorAll(".delivery-drill").forEach(initialize);
})();
