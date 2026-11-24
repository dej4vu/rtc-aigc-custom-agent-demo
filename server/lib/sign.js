/**
 * Copyright 2025 Beijing Volcano Engine Technology Co., Ltd. All Rights Reserved.
 * SPDX-license-identifier: BSD-3-Clause
 */

const { Signer } = require("@volcengine/openapi");

function signHeaders({
  method,
  url,
  body,
  region,
  service,
  accessKeyId,
  secretAccessKey,
  date = new Date(),
}) {
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("缺少访问密钥，无法签名");
  }
  const parsed = new URL(url);
  const params = {};
  parsed.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  const request = {
    region,
    method: method.toUpperCase(),
    pathname: parsed.pathname,
    params,
    headers: {
      Host: parsed.host,
    },
    body,
  };
  const signer = new Signer(request, service);
  signer.addAuthorization({ accessKeyId, secretKey: secretAccessKey }, date);
  return request.headers;
}

function buildMmpgHeaders(config) {
  return signHeaders({
    method: "GET",
    url: config.mmpg.url,
    region: config.mmpg.region,
    service: config.mmpg.service,
    accessKeyId: config.mmpg.accessKeyId,
    secretAccessKey: config.mmpg.secretAccessKey,
  });
}

module.exports = {
  signHeaders,
  buildMmpgHeaders,
};
