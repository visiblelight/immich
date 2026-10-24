import { createHmac, randomUUID } from 'node:crypto';
import { ensure } from '@gallery/core';
export type SendMemberCode = (email: string, code: string, purpose: string) => Promise<void>;
export const rpcEncode = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export function signMail(parameters: Record<string, string>, secret: string) {
  const query = Object.keys(parameters)
    .sort()
    .map((k) => `${rpcEncode(k)}=${rpcEncode(parameters[k]!)}`)
    .join('&');
  return createHmac('sha1', `${secret}&`)
    .update(`POST&%2F&${rpcEncode(query)}`)
    .digest('base64');
}
export function directMail(env: Record<string, string | undefined>): SendMemberCode {
  return async (email, code, purpose) => {
    ensure(
      env.GALLERY_MAIL_ACCESS_KEY_ID && env.GALLERY_MAIL_ACCESS_KEY_SECRET,
      '验证码邮件服务尚未配置，请稍后再试。',
      503,
    );
    const action = purpose === 'register' ? '注册' : purpose === 'login' ? '登录' : '修改绑定邮箱';
    const params: Record<string, string> = {
      Action: 'SingleSendMail',
      Version: '2015-11-23',
      RegionId: 'cn-hangzhou',
      Format: 'JSON',
      AccessKeyId: env.GALLERY_MAIL_ACCESS_KEY_ID,
      SignatureMethod: 'HMAC-SHA1',
      SignatureVersion: '1.0',
      SignatureNonce: randomUUID(),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      AccountName: env.GALLERY_MAIL_FROM || 'vision@ke.ink',
      AddressType: '1',
      ReplyToAddress: 'false',
      FromAlias: env.GALLERY_MAIL_ALIAS || '光与远方',
      ToAddress: email,
      Subject: `光与远方 · ${action}验证码`,
      TextBody: `你的${action}验证码是：${code}\n\n验证码在 10 分钟内有效，请勿转发给他人。\n如非本人操作，请忽略此邮件。\n\n光与远方\nhttps://vision.ke`,
    };
    params.Signature = signMail(params, env.GALLERY_MAIL_ACCESS_KEY_SECRET);
    try {
      const response = await fetch('https://dm.aliyuncs.com/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
        signal: AbortSignal.timeout(15000),
      });
      const result = (await response.json()) as { EnvId?: string; RequestId?: string; Code?: string };
      ensure(response.ok && !result.Code && result.RequestId, '邮件发送失败，请稍后重新获取验证码。', 503);
    } catch {
      ensure(false, '邮件发送失败，请稍后重新获取验证码。', 503);
    }
  };
}
