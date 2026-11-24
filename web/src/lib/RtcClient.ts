/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

import VERTC, {
  MirrorType,
  StreamIndex,
  IRTCEngine,
  RoomProfileType,
  onUserJoinedEvent,
  onUserLeaveEvent,
  MediaType,
  LocalStreamStats,
  RemoteStreamStats,
  StreamRemoveReason,
  LocalAudioPropertiesInfo,
  RemoteAudioPropertiesInfo,
  AudioProfileType,
  DeviceInfo,
  AutoPlayFailedEvent,
  PlayerEvent,
  NetworkQuality,
  VideoRenderMode,
  ScreenEncoderConfig,
} from '@volcengine/rtc';
import RTCAIAnsExtension from '@volcengine/rtc/extension-ainr';
import { Message } from '@arco-design/web-react';
import Apis from '@/app/index';
import { AIGC_PROXY_HOST } from '@/config';
import { COMMAND, INTERRUPT_PRIORITY } from '@/utils/handler';
import logger from '@/utils/logger';
import { encodeMmpgMessage } from '@/utils/mmpg';

export interface IEventListener {
  handleError: (e: { errorCode: any }) => void;
  handleUserJoin: (e: onUserJoinedEvent) => void;
  handleUserLeave: (e: onUserLeaveEvent) => void;
  handleTrackEnded: (e: { kind: string; isScreen: boolean }) => void;
  handleUserPublishStream: (e: { userId: string; mediaType: MediaType }) => void;
  handleUserUnpublishStream: (e: {
    userId: string;
    mediaType: MediaType;
    reason: StreamRemoveReason;
  }) => void;
  handleRemoteStreamStats: (e: RemoteStreamStats) => void;
  handleLocalStreamStats: (e: LocalStreamStats) => void;
  handleLocalAudioPropertiesReport: (e: LocalAudioPropertiesInfo[]) => void;
  handleRemoteAudioPropertiesReport: (e: RemoteAudioPropertiesInfo[]) => void;
  handleAudioDeviceStateChanged: (e: DeviceInfo) => void;
  handleAutoPlayFail: (e: AutoPlayFailedEvent) => void;
  handlePlayerEvent: (e: PlayerEvent) => void;
  handleRoomBinaryMessageReceived: (e: { userId: string; message: ArrayBuffer }) => void;
  handleNetworkQuality: (
    uplinkNetworkQuality: NetworkQuality,
    downlinkNetworkQuality: NetworkQuality
  ) => void;
}

export interface BasicBody {
  app_id: string;
  business_id?: string;
  room_id: string;
  user_id: string;
  token?: string;
}

export interface RuntimeRTCConfig {
  AppId: string;
  BusinessId?: string;
  RoomId: string;
  UserId: string;
  Token: string;
  ExpiresAt?: string;
}

export interface StartSessionResult {
  callId: string;
  agentUserId: string;
  botId?: string;
  botName?: string;
  RTC: RuntimeRTCConfig;
  scene?: Record<string, any>;
}

/**
 * @brief RTC Core Client
 * @notes Refer to official website documentation to get more information about the API.
 */
export class RTCClient {
  engine!: IRTCEngine;

  basicInfo!: BasicBody;

  sessionId = '';

  activeSceneId = '';

  private _audioCaptureDevice?: string;

  private _videoCaptureDevice?: string;

  audioBotEnabled = false;

  audioBotStartTime = 0;

  activeAgentUserId = '';

  activeCallId = '';

  activeBotId = '';

  activeBotName = '';

  private micReady = false;

  private agentReady = false;

  private clientReadySent = false;

  setSessionId = (sessionId: string) => {
    this.sessionId = sessionId;
  };

  setBasicInfo = ({ AppId, BusinessId, RoomId, UserId, Token }: RuntimeRTCConfig) => {
    this.basicInfo = {
      app_id: AppId,
      business_id: BusinessId,
      room_id: RoomId,
      user_id: UserId,
      token: Token,
    };
  };

