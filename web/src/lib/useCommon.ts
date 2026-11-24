/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import VERTC, { MediaType } from '@volcengine/rtc';
import { Modal } from '@arco-design/web-react';
import RtcClient from '@/lib/RtcClient';
import {
  clearCurrentMsg,
  clearHistoryMsg,
  localJoinRoom,
  localLeaveRoom,
  setActiveAgent,
  updateAIReadyState,
  updateAIGCState,
  updateLocalUser,
} from '@/store/slices/room';

import useRtcListeners from '@/lib/listenerHooks';
import { RootState } from '@/store';

import {
  updateMediaInputs,
  updateSelectedDevice,
  setDevicePermissions,
} from '@/store/slices/device';
import logger from '@/utils/logger';

export const ABORT_VISIBILITY_CHANGE = 'abortVisibilityChange';
export interface FormProps {
  username: string;
  roomId: string;
  publishAudio: boolean;
}

export const useScene = () => {
  const { scene, sceneConfigMap } = useSelector((state: RootState) => state.room);
  return sceneConfigMap[scene] || {};
};

export const useDeviceState = () => {
  const dispatch = useDispatch();
  const room = useSelector((state: RootState) => state.room);
  const localUser = room.localUser;
  const isAudioPublished = localUser.publishAudio;
  const isVideoPublished = localUser.publishVideo;
  const isScreenPublished = localUser.publishScreen;
  const queryDevices = async (type: MediaType) => {
    const mediaDevices = await RtcClient.getDevices({
      audio: type === MediaType.AUDIO,
      video: type === MediaType.VIDEO,
    });
    if (type === MediaType.AUDIO) {
      dispatch(
        updateMediaInputs({
          audioInputs: mediaDevices.audioInputs,
        })
      );
      dispatch(
        updateSelectedDevice({
          selectedMicrophone: mediaDevices.audioInputs[0]?.deviceId,
        })
      );
    } else {
      dispatch(
        updateMediaInputs({
          videoInputs: mediaDevices.videoInputs,
        })
      );
      dispatch(
        updateSelectedDevice({
          selectedCamera: mediaDevices.videoInputs[0]?.deviceId,
        })
      );
    }
    return mediaDevices;
  };

  const switchMic = async (controlPublish = true) => {
    logger.flow('DEVICE', '切换麦克风', {
      controlPublish,
      wasPublished: isAudioPublished,
    });
    try {
      if (controlPublish) {
        await (!isAudioPublished
          ? RtcClient.publishStream(MediaType.AUDIO)
          : RtcClient.unpublishStream(MediaType.AUDIO));
      }
      queryDevices(MediaType.AUDIO);
      await (!isAudioPublished ? RtcClient.startAudioCapture() : RtcClient.stopAudioCapture());
      dispatch(
        updateLocalUser({
          publishAudio: !isAudioPublished,
        })
      );
      logger.flow('DEVICE', '麦克风状态已更新', {
        publishAudio: !isAudioPublished,
      });
    } catch (error) {
      logger.error('[AIGC-FLOW][DEVICE] 麦克风切换失败', error);
      throw error;
    }
  };

  const switchCamera = async (controlPublish = true) => {
    logger.flow('DEVICE', '切换摄像头', {
      controlPublish,
      wasPublished: isVideoPublished,
    });
    try {
      if (controlPublish) {
        await (!isVideoPublished
          ? RtcClient.publishStream(MediaType.VIDEO)
          : RtcClient.unpublishStream(MediaType.VIDEO));
      }
      queryDevices(MediaType.VIDEO);
      await (!isVideoPublished ? RtcClient.startVideoCapture() : RtcClient.stopVideoCapture());
      dispatch(
        updateLocalUser({
          publishVideo: !isVideoPublished,
        })
      );
      logger.flow('DEVICE', '摄像头状态已更新', {
        publishVideo: !isVideoPublished,
      });
    } catch (error) {
      logger.error('[AIGC-FLOW][DEVICE] 摄像头切换失败', error);
      throw error;
    }
  };

  const switchScreenCapture = async (controlPublish = true) => {
    logger.flow('DEVICE', '切换屏幕共享', {
      controlPublish,
      wasPublished: isScreenPublished,
    });
    try {
      !isScreenPublished
        ? sessionStorage.setItem(ABORT_VISIBILITY_CHANGE, 'true')
        : sessionStorage.removeItem(ABORT_VISIBILITY_CHANGE);
      if (controlPublish) {
        await (!isScreenPublished
          ? RtcClient.publishScreenStream(MediaType.VIDEO)
          : RtcClient.unpublishScreenStream(MediaType.VIDEO));
      }
      await (!isScreenPublished ? RtcClient.startScreenCapture() : RtcClient.stopScreenCapture());
      dispatch(
        updateLocalUser({
          publishScreen: !isScreenPublished,
        })
      );
      logger.flow('DEVICE', '屏幕共享状态已更新', {
        publishScreen: !isScreenPublished,
      });
    } catch {
      logger.warn('[AIGC-FLOW][DEVICE] 屏幕共享未授权或被取消');
    }
    sessionStorage.removeItem(ABORT_VISIBILITY_CHANGE);
    return false;
  };

  return {
    isAudioPublished,
    isVideoPublished,
    isScreenPublished,
    switchMic,
    switchCamera,
    switchScreenCapture,
  };
};

