import { describe, expect, jest, test } from '@jest/globals';
import reducer, {
  appendTrace,
  localLeaveRoom,
  setActiveAgent,
  updateAIGCState,
  updateAIReadyState,
  updateScene,
  updateSceneConfig,
  setHistoryMsg,
} from './room';

jest.mock('@volcengine/rtc', () => ({
  NetworkQuality: { UNKNOWN: 0 },
}));

jest.mock('@/lib/RtcClient', () => ({
  __esModule: true,
  default: { setBasicInfo: () => undefined },
}));

describe('room AI readiness', () => {
  test('tracks conversation readiness independently from subtitles', () => {
    let state = reducer(undefined, { type: 'room/init' });

    state = reducer(state, updateAIGCState({ isAIGCEnable: true }));
    state = reducer(state, updateAIReadyState({ isAIReady: true }));

    expect(state.msgHistory).toHaveLength(0);
    expect(state.isAIReady).toBe(true);
  });

  test('resets conversation readiness when leaving', () => {
    let state = reducer(undefined, { type: 'room/init' });
    state = reducer(state, updateAIGCState({ isAIGCEnable: true }));
    state = reducer(state, updateAIReadyState({ isAIReady: true }));

    state = reducer(state, localLeaveRoom());

    expect(state.isAIGCEnable).toBe(false);
    expect(state.isAIReady).toBe(false);
  });
});

test('preserves incremental avatar subtitles and paragraph boundaries', () => {
  let state = reducer(undefined, { type: 'room/init' });
  state = reducer(state, updateScene('avatar'));
  state = reducer(
    state,
    updateSceneConfig({
      avatar: { id: 'avatar', botName: 'agent', isAvatarScene: true },
    })
  );
  for (const [text, paragraph] of [
    ['hello ', false],
    ['world', true],
    ['next', false],
  ]) {
    state = reducer(state, setHistoryMsg({ user: 'agent', text, paragraph, definite: true }));
  }
  expect(state.msgHistory.map(({ value }) => value)).toEqual(['hello world', 'next']);
});

test('attributes subtitles to the server-issued agent user id', () => {
  let state = reducer(undefined, { type: 'room/init' });
  state = reducer(
    state,
    setActiveAgent({
      agentUserId: 'agent_call_1',
      callId: 'call_1',
      botId: 'xbotrbBWpRQkA',
      botName: '情感陪伴-自有 agent',
    })
  );
  state = reducer(
    state,
    setHistoryMsg({
      user: 'agent_call_1',
      text: '你好呀',
      definite: true,
      paragraph: true,
    })
  );

  expect(state.activeBotId).toBe('xbotrbBWpRQkA');
  expect(state.activeBotName).toBe('情感陪伴-自有 agent');
  expect(state.msgHistory).toHaveLength(1);
  expect(state.msgHistory[0].user).toBe('agent_call_1');
});

test('keeps a bounded trace history and resets it on leave', () => {
  let state = reducer(undefined, { type: 'room/init' });
  state = reducer(state, appendTrace({ stage: 'asr.done', latencyMs: 42 }));
  state = reducer(state, appendTrace({ stage: 'llm.first_token', latencyMs: 73 }));

  expect(state.traceEntries.map(({ stage }) => stage)).toEqual([
    'asr.done',
    'llm.first_token',
  ]);

  state = reducer(state, localLeaveRoom());
  expect(state.traceEntries).toEqual([]);
});
