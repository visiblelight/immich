import { json } from '@sveltejs/kit';
import { GalleryError, ensure } from '@gallery/core';
import { adminCommunity, manageCommunity } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function GET({ url }: { url: URL }) {
  return json(await adminCommunity(getRuntime().db, url.searchParams));
}
export async function POST({ request, locals }: { request: Request; locals: App.Locals }) {
  try {
    ensure(locals.user, '请先登录。', 401);
    ensure(
      request.headers.get('content-type')?.split(';')[0] === 'application/json',
      '请使用 JSON 请求。',
      415,
    );
    const text = await request.text();
    ensure(text.length <= 16000, '内容过大。', 413);
    const input = JSON.parse(text);
    await manageCommunity(getRuntime().db, locals.user, input);
    return json({ ok: true });
  } catch (e) {
    return json(
      { message: e instanceof GalleryError ? e.message : '操作未完成，请稍后再试。' },
      { status: e instanceof GalleryError ? e.status : 400 },
    );
  }
}