export const useGetDevicePermission = () => {
  const [permission, setPermission] = useState<{
    audio: boolean;
  }>();

  const dispatch = useDispatch();

  useEffect(() => {
    (async () => {
      const permission = await RtcClient.checkPermission();
      dispatch(setDevicePermissions(permission));
      setPermission(permission);
    })();
  }, [dispatch]);
  return permission;
};

export const useJoin = (): [boolean, () => Promise<void | boolean>] => {
  const devicePermissions = useSelector((state: RootState) => state.device.devicePermissions);
  const room = useSelector((state: RootState) => state.room);

  const dispatch = useDispatch();

  const { id } = useScene();
  const { switchMic } = useDeviceState();
  const [joining, setJoining] = useState(false);
  const joiningRef = useRef(false);
  const listeners = useRtcListeners();

  async function disPatchJoin(): Promise<boolean | undefined> {
    if (joiningRef.current) {
      logger.flow('JOIN', '重复点击“通话”，忽略本次请求');
      return;
    }
    logger.flow('JOIN', '2. 开始加入通话流程', {
      sceneId: id,
      isAIGCEnable: room.isAIGCEnable,
      audioPermission: devicePermissions.audio,
    });
    joiningRef.current = true;
    setJoining(true);

    try {
      const isSupported = await VERTC.isSupported();
      logger.flow('JOIN', '3. 浏览器 RTC 能力检查完成', { isSupported });
      if (!isSupported) {
        Modal.error({
          title: '不支持 RTC',
          content: '您的浏览器可能不支持 RTC 功能，请尝试更换浏览器或升级浏览器后再重试。',
        });
        return false;
      }

      const session = await RtcClient.startAgent(id);
      dispatch(
        setActiveAgent({
          agentUserId: session.agentUserId,
          callId: session.callId,
          botId: session.botId || '',
          botName: session.botName || '',
        })
      );
      const rtc = RtcClient.basicInfo;
      logger.flow('RTC', '4. 动态会话已创建并设置 RTC 基础信息', {
        appId: rtc.app_id,
        roomId: rtc.room_id,
        userId: rtc.user_id,
        hasToken: Boolean(rtc.token),
      });
      dispatch(updateAIReadyState({ isAIReady: false }));

      /** 1. Create RTC Engine */
      await RtcClient.createEngine();
      logger.flow('RTC', '5. RTC 引擎创建完成');
      if (RtcClient.basicInfo.business_id) {
        RtcClient.setBusinessId(RtcClient.basicInfo.business_id);
      }

      /** 2.1 Set events callbacks */
      RtcClient.addEventListeners(listeners);
      logger.flow('RTC', '6. RTC 事件监听已绑定');

      /** 2.2 RTC starting to join room */
      logger.flow('RTC', '7. 开始加入 RTC 房间', {
        roomId: RtcClient.basicInfo.room_id,
        userId: RtcClient.basicInfo.user_id,
      });
      await RtcClient.joinRoom();
      logger.flow('RTC', '8. RTC 房间加入成功');
      /** 3. Set users' devices info */
      const mediaDevices = await RtcClient.getDevices({
        audio: true,
        video: false,
      });
      logger.flow('DEVICE', '9. 音频设备枚举完成', {
        audioInputs: mediaDevices.audioInputs.length,
        audioOutputs: mediaDevices.audioOutputs.length,
      });

      dispatch(
        localJoinRoom({
          roomId: RtcClient.basicInfo.room_id,
          user: {
            username: RtcClient.basicInfo.user_id,
            userId: RtcClient.basicInfo.user_id,
          },
        })
      );
      dispatch(
        updateSelectedDevice({
          selectedMicrophone: mediaDevices.audioInputs[0]?.deviceId,
          selectedCamera: mediaDevices.videoInputs[0]?.deviceId,
        })
      );
      dispatch(updateMediaInputs(mediaDevices));
      logger.flow('STATE', '10. 已进入房间，UI 切换到 Room', {
        roomId: RtcClient.basicInfo.room_id,
        userId: RtcClient.basicInfo.user_id,
      });

      try {
        logger.flow('MIC', '11. 发布麦克风并开始音频采集');
        await switchMic();
        logger.flow('MIC', '12. 麦克风已启动');
        RtcClient.markMicReady();
      } catch (error) {
        logger.warn('[AIGC-FLOW][MIC] 麦克风启动失败，继续上报客户端就绪', error);
        RtcClient.markMicReady();
      }

      setTimeout(() => {
        RtcClient.sendClientReady(true);
      }, 3000);
      dispatch(updateAIGCState({ isAIGCEnable: true }));
      logger.flow('JOIN', '13. 加入通话流程完成');
      return true;
    } catch (error) {
      logger.error('[AIGC-FLOW][JOIN] 加入通话失败，开始回滚', error);
      try {
        await RtcClient.stopAgent(id);
      } catch {
        // Start may have failed before an agent became active.
      }
      if (RtcClient.engine) {
        RtcClient.leaveRoom();
      }
      dispatch(localLeaveRoom());
      dispatch(updateAIGCState({ isAIGCEnable: false }));
      logger.flow('JOIN', '回滚完成，已恢复未入房状态');
      return false;
    } finally {
      joiningRef.current = false;
      setJoining(false);
      logger.flow('JOIN', '加入流程结束', { joining: false });
    }
  }

  return [joining, disPatchJoin];
};

export const useLeave = () => {
  const dispatch = useDispatch();
  const { id } = useScene();
  const idRef = useRef(id);
  idRef.current = id;

  return useCallback(
    async function () {
      logger.flow('LEAVE', '1. 开始挂断通话', { sceneId: idRef.current });
      try {
        await Promise.allSettled([
          RtcClient.stopAudioCapture(),
          RtcClient.stopScreenCapture(),
          RtcClient.stopVideoCapture(),
        ]);
        logger.flow('LEAVE', '2. 本地音视频采集已停止');
        await RtcClient.stopAgent(idRef.current);
        logger.flow('LEAVE', '3. 已请求停止云端智能体');
      } catch (error) {
        logger.error('[AIGC-FLOW][LEAVE] 挂断过程中出现错误', error);
        throw error;
      } finally {
        RtcClient.leaveRoom();
        logger.flow('LEAVE', '4. 已离开 RTC 房间并销毁引擎');
        dispatch(clearHistoryMsg());
        dispatch(clearCurrentMsg());
        dispatch(localLeaveRoom());
        dispatch(updateAIGCState({ isAIGCEnable: false }));
        logger.flow('LEAVE', '5. 挂断完成，UI 回到 Antechamber');
      }
    },
    [dispatch]
  );
};
