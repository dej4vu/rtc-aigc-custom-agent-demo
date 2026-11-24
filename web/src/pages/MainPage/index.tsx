/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

import { useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import Header from '@/components/Header';
import ResizeWrapper from '@/components/ResizeWrapper';
import Menu from './Menu';
import { useIsMobile } from '@/utils/utils';
import Apis from '@/app/index';
import MainArea from './MainArea';
import { ABORT_VISIBILITY_CHANGE, useLeave } from '@/lib/useCommon';
import { SceneConfig, updateScene, updateSceneConfig } from '@/store/slices/room';
import styles from './index.module.less';
import RtcClient from '@/lib/RtcClient';
import logger from '@/utils/logger';

export default function () {
  const leaveRoom = useLeave();
  const dispatch = useDispatch();

  const getScenes = useCallback(async () => {
    logger.flow('PAGE', '请求 /getScenes，创建页面会话');
    try {
      const {
        SessionID,
        scenes,
      }: {
        SessionID: string;
        scenes: {
          scene: SceneConfig;
        }[];
      } = await Apis.Basic.getScenes({});
      logger.flow('PAGE', '/getScenes 返回', {
        sessionId: SessionID,
        scenes: scenes.map(({ scene }) => ({
          sceneId: scene.id,
          sceneName: scene.name,
          botName: scene.botName,
          botId: scene.botId,
        })),
      });
      RtcClient.setSessionId(SessionID);
      dispatch(updateScene(scenes[0].scene.id));
      dispatch(
        updateSceneConfig(
          scenes.reduce<Record<string, SceneConfig>>((prev, cur) => {
            prev[cur.scene.id] = cur.scene;
            return prev;
          }, {})
        )
      );
      logger.flow('PAGE', '场景配置已写入 Redux', {
        defaultScene: scenes[0]?.scene.id,
        sceneCount: scenes.length,
      });
    } catch (error) {
      logger.error('[AIGC-FLOW][PAGE] /getScenes 失败', error);
      throw error;
    }
  }, [dispatch]);

  useEffect(() => {
    logger.flow('PAGE', '页面初始化，开始加载场景');
    getScenes();
    const isOriginalDemo = window.location.host.startsWith('localhost');
    const handler = () => {
      if (
        document.visibilityState === 'hidden' &&
        !sessionStorage.getItem(ABORT_VISIBILITY_CHANGE)
      ) {
        logger.flow('PAGE', '页面进入后台，自动执行挂断');
        leaveRoom();
      }
    };
    !isOriginalDemo && document.addEventListener('visibilitychange', handler);
    return () => {
      !isOriginalDemo && document.removeEventListener('visibilitychange', handler);
    };
  }, [getScenes, leaveRoom]);

  useEffect(() => {
    const stopOnPageHide = () => {
      logger.flow('PAGE', '收到 pagehide，发送停止智能体信标');
      RtcClient.stopAgentOnUnload();
    };
    window.addEventListener('pagehide', stopOnPageHide);
    return () => window.removeEventListener('pagehide', stopOnPageHide);
  }, []);

  return (
    <ResizeWrapper className={styles.container}>
      <Header />
      <div
        className={styles.main}
        style={{
          padding: useIsMobile() ? '' : '24px',
        }}
      >
        <div className={`${styles.mainArea} ${useIsMobile() ? styles.isMobile : ''}`}>
          <MainArea />
        </div>
        {useIsMobile() ? null : (
          <div className={styles.operationArea}>
            <Menu />
          </div>
        )}
      </div>
    </ResizeWrapper>
  );
}