  markMicReady = () => {
    this.micReady = true;
    this.maybeSendClientReady();
  };

  markAgentReady = (agentUserId: string) => {
    if (!this.activeAgentUserId || agentUserId !== this.activeAgentUserId) {
      return;
    }
    this.agentReady = true;
    this.maybeSendClientReady();
  };

  maybeSendClientReady = (force = false) => {
    if (this.clientReadySent || !this.engine || !this.activeAgentUserId) {
      return false;
    }
    if (!force && (!this.micReady || !this.agentReady)) {
      return false;
    }
    this.clientReadySent = true;
    logger.flow('AGENT-CLIENT', '上报 client.ready', {
      micReady: this.micReady,
      agentReady: this.agentReady,
    });
    const payload = {
      type: 'client.ready',
      value: {
        at: Date.now(),
        hasMic: this.micReady,
      },
    };
    this.sendCustomBinary(payload);
    return true;
  };

  private sendCustomBinary = (payload: Record<string, unknown>) => {
    const bytes = encodeMmpgMessage(payload);
    try {
      const result = this.engine.sendUserBinaryMessage(
        this.activeAgentUserId,
        bytes as ArrayBuffer
      );
      Promise.resolve(result).then(
        () => logger.flow('AGENT-CLIENT', 'client 消息发送成功', { type: payload.type }),
        (error) => logger.error('[AIGC-FLOW][AGENT-CLIENT] client 消息发送失败', error)
      );
    } catch (error) {
      logger.error('[AIGC-FLOW][AGENT-CLIENT] client 消息发送异常', error);
    }
  };

  sendUserMessage = (payload: Record<string, unknown>) => {
    if (!this.engine || !this.activeAgentUserId) {
      logger.warn('[AIGC-FLOW][AGENT-CLIENT] 自定义消息未发送：引擎或 Agent UserId 缺失', {
        type: payload.type,
      });
      return false;
    }
    this.sendCustomBinary(payload);
    return true;
  };

  sendClientReady = (force = false) => {
    this.micReady = true;
    return this.maybeSendClientReady(force);
  };

  getActiveAgentUserId = () => this.activeAgentUserId;

  createEngine = async () => {
    logger.flow('RTC-ENGINE', '创建 RTC 引擎', {
      appId: this.basicInfo.app_id,
      hasToken: Boolean(this.basicInfo.token),
    });
    this.engine = VERTC.createEngine(this.basicInfo.app_id);
    try {
      const AIAnsExtension = new RTCAIAnsExtension();
      await this.engine.registerExtension(AIAnsExtension);
      AIAnsExtension.enable();
      logger.flow('RTC-ENGINE', 'AI 降噪扩展已启用');
    } catch (error) {
      logger.warn('[AIGC-FLOW][RTC-ENGINE] AI 降噪不可用，继续使用默认音频处理', error);
    }
  };

  addEventListeners = ({
    handleError,
    handleUserJoin,
    handleUserLeave,
    handleTrackEnded,
    handleUserPublishStream,
    handleUserUnpublishStream,
    handleRemoteStreamStats,
    handleLocalStreamStats,
    handleLocalAudioPropertiesReport,
    handleRemoteAudioPropertiesReport,
    handleAudioDeviceStateChanged,
    handleAutoPlayFail,
    handlePlayerEvent,
    handleRoomBinaryMessageReceived,
    handleNetworkQuality,
  }: IEventListener) => {
    this.engine.on(VERTC.events.onError, handleError);
    this.engine.on(VERTC.events.onUserJoined, handleUserJoin);
    this.engine.on(VERTC.events.onUserLeave, handleUserLeave);
    this.engine.on(VERTC.events.onTrackEnded, handleTrackEnded);
    this.engine.on(VERTC.events.onUserPublishStream, handleUserPublishStream);
    this.engine.on(VERTC.events.onUserUnpublishStream, handleUserUnpublishStream);
    this.engine.on(VERTC.events.onRemoteStreamStats, handleRemoteStreamStats);
    this.engine.on(VERTC.events.onLocalStreamStats, handleLocalStreamStats);
    this.engine.on(VERTC.events.onAudioDeviceStateChanged, handleAudioDeviceStateChanged);
    this.engine.on(VERTC.events.onLocalAudioPropertiesReport, handleLocalAudioPropertiesReport);
    this.engine.on(VERTC.events.onRemoteAudioPropertiesReport, handleRemoteAudioPropertiesReport);
    this.engine.on(VERTC.events.onAutoplayFailed, handleAutoPlayFail);
    this.engine.on(VERTC.events.onPlayerEvent, handlePlayerEvent);
    this.engine.on(VERTC.events.onRoomBinaryMessageReceived, handleRoomBinaryMessageReceived);
    this.engine.on(VERTC.events.onNetworkQuality, handleNetworkQuality);
  };

