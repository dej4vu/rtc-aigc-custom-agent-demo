/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import styles from './TracePanel.module.less';

const STAGE_LABEL: Record<string, string> = {
  'mmpg.session.created': 'MMPG 会话',
  'client.ready': '客户端就绪',
  'client.ready.timeout': '就绪超时',
  'asr.conversation.created': 'ASR 开始',
  'asr.started': 'ASR 首字',
  'asr.done': 'ASR 完成',
  'asr.empty': 'ASR 空结果',
  'asr.canceled': 'ASR 取消',
  'llm.first_token': 'LLM 首 Token',
  'llm.done': 'LLM 完成',
  'llm.empty': 'LLM 空回复',
  'tts.first_chunk': 'TTS 首包',
  'playback.started': '开始播放',
  'playback.done': '播放完成',
  'playback.canceled': '播放取消',
  barge_in: '用户打断',
  'turn.finished': '本轮结束',
  error: '错误',
};

function formatLatency(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '';
  }
  return `${value}ms`;
}

function TracePanel() {
  const traceEntries = useSelector((state: RootState) => state.room.traceEntries);
  const recent = traceEntries.slice(-8).reverse();

  if (!recent.length) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <span>全链路 Trace</span>
          <span className={styles.count}>等待事件</span>
        </div>
        <div className={styles.empty}>RTC 加入后显示 ASR / LLM / TTS 阶段</div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>全链路 Trace</span>
        <span className={styles.count}>{traceEntries.length}</span>
      </div>
      {recent.map((entry, index) => (
        <div
          key={`${entry.stage}-${entry.at || index}-${index}`}
          className={`${styles.row} ${entry.stage === 'error' ? styles.error : ''}`}
        >
          <span className={styles.stage}>{STAGE_LABEL[entry.stage] || entry.stage}</span>
          <span className={styles.meta}>
            {formatLatency(entry.latencyMs)}
            {entry.respId ? ` · r${entry.respId}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

export default TracePanel;
