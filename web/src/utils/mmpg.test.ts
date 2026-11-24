import { encodeMmpgMessage, parseMmpgMessage } from './mmpg';
import { string2tlv } from './utils';

beforeAll(() => {
  const { TextEncoder, TextDecoder } = require('util');
  (global as any).TextEncoder = TextEncoder;
  (global as any).TextDecoder = TextDecoder;
});

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).buffer;

describe('parseMmpgMessage', () => {
  test('parses the direct UTF-8 JSON envelope used by this demo', () => {
    const parsed = parseMmpgMessage(
      encode({
        v: 1,
        type: 'trace',
        value: { stage: 'llm.first_token', latencyMs: 12 },
      })
    );

    expect(parsed).toEqual({
      type: 'trace',
      value: { stage: 'llm.first_token', latencyMs: 12 },
    });
  });

  test('parses a Base64 wrapped JSON envelope', () => {
    const payload = {
      v: 1,
      type: 'conv',
      value: { Stage: { Code: 3, Description: 'speaking' } },
    };
    const base64 = btoa(String.fromCharCode(...new Uint8Array(encode(payload))));
    const base64Buffer = new TextEncoder().encode(base64).buffer;

    expect(parseMmpgMessage(base64Buffer)).toEqual({
      type: 'conv',
      value: payload.value,
    });
  });

  test('keeps compatibility with the legacy RTS TLV format', () => {
    const body = JSON.stringify({
      data: [{ text: '你好', userId: 'web-1', definite: true, paragraph: true }],
    });
    const parsed = parseMmpgMessage(string2tlv(body, 'subv'));

    expect(parsed.type).toBe('subv');
    expect(parsed.value.data[0].text).toBe('你好');
  });

  test('unwraps the RTC cmsg wrapper and its quoted JSON payload', () => {
    const envelope = {
      v: 1,
      type: 'trace',
      value: { stage: 'tts.first_chunk', latencyMs: 88 },
    };
    const parsed = parseMmpgMessage(string2tlv(JSON.stringify(JSON.stringify(envelope)), 'cmsg'));

    expect(parsed).toEqual({
      type: 'trace',
      value: envelope.value,
    });
  });

  test('rejects malformed messages instead of dispatching an empty event', () => {
    expect(() => parseMmpgMessage(encode('not-json'))).toThrow('无法解析 MMPG 消息');
  });
});

describe('encodeMmpgMessage', () => {
  test('wraps the JSON payload in cmsg TLV exactly once', () => {
    const payload = {
      type: 'client.ready',
      value: { at: 1700000000000, hasMic: true },
    };
    const encoded = new Uint8Array(encodeMmpgMessage(payload));
    const magic = String.fromCharCode(...encoded.slice(0, 4));
    const length = ((encoded[4] << 24) | (encoded[5] << 16) | (encoded[6] << 8) | encoded[7]) >>> 0;
    const body = new TextDecoder().decode(encoded.slice(8, 8 + length));

    expect(magic).toBe('cmsg');
    expect(length).toBe(encoded.length - 8);
    expect(JSON.parse(body)).toEqual(payload);
    expect(parseMmpgMessage(encoded.buffer as ArrayBuffer)).toEqual({
      type: 'client.ready',
      value: payload.value,
    });
  });
});
