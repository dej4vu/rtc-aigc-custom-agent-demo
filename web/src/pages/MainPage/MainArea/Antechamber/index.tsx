/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import RtcClient from '@/lib/RtcClient';
import { isMobile } from '@/utils/utils';
import InvokeButton from '@/pages/MainPage/MainArea/Antechamber/InvokeButton';
import { useJoin, useScene } from '@/lib/useCommon';
import AIChangeCard from '@/components/AiChangeCard';
import { updateFullScreen, updateShowSubtitle } from '@/store/slices/room';
import style from './index.module.less';
import logger from '@/utils/logger';

function Antechamber() {
  const dispatch = useDispatch();
  const [joining, dispatchJoin] = useJoin();
  const room = useSelector((state: RootState) => state.room);
  const { id, isScreenMode, isAvatarScene } = useScene();
  const sessionReady = Boolean(RtcClient.sessionId) && Boolean(room.sceneConfigMap[id]);

  const handleJoinRoom = () => {
    if (!sessionReady) {
      logger.warn('[AIGC-FLOW][UI] 会话尚未初始化，已阻止发起通话');
      return;
    }
    logger.flow('UI', '1. 点击“通话”按钮', {
      sceneId: id,
      isScreenMode,
      isAvatarScene,
      sessionReady,
      joining,
    });
    // 本 Demo 是纯音频场景，不使用全屏视频卡片。
    dispatch(updateFullScreen({ isFullScreen: false }));
    dispatch(updateShowSubtitle({ isShowSubtitle: !isAvatarScene }));

    if (!joining) {
      dispatchJoin();
    }
  };

  return (
    <div className={`${style.wrapper} ${isMobile() ? style.mobile : ''}`}>
      <AIChangeCard />
      <InvokeButton
        onClick={handleJoinRoom}
        loading={joining || !sessionReady}
        className={style['invoke-btn']}
      />
      {isMobile() ? null : (
        <div className={style.description}>Powered by 豆包大模型和火山引擎视频云 RTC</div>
      )}
    </div>
  );
}

export default Antechamber;
