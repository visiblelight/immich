import { uploadArticleMedia } from '@gallery/db/server';
import { ensure, GalleryError } from '@gallery/core';
import { getRuntime } from '$lib/server/runtime';
import { json, type RequestHandler } from '@sveltejs/kit';
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    ensure(locals.user, '请先登录。', 401);
    ensure(
      ['image/jpeg', 'image/png', 'image/webp'].includes(
        request.headers.get('content-type')?.split(';')[0] ?? '',
      ),
      '仅支持 JPEG、PNG、WebP。',
      415,
    );
    const reader = request.body?.getReader();
    ensure(reader, '未收到图片。');
    let size = 0;
    const parts: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 10 * 1024 * 1024) {
        await reader.cancel();
        throw new GalleryError(413, '图片不能超过 10 MB。');
      }
      parts.push(value);
    }
    let name = '文章插图';
    try {
      name = decodeURIComponent(request.headers.get('x-file-name') ?? name);
    } catch {}
    const app = getRuntime();
    return json(
      await uploadArticleMedia(app.db, locals.user, app.articleMediaRoot, Buffer.concat(parts), name),
    );
  } catch (error) {
    return json(
      { message: error instanceof GalleryError ? error.message : '图片处理失败，请确认文件有效后重试。' },
      { status: error instanceof GalleryError ? error.status : 400 },
    );
  }
};
