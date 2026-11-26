(function () {
  "use strict";

  function toTlv(value, type) {
    const json = typeof value === "string" ? value : JSON.stringify(value);
    const bytes = new TextEncoder().encode(json);
    const frame = new Uint8Array(8 + bytes.length);
    for (let index = 0; index < 4; index += 1) {
      frame[index] = type.charCodeAt(index);
    }
    frame[4] = (bytes.length >> 24) & 255;
    frame[5] = (bytes.length >> 16) & 255;
    frame[6] = (bytes.length >> 8) & 255;
    frame[7] = bytes.length & 255;
    frame.set(bytes, 8);
    return frame;
  }

  function fromTlv(frame) {
    const type = String.fromCharCode(frame[0], frame[1], frame[2], frame[3]);
    const length = (frame[4] << 24) | (frame[5] << 16) | (frame[6] << 8) | frame[7];
    return {
      type,
      length,
      value: new TextDecoder().decode(frame.slice(8, 8 + length)),
    };
  }

  function preview(frame) {
    return Array.from(frame.slice(0, 24))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(" ");
  }

  function initialize(root) {
    const output = root.querySelector(".codec-output");
    if (!output) return;

    const samples = {
      client: () => toTlv({
        type: "client.ready",
        value: { at: Date.now(), hasMic: true }
      }, "cmsg"),
      trace: () => toTlv({
        v: 1,
        type: "trace",
        value: { stage: "tts.first_chunk", latencyMs: 88 }
      }, "cmsg"),
      subtitle: () => toTlv(JSON.stringify({
        data: [{ text: "你好", userId: "agent-1", definite: true }]
      }), "subv")
    };

    root.querySelectorAll("[data-sample]").forEach((button) => {
      button.addEventListener("click", () => {
        const frame = samples[button.dataset.sample]();
        const decoded = fromTlv(frame);
        output.innerHTML =
          "<strong>magic=" + decoded.type + "</strong> · length=" + decoded.length +
          "<br><code>" + preview(frame) + "</code>" +
          "<br>解析 value：<code>" + decoded.value.replace(/[<>&]/g, "") + "</code>";
      });
    });

    output.textContent = "点击一个样例，查看 TLV 的 8 字节头和内层 JSON。";
  }

  document.querySelectorAll(".codec-lab").forEach(initialize);
})();
