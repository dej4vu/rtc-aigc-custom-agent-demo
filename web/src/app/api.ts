/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

/**
 * @brief Basic APIs
 */
export const BasicAPIs = [
  {
    action: 'getScenes',
    apiPath: '/getScenes',
    method: 'post',
  },
  {
    action: 'StartSession',
    apiPath: '/session/start',
    method: 'post',
  },
  {
    action: 'StopSession',
    apiPath: '/session/stop',
    method: 'post',
  },
] as const;

/**
 * @brief Basic APIs
 */
export const AigcAPIs = [
  {
    action: 'StartSession',
    apiPath: '/session/start',
    method: 'post',
  },
  {
    action: 'StopSession',
    apiPath: '/session/stop',
    method: 'post',
  },
] as const;