  joinRoom = async () => {
    logger.flow('RTC-JOIN', '调用 engine.joinRoom', {
      roomId: this.basicInfo.room_id,
      userId: this.basicInfo.user_id,
      hasToken: Boolean(this.basicInfo.token),
      isAutoPublish: true,
      isAutoSubscribeAudio: true,
      roomProfileType: 'chat',
    });
    try {
      await this.engine.joinRoom(
        this.basicInfo.token!,
        `${this.basicInfo.room_id!}`,
        {
          userId: this.basicInfo.user_id!,
          extraInfo: JSON.stringify({
            call_scene: 'RTC-AIGC',
            user_name: this.basicInfo.user_id,
            user_id: this.basicInfo.user_id,
          }),
        },
        {
          isAutoPublish: true,
          isAutoSubscribeAudio: true,
          roomProfileType: RoomProfileType.chat,
        }
      );
      logger.flow('RTC-JOIN', 'engine.joinRoom 成功');
    } catch (error) {
      logger.error('[AIGC-FLOW][RTC-JOIN] engine.joinRoom 失败', error);
      throw error;
    }
  };

  leaveRoom = () => {
    logger.flow('RTC-LEAVE', '开始离开 RTC 房间');
    this.audioBotEnabled = false;
    if (!this.engine) {
      logger.flow('RTC-LEAVE', 'RTC 引擎不存在，跳过销毁');
      return;
    }
    this.engine
      .leaveRoom()
      .then(() => logger.flow('RTC-LEAVE', 'engine.leaveRoom 成功'))
      .catch((error) => logger.warn('[AIGC-FLOW][RTC-LEAVE] engine.leaveRoom 异常', error));
    VERTC.destroyEngine(this.engine);
    this._audioCaptureDevice = undefined;
    logger.flow('RTC-LEAVE', 'RTC 引擎已销毁');
  };

  checkPermission(): Promise<{
    video: boolean;
    audio: boolean;
  }> {
    return VERTC.enableDevices({
      video: false,
      audio: true,
    });
  }

  /**
   * @brief get the devices
   * @returns
   */
  async getDevices(props?: { video?: boolean; audio?: boolean }): Promise<{
    audioInputs: MediaDeviceInfo[];
    audioOutputs: MediaDeviceInfo[];
    videoInputs: MediaDeviceInfo[];
  }> {
    const { video = false, audio = true } = props || {};
    let audioInputs: MediaDeviceInfo[] = [];
    let audioOutputs: MediaDeviceInfo[] = [];
    let videoInputs: MediaDeviceInfo[] = [];
    const { video: hasVideoPermission, audio: hasAudioPermission } = await VERTC.enableDevices({
      video,
      audio,
    });
    if (audio) {
      const inputs = await VERTC.enumerateAudioCaptureDevices();
      const outputs = await VERTC.enumerateAudioPlaybackDevices();
      audioInputs = inputs.filter((i) => i.deviceId && i.kind === 'audioinput');
      audioOutputs = outputs.filter((i) => i.deviceId && i.kind === 'audiooutput');
      this._audioCaptureDevice = audioInputs.filter((i) => i.deviceId)?.[0]?.deviceId;
      if (hasAudioPermission) {
        if (!audioInputs?.length) {
          Message.error('无麦克风设备, 请先确认设备情况。');
        }
        if (!audioOutputs?.length) {
          Message.error('无扬声器设备, 请先确认设备情况。');
        }
      } else {
        Message.error('暂无麦克风设备权限, 请先确认设备权限授予情况。');
      }
    }
    if (video) {
      videoInputs = await VERTC.enumerateVideoCaptureDevices();
      videoInputs = videoInputs.filter((i) => i.deviceId && i.kind === 'videoinput');
      this._videoCaptureDevice = videoInputs?.[0]?.deviceId;
      if (hasVideoPermission) {
        if (!videoInputs?.length) {
          Message.error('无摄像头设备, 请先确认设备情况。');
        }
      } else {
        Message.error('暂无摄像头设备权限, 请先确认设备权限授予情况。');
      }
    }

    return {
      audioInputs,
      audioOutputs,
      videoInputs,
    };
  }

