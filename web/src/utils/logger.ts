/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

/* eslint-disable no-console -- this module is the intentional console adapter */

const FLOW_PREFIX = '[AIGC-FLOW]';
const flowStartedAt = Date.now();

class Logger {
  /**
   * @brief 关键路径日志。统一输出为：
   * [AIGC-FLOW][+123ms][SCOPE] 步骤说明 {...}
   */
  public flow(scope: string, step: string, ...args: any[]) {
    console.log(`${FLOW_PREFIX}[+${Date.now() - flowStartedAt}ms][${scope}] ${step}`, ...args);
  }

  public debug(...args: any[]) {
    console.debug(...args);
  }

  public log(...args: any[]) {
    console.log(...args);
  }

  public error(...args: any[]) {
    console.error(...args);
  }

  public warn(...args: any[]) {
    console.warn(...args);
  }
}

export default new Logger();
