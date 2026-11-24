/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

import { string2tlv, tlv2String } from './utils';

export type MmpgValue = Record<string, any>;

/**
 * 客户端经 RTC 数据通道发给 MMPG 的自定义消息。
 * MMPG 会去掉 `cmsg` TLV 头，并把内层 JSON 作为 `user.message.payload` 下发。
 * 内层必须是普通 JSON，不能再 JSON.stringify 一次，否则服务端会收到双层引号。
 */
export const encodeMmpgMessage = (payload: Record<string, unknown>): ArrayBuffer =>
  string2tlv(JSON.stringify(payload), 'cmsg');

const decodeJson = (text: string): MmpgValue | null => {
  if (!text) {
    return null;
  }
  try {
    let parsed = JSON.parse(text);
    // RTC custom messages can carry the server payload as a JSON string inside
    // the cmsg envelope, so unwrap one additional string layer if present.
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * MMPG 自定义消息有多种可能形态：
 * 1. 服务端直接发送 UTF-8 JSON（本 Demo 使用）；
 * 2. 平台把 payload 包成 Base64；
 * 3. RTC 自定义消息使用 cmsg + length + payload 的 TLV 包装；
 * 4. 旧版 RTS 字幕/指令使用 TLV。
 */
export const parseMmpgMessage = (buffer: ArrayBuffer): { type: string; value: MmpgValue } => {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 8) {
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const length = (bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7];
    if (/^(cmsg|conv|subv|tool|func|ctrl)$/.test(magic) && length <= bytes.length - 8) {
      const { type, value } = tlv2String(buffer);
      const decoded = decodeJson(value) || {};
      if (type === 'cmsg' && typeof decoded.type === 'string') {
        return {
          type: decoded.type,
          value: (decoded.value ?? decoded) as MmpgValue,
        };
      }
      return { type, value: decoded };
    }
  }

  const text = new TextDecoder().decode(bytes).trim();
  const direct = decodeJson(text);
  if (direct) {
    if (typeof direct.type === 'string') {
      return { type: direct.type, value: (direct.value ?? direct) as MmpgValue };
    }
    return { type: '', value: direct };
  }

  try {
    const binary = atob(text.replace(/\s+/g, ''));
    const decodedBytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const base64Json = decodeJson(new TextDecoder().decode(decodedBytes).trim());
    if (base64Json && typeof base64Json.type === 'string') {
      return {
        type: base64Json.type,
        value: (base64Json.value ?? base64Json) as MmpgValue,
      };
    }
  } catch {
    // Not base64; fall through to the explicit error below.
  }
  throw new Error('无法解析 MMPG 消息');
};
