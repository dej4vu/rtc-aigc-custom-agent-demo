const test = require("node:test");
const assert = require("node:assert/strict");
const { TurnController, STAGE } = require("../lib/turn-controller");

function makeController(overrides = {}) {
  const mmpgEvents = [];
  const custom = [];
  let resolveDone;
  const donePromise = new Promise((resolve) => {
    resolveDone = resolve;
  });
  const agent = {
    async reply({ onDelta }) {
      await onDelta("你好，", { firstTokenLatencyMs: 12 });
      await onDelta("今天想聊点什么？", { firstTokenLatencyMs: 12 });
      return { text: "你好，今天想聊点什么？" };
    },
  };
  const tts = {
    async synthesize(text, { onChunk }) {
      await onChunk(Buffer.from([1, 2]));
      await onChunk(Buffer.from([3, 4]));
      return { chunks: 2 };
    },
  };
  const controller = new TurnController({
    sessionId: "call-1",
    agentUserId: "agent-1",
    humanUserId: "web-1",
    systemPrompt: "你是测试助手",
    welcomeMessage: "",
    agent,
    tts,
    sendMmpgEvent: async (type, payload) => {
      mmpgEvents.push({ type, ...payload });
      if (type === "assistant.audio.delta" && payload.done) {
        resolveDone();
      }
    },
    sendCustom: (type, value) => custom.push({ type, value }),
    logger: { info() {}, warn() {}, error() {} },
    now: () => 1700000000000,
    setTimer: () => 1,
    clearTimer: () => {},
    ...overrides,
  });
  return { controller, mmpgEvents, custom, donePromise, agent, tts };
}

test("streams LLM text into sentence TTS and closes one resp_id", async () => {
  const { controller, mmpgEvents, custom, donePromise } = makeController();
  await controller.handleEvent({
    type: "user.audio.transcription.done",
    conv_id: "conv-1",
    transcript: "你好",
  });
  await donePromise;

  const audio = mmpgEvents.filter(
    (event) => event.type === "assistant.audio.delta"
  );
  assert.ok(audio.length >= 2);
  assert.equal(
    audio.every((event) => event.resp_id === 1),
    true
  );
  assert.equal(audio.at(-1).done, true);
  const merged = Buffer.concat(
    audio.map((event) => Buffer.from(event.payload, "base64"))
  );
  assert.deepEqual([...merged], [1, 2, 3, 4]);
  const stages = custom
    .filter((item) => item.type === "conv")
    .map((item) => item.value.Stage.Code);
  assert.ok(stages.includes(STAGE.THINKING));
  assert.ok(stages.includes(STAGE.SPEAKING));
  assert.ok(custom.some((item) => item.type === "subv"));
  assert.ok(custom.some((item) => item.type === "trace"));

  await controller.handleEvent({
    type: "assistant.audio.done",
    resp_id: 1,
  });
  assert.equal(controller.status, "FINISHED");
});