  startVideoCapture = async (camera?: string) => {
    await this.engine.startVideoCapture(camera || this._videoCaptureDevice);
  };

  stopVideoCapture = async () => {
    this.engine.setLocalVideoMirrorType(MirrorType.MIRROR_TYPE_RENDER);
    await this.engine.stopVideoCapture();
  };

  startScreenCapture = async (enableAudio = false) => {
    await this.engine.startScreenCapture({
      enableAudio,
    });
  };

  stopScreenCapture = async () => {
    await this.engine.stopScreenCapture();
  };

  startAudioCapture = async (mic?: string) => {
    await this.engine.startAudioCapture(mic || this._audioCaptureDevice);
  };

  stopAudioCapture = async () => {
    await this.engine.stopAudioCapture();
  };

  publishStream = (mediaType: MediaType) => {
    this.engine.publishStream(mediaType);
  };

  unpublishStream = (mediaType: MediaType) => {
    this.engine.unpublishStream(mediaType);
  };

  publishScreenStream = async (mediaType: MediaType) => {
    await this.engine.publishScreen(mediaType);
  };

  unpublishScreenStream = async (mediaType: MediaType) => {
    await this.engine.unpublishScreen(mediaType);
  };

  setScreenEncoderConfig = async (description: ScreenEncoderConfig) => {
    await this.engine.setScreenEncoderConfig(description);
  };

  /**
   * @brief 设置业务标识参数
   * @param businessId
   */
  setBusinessId = (businessId: string) => {
    this.engine.setBusinessId(businessId);
  };

  setAudioVolume = (volume: number) => {
    this.engine.setCaptureVolume(StreamIndex.STREAM_INDEX_MAIN, volume);
    this.engine.setCaptureVolume(StreamIndex.STREAM_INDEX_SCREEN, volume);
  };

  /**
   * @brief 设置音质档位
   */
  setAudioProfile = (profile: AudioProfileType) => {
    this.engine.setAudioProfile(profile);
  };

  /**
   * @brief 切换设备
   */
  switchDevice = (deviceType: MediaType, deviceId: string) => {
    if (deviceType === MediaType.AUDIO) {
      this._audioCaptureDevice = deviceId;
      this.engine.setAudioCaptureDevice(deviceId);
    }
    if (deviceType === MediaType.VIDEO) {
      this._videoCaptureDevice = deviceId;
      this.engine.setVideoCaptureDevice(deviceId);
    }
    if (deviceType === MediaType.AUDIO_AND_VIDEO) {
      this._audioCaptureDevice = deviceId;
      this._videoCaptureDevice = deviceId;
      this.engine.setVideoCaptureDevice(deviceId);
      this.engine.setAudioCaptureDevice(deviceId);
    }
  };

  setLocalVideoMirrorType = (type: MirrorType) => {
    return this.engine.setLocalVideoMirrorType(type);
  };

