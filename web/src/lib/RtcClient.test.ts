import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('@volcengine/rtc', () => ({
  __esModule: true,
  default: {},
  MirrorType: {},
  StreamIndex: {},
  RoomProfileType: {},
  MediaType: {},
  StreamRemoveReason: {},
  AudioProfileType: {},
  VideoRenderMode: {},
  NetworkQuality: { UNKNOWN: 0 },
}));
jest.mock('@volcengine/rtc/extension-ainr', () => ({
  __esModule: true,
  default: class {},
}));

const { TextDecoder, TextEncoder } = require('util');
(global as any).TextDecoder = TextDecoder;
(global as any).TextEncoder = TextEncoder;

const RtcClient = require('./RtcClient').default;

const client = RtcClient as any;

describe('RtcClient custom messages', () => {
  beforeEach(() => {
    client.engine = {
      sendUserBinaryMessage: jest.fn(async () => undefined),
    };
    client.activeAgentUserId = 'agent-1';
    client.micReady = false;
    client.agentReady = false;
    client.clientReadySent = false;
  });

  afterEach(() => {
    client.engine = undefined;
    client.activeAgentUserId = '';
    client.micReady = false;
    client.agentReady = false;
    client.clientReadySent = false;
  });

  test('sends client.ready once after both mic and agent are ready', () => {
    client.markMicReady();
    expect(client.engine.sendUserBinaryMessage).not.toHaveBeenCalled();

    client.markAgentReady('agent-1');
    client.markAgentReady('agent-1');

    expect(client.engine.sendUserBinaryMessage).toHaveBeenCalledTimes(1);
    const [userId, bytes] = client.engine.sendUserBinaryMessage.mock.calls[0];
    expect(userId).toBe('agent-1');
    expect(String.fromCharCode(...new Uint8Array(bytes).slice(0, 4))).toBe('cmsg');
  });

  test('wraps user messages in cmsg TLV', () => {
    client.sendUserMessage({ type: 'client.interrupt' });

    expect(client.engine.sendUserBinaryMessage).toHaveBeenCalledTimes(1);
    const [, bytes] = client.engine.sendUserBinaryMessage.mock.calls[0];
    expect(String.fromCharCode(...new Uint8Array(bytes).slice(0, 4))).toBe('cmsg');
  });
});