test("barge-in cancels current audio and starts a higher resp_id", async () => {
  let call = 0;
  const { controller, mmpgEvents } = makeController({
    agent: {
      async reply({ onDelta }) {
        call += 1;
        await onDelta("第一轮回复。", { firstTokenLatencyMs: 5 });
        return { text: "第一轮回复。" };
      },
    },
  });
  await controller.handleEvent({
    type: "user.audio.transcription.done",
    conv_id: "conv-1",
    transcript: "第一句",
  });
  await new Promise((resolve) => setImmediate(resolve));
  const firstResp = mmpgEvents.find(
    (event) => event.type === "assistant.audio.delta"
  )?.resp_id;
  assert.equal(typeof firstResp, "number");

  await controller.handleEvent({
    type: "user.audio.transcription.started",
    conv_id: "conv-2",
  });
  assert.ok(
    mmpgEvents.some((event) => event.type === "assistant.audio.cancel")
  );
  assert.equal(controller.status, "INTERRUPTED");

  await controller.handleEvent({
    type: "user.audio.transcription.done",
    conv_id: "conv-2",
    transcript: "第二句",
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const laterAudio = mmpgEvents
    .filter((event) => event.type === "assistant.audio.delta")
    .at(-1);
  assert.ok(laterAudio.resp_id > firstResp);
  assert.equal(call >= 2, true);
});

test("keeps inline tags for TTS but strips them from subtitles and history", async () => {
  const ttsRequests = [];
  const { controller, custom, donePromise } = makeController({
    systemPrompt: "你是病娇女友",
    agent: {
      async reply({ onDelta }) {
        await onDelta("[happy] 你终于回来啦。", { firstTokenLatencyMs: 8 });
        await onDelta("[soft] 今天有没有偷偷想我？", {
          firstTokenLatencyMs: 8,
        });
        return { text: "[happy] 你终于回来啦。[soft] 今天有没有偷偷想我？" };
      },
    },
    tts: {
      async synthesize(text, { onChunk }) {
        ttsRequests.push(text);
        await onChunk(Buffer.from([1]));
        return { chunks: 1 };
      },
    },
  });

  await controller.handleEvent({
    type: "user.audio.transcription.done",
    conv_id: "conv-1",
    transcript: "我回来了",
  });
  await donePromise;

  assert.ok(ttsRequests.some((text) => text.includes("[happy]")));
  const subtitles = custom
    .filter((item) => item.type === "subv")
    .flatMap((item) => item.value.data)
    .map((item) => item.text)
    .join("");
  assert.equal(subtitles.includes("[happy]"), false);
  assert.equal(subtitles.includes("[soft]"), false);
  assert.ok(subtitles.includes("你终于回来啦。"));
  const assistant = controller.messages.find(
    (message) => message.role === "assistant"
  );
  assert.equal(assistant.content.includes("[happy]"), false);
  assert.equal(assistant.content.includes("[soft]"), false);
});

test("strips tags from the welcome subtitle but speaks the original text", async () => {
  const ttsRequests = [];
  const { controller, custom } = makeController({
    welcomeMessage: "[happy] 你终于来啦。[soft] 我还以为你不会找我了呢。",
    tts: {
      async synthesize(text, { onChunk }) {
        ttsRequests.push(text);
        await onChunk(Buffer.from([1]));
        return { chunks: 1 };
      },
    },
  });

  await controller.handleEvent({
    type: "user.message",
    payload: JSON.stringify({ type: "client.ready" }),
  });
  await new Promise((resolve) => setImmediate(resolve));

  const welcome = custom
    .filter((item) => item.type === "subv")
    .flatMap((item) => item.value.data)
    .find((item) => item.userId === "agent-1");
  assert.equal(welcome.text, "你终于来啦。我还以为你不会找我了呢。");
  assert.ok(ttsRequests.some((text) => text.includes("[happy]")));
});

test("emits turn-relative subtitle timings from TTS alignment events", async () => {
  const { controller, custom, donePromise } = makeController({
    agent: {
      async reply({ onDelta }) {
        await onDelta("第一句。第二句。", { firstTokenLatencyMs: 5 });
        return { text: "第一句。第二句。" };
      },
    },
    tts: {
      async synthesize(text, { onChunk, onAlignment }) {
        await onChunk(Buffer.alloc(48000));
        await onAlignment({
          text,
          words: [
            { word: text.slice(0, 1), startTime: 0.1, endTime: 0.5 },
          ],
        });
        return { chunks: 1, bytes: 48000, durationSec: 1 };
      },
    },
  });

  await controller.handleEvent({
    type: "user.audio.transcription.done",
    conv_id: "conv-1",
    transcript: "你好",
  });
  await donePromise;

  const timings = custom
    .filter((item) => item.type === "subt")
    .flatMap((item) => item.value.data);
  assert.equal(timings.length, 2);
  assert.equal(timings[0].respId, 1);
  assert.equal(timings[0].text, "第一句。");
  assert.equal(timings[0].startTime, 0.1);
  assert.equal(timings[0].endTime, 0.5);
  assert.equal(timings[1].text, "第二句。");
  assert.equal(timings[1].startTime, 1.1);
  assert.equal(timings[1].endTime, 1.5);

  const assistantSubtitles = custom
    .filter((item) => item.type === "subv")
    .flatMap((item) => item.value.data)
    .filter((item) => item.userId === "agent-1");
  assert.ok(assistantSubtitles.every((item) => item.respId === 1));
});
