import { ensure } from './content.ts';
export interface MediaAttribution {
  enabled: boolean;
  creator: string;
  homepage: string;
  copyright: string;
}
export interface MediaAttributionSettings extends MediaAttribution {
  version: number;
}
export function validateMediaAttribution(
  input: Record<string, unknown>,
): MediaAttribution {
  ensure(typeof input.enabled === 'boolean', '请选择是否启用图片署名。');
  const values: Record<string, string> = {};
  for (const [name, limit] of [
    ['creator', 200],
    ['homepage', 1000],
    ['copyright', 500],
  ] as const) {
    ensure(
      typeof input[name] === 'string' &&
        input[name].length <= limit &&
        !/[\u0000-\u001f\u007f\uD800-\uDFFF\uFFFE\uFFFF]/u.test(input[name]),
      '图片署名内容格式无效。',
    );
    values[name] = input[name].trim();
  }
  ensure(!input.enabled || !!values.creator, '请填写创作者。');
  if (values.homepage) {
    let url: URL;
    try {
      url = new URL(values.homepage);
    } catch {
      ensure(false, '主页地址应为完整的 https:// 或 http:// 网址。');
    }
    ensure(
      ['https:', 'http:'].includes(url.protocol) &&
        !url.username &&
        !url.password,
      '主页地址应为不含账号密码的 HTTP(S) 网址。',
    );
  }
  return {
    enabled: input.enabled,
    creator: values.creator!,
    homepage: values.homepage!,
    copyright: values.copyright!,
  };
}
