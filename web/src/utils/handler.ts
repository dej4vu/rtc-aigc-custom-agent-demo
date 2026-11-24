/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

import { useDispatch } from 'react-redux';
import logger from './logger';
import {
  appendTrace,
  setHistoryMsg,
  setInterruptMsg,
  TraceEntry,
  updateAIReadyState,
  updateAITalkState,
  updateAIThinkState,
} from '@/store/slices/room';
import RtcClient from '@/lib/RtcClient';
import { string2tlv } from '@/utils/utils';
import { parseMmpgMessage } from '@/utils/mmpg';

export type AnyRecord = Record<string, any>;

export enum MESSAGE_TYPE {
  BRIEF = 'conv',
  SUBTITLE = 'subv',
  FUNCTION_CALL = 'tool',
  TRACE = 'trace',
}

export enum AGENT_BRIEF {
  UNKNOWN,
  LISTENING,
  THINKING,
  SPEAKING,
  INTERRUPTED,
  FINISHED,
}

/**
 * @brief 指令类型
 */
export enum COMMAND {
  /**
   * @brief 打断指令
   */
  INTERRUPT = 'interrupt',
  /**
   * @brief 发送外部文本驱动 TTS
   */
  EXTERNAL_TEXT_TO_SPEECH = 'ExternalTextToSpeech',
  /**
   * @brief 发送外部文本驱动 LLM
   */
  EXTERNAL_TEXT_TO_LLM = 'ExternalTextToLLM',
}
/**
 * @brief 打断的类型
 */
export enum INTERRUPT_PRIORITY {
  /**
   * @brief 占位
   */
  NONE,
  /**
   * @brief 高优先级。传入信息直接打断交互，进行处理。
   */
  HIGH,
  /**
   * @brief 中优先级。等待当前交互结束后，进行处理。
   */
  MEDIUM,
  /**
   * @brief 低优先级。如当前正在发生交互，直接丢弃 Message 传入的信息。
   */
  LOW,
}

export const MessageTypeCode = {
  [MESSAGE_TYPE.SUBTITLE]: 1,
  [MESSAGE_TYPE.FUNCTION_CALL]: 2,
  [MESSAGE_TYPE.BRIEF]: 3,
};

export const useMessageHandler = () => {
  const dispatch = useDispatch();

  const maps: Record<string, (parsed: AnyRecord) => void> = {
    /**
     * @brief 接收状态变化信息
     * @note https://www.volcengine.com/docs/6348/1415216?s=g
     */
    [MESSAGE_TYPE.BRIEF]: (parsed: AnyRecord) => {
      const { Stage } = parsed || {};
      const { Code, Description } = Stage || {};
      const stageCode = Number(Code);
      logger.flow('AI-STATE', '收到 AI 会话状态', {
        stageCode,
        description: Description,
      });
      logger.debug('[MESSAGE_TYPE.BRIEF]: ', stageCode, Description);
      if (Number.isFinite(stageCode) && stageCode !== AGENT_BRIEF.UNKNOWN) {
        dispatch(updateAIReadyState({ isAIReady: true }));
      }
      switch (stageCode) {
        case AGENT_BRIEF.THINKING:
          dispatch(updateAIThinkState({ isAIThinking: true }));
          break;
        case AGENT_BRIEF.SPEAKING:
          dispatch(updateAITalkState({ isAITalking: true }));
          break;
        case AGENT_BRIEF.FINISHED:
          dispatch(updateAITalkState({ isAITalking: false }));
          break;
        case AGENT_BRIEF.INTERRUPTED:
          dispatch(setInterruptMsg());
          break;
        default:
          break;
      }
    },
    /**
     * @brief 字幕
     * @note https://www.volcengine.com/docs/6348/1337284?s=g
     */
    [MESSAGE_TYPE.SUBTITLE]: (parsed: AnyRecord) => {
      const data = parsed.data?.[0] || {};
      /** debounce 记录用户输入文字 */
      if (data) {
        const { text: msg, definite, userId: user, paragraph } = data;
        const isAudioEnable = RtcClient.getAgentEnabled();
        logger.flow('SUBTITLE', '收到字幕片段', {
          user,
          definite,
          paragraph,
          text: typeof msg === 'string' ? msg.slice(0, 80) : msg,
        });
        if ((window as any)._debug_mode) {
          logger.debug('handleRoomBinaryMessageReceived', data);
        }
        if (isAudioEnable) {
          dispatch(setHistoryMsg({ text: msg, user, paragraph, definite }));
        }
      }
    },
    /**
     * @brief Function calling
     * @note https://www.volcengine.com/docs/6348/1359441?s=g
     */
    [MESSAGE_TYPE.FUNCTION_CALL]: (parsed: AnyRecord) => {
      const name: string = parsed?.tool_calls?.[0]?.function?.name;
      logger.flow('TOOL', '收到 Function Call', {
        name,
        toolCallId: parsed?.tool_calls?.[0]?.id,
        replyTo: 'RobotMan_',
      });
      const map: Record<string, string> = {
        getcurrentweather: '今天下雪， 最低气温零下10度',
      };

      if (RtcClient.engine) {
        RtcClient.engine.sendUserBinaryMessage(
          'RobotMan_',
          string2tlv(
            JSON.stringify({
              ToolCallID: parsed?.tool_calls?.[0]?.id,
              Content: map[name?.toLocaleLowerCase().replaceAll('_', '') || ''],
            }),
            'func'
          )
        );
      }
    },
    /**
     * @brief 本 Demo 自建的链路追踪事件
     */
    [MESSAGE_TYPE.TRACE]: (parsed: AnyRecord) => {
      if (!parsed || typeof parsed.stage !== 'string') {
        return;
      }
      dispatch(appendTrace(parsed as TraceEntry));
      logger.flow('TRACE', `链路阶段 ${parsed.stage}`, parsed);
    },
  };

  return {
    parser: (buffer: ArrayBuffer) => {
      const preview = Array.from(new Uint8Array(buffer).slice(0, 48))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(' ');
      try {
        const { type, value } = parseMmpgMessage(buffer);
        logger.flow('RTC-DATA', 'MMPG 消息解析完成', {
          type,
          valuePreview: JSON.stringify(value).slice(0, 160),
        });
        maps[type]?.(value);
      } catch (e) {
        logger.error('[AIGC-FLOW][RTC-DATA] MMPG 消息解析失败', { error: e, hex: preview });
      }
    },
  };
};