  setLocalVideoPlayer = (
    userId: string,
    renderDom?: string | HTMLElement,
    isScreenShare = false,
    renderMode = VideoRenderMode.RENDER_MODE_FILL
  ) => {
    return this.engine.setLocalVideoPlayer(
      isScreenShare ? StreamIndex.STREAM_INDEX_SCREEN : StreamIndex.STREAM_INDEX_MAIN,
      {
        renderDom,
        userId,
        renderMode,
      }
    );
  };

  setRemoteVideoPlayer = (
    userId: string,
    renderDom?: string | HTMLElement,
    renderMode = VideoRenderMode.RENDER_MODE_HIDDEN
  ) => {
    return this.engine.setRemoteVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, {
      renderDom,
      userId,
      renderMode,
    });
  };

  /**
   * @brief 移除播放器
   */
  removeLocalVideoPlayer = (userId: string, scope: StreamIndex | 'Both' = 'Both') => {
    let removeScreen = scope === StreamIndex.STREAM_INDEX_SCREEN;
    let removeCamera = scope === StreamIndex.STREAM_INDEX_MAIN;
    if (scope === 'Both') {
      removeCamera = true;
      removeScreen = true;
    }
    if (removeScreen) {
      this.engine.setLocalVideoPlayer(StreamIndex.STREAM_INDEX_SCREEN, { userId });
    }
    if (removeCamera) {
      this.engine.setLocalVideoPlayer(StreamIndex.STREAM_INDEX_MAIN, { userId });
    }
  };

  /**
   * @brief 启用 AIGC
   */
  startAgent = async (scene: string): Promise<StartSessionResult> => {
    if (!this.sessionId) {
      throw new Error('SessionID is not initialized');
    }
    logger.flow('AGENT-CLIENT', '调用 /session/start?Action=StartSession', {
      sessionId: this.sessionId,
      sceneId: scene,
      audioBotEnabled: this.audioBotEnabled,
    });
    if (this.audioBotEnabled) {
      logger.flow('AGENT-CLIENT', '检测到已有智能体，先停止再启动', {
        activeSceneId: this.activeSceneId,
      });
      await this.stopAgent(this.activeSceneId || scene);
    }
    const result = (await Apis.VoiceChat.StartSession({
      SessionID: this.sessionId,
      SceneID: scene,
    })) as unknown as StartSessionResult & { CallID?: string; AgentUserID?: string };
    const RTC = result?.RTC as RuntimeRTCConfig | undefined;
    const callId = result?.callId || result?.CallID || '';
    const agentUserId = result?.agentUserId || result?.AgentUserID || '';
    if (!RTC) {
      throw new Error(`RTC config for scene ${scene} was not created`);
    }
    if (!agentUserId) {
      throw new Error(`Agent user id for scene ${scene} was not created`);
    }
    this.activeCallId = callId;
    this.activeAgentUserId = agentUserId;
    this.activeBotId = result?.botId || '';
    this.activeBotName = result?.botName || '';
    this.micReady = false;
    this.agentReady = false;
    this.clientReadySent = false;
    this.setBasicInfo(RTC);
    logger.flow('AGENT-CLIENT', '/session/start 成功', {
      sessionId: this.sessionId,
      sceneId: scene,
      callId: this.activeCallId,
      agentUserId: this.activeAgentUserId,
      botId: this.activeBotId || undefined,
    });
    this.audioBotEnabled = true;
    this.activeSceneId = scene;
    this.audioBotStartTime = Date.now();
    sessionStorage.setItem('audioBotEnabled', 'true');
    return {
      callId,
      agentUserId,
      botId: this.activeBotId || undefined,
      botName: this.activeBotName || undefined,
      RTC,
      scene: result?.scene,
    };
  };

  /**
   * @brief 关闭 AIGC
   */
  stopAgent = async (scene: string) => {
    const activeScene = this.activeSceneId || scene;
    if (
      this.sessionId &&
      activeScene &&
      (this.audioBotEnabled || sessionStorage.getItem('audioBotEnabled'))
    ) {
      logger.flow('AGENT-CLIENT', '调用 /session/stop?Action=StopSession', {
        sessionId: this.sessionId,
        sceneId: activeScene,
      });
      const startedAt = Date.now();
      try {
        await Apis.VoiceChat.StopSession({
          SessionID: this.sessionId,
          CallID: this.activeCallId,
        });
        logger.flow('AGENT-CLIENT', '/session/stop 成功', {
          sceneId: activeScene,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        logger.error('[AIGC-FLOW][AGENT-CLIENT] StopSession 失败', error);
        throw error;
      }
      this.audioBotStartTime = 0;
      sessionStorage.removeItem('audioBotEnabled');
    } else {
      logger.flow('AGENT-CLIENT', '跳过 StopSession', {
        reason: !this.sessionId ? 'SessionID 为空' : !activeScene ? 'SceneID 为空' : '智能体未启动',
      });
    }
    this.audioBotEnabled = false;
    this.activeSceneId = '';
    this.activeAgentUserId = '';
    this.activeCallId = '';
    this.activeBotId = '';
    this.activeBotName = '';
    this.micReady = false;
    this.agentReady = false;
    this.clientReadySent = false;
  };

  stopAgentOnUnload = () => {
    const scene = this.activeSceneId;
    try {
      if (
        this.sessionId &&
        scene &&
        (this.audioBotEnabled || sessionStorage.getItem('audioBotEnabled')) &&
        typeof navigator.sendBeacon === 'function'
      ) {
        logger.flow('AGENT-CLIENT', '页面卸载，用 sendBeacon 发送 StopSession', {
          sessionId: this.sessionId,
          sceneId: scene,
        });
        navigator.sendBeacon(
          `${AIGC_PROXY_HOST}/session/stop?Action=StopSession`,
          new URLSearchParams({
            SessionID: this.sessionId,
            CallID: this.activeCallId,
          })
        );
      } else {
        logger.flow('AGENT-CLIENT', '页面卸载，无需发送停止信标', {
          hasSession: Boolean(this.sessionId),
          scene,
          audioBotEnabled: this.audioBotEnabled,
        });
      }
    } finally {
      this.audioBotEnabled = false;
      this.activeSceneId = '';
      this.activeAgentUserId = '';
      this.activeCallId = '';
      this.activeBotId = '';
      this.activeBotName = '';
      this.micReady = false;
      this.agentReady = false;
      this.clientReadySent = false;
      this.audioBotStartTime = 0;
      sessionStorage.removeItem('audioBotEnabled');
    }
  };

  /**
   * @brief 命令 AIGC
   */
  commandAgent = ({
    command,
    agentName,
    interruptMode = INTERRUPT_PRIORITY.NONE,
    message = '',
  }: {
    command: COMMAND;
    agentName: string;
    interruptMode?: INTERRUPT_PRIORITY;
    message?: string;
  }) => {
    if (this.audioBotEnabled && this.activeAgentUserId) {
      logger.flow('AGENT-CLIENT', '通过 RTC 数据通道发送控制指令', {
        command,
        agentName,
        interruptMode,
        messagePreview: message.slice(0, 80),
      });
      this.sendUserMessage({
        type: 'client.interrupt',
        value: {
          command,
          interruptMode,
          message,
        },
      });
      return;
    }
    logger.warn('[AIGC-FLOW][AGENT-CLIENT] 控制指令未发送：智能体未启用', {
      command,
      agentName,
    });
  };

  /**
   * @brief 更新 AIGC 配置
   */
  updateAgent = async (scene: string) => {
    logger.flow('AGENT-CLIENT', '更新智能体配置', {
      sceneId: scene,
      audioBotEnabled: this.audioBotEnabled,
    });
    if (this.audioBotEnabled) {
      await this.stopAgent(scene);
      await this.startAgent(scene);
    } else {
      await this.startAgent(scene);
    }
  };

  /**
   * @brief 获取当前 AI 是否启用
   */
  getAgentEnabled = () => {
    return this.audioBotEnabled;
  };
}

export default new RTCClient();
