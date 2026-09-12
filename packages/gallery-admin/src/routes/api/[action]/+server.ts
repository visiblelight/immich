import { json, type RequestHandler } from '@sveltejs/kit';
import { GalleryError, ensure, uuid } from '@gallery/core';
import {
  adminState,
  adminTags,
  saveTag,
  adminMapSettings,
  saveMapSettings,
  adminVisited,
  saveVisit,
  deleteVisit,
  changePassword,
  updateProfile,
  createAlbum,
  deleteDraftAlbum,
  login,
  logout,
  picker,
  publishAlbum,
  saveAlbum,
  saveAlbumItem,
  saveSite,
  setAlbumAvailability,
} from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
async function body(request: Request): Promise<Record<string, unknown>> {
  ensure(request.headers.get('content-type')?.split(';')[0] === 'application/json', '请使用 JSON 请求。', 415);
  const reader = request.body?.getReader();
  ensure(reader, '请求内容为空。');
  let bytes = 0;
  let text = '';
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 2_000_000) {
      await reader.cancel();
      throw new GalleryError(413, '保存内容过大。');
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new GalleryError(400, '请求格式无效。');
  }
  ensure(result && typeof result === 'object' && !Array.isArray(result), '请求格式无效。');
  return result;
}
function failure(e: unknown) {
  if (e instanceof GalleryError) return json({ message: e.message }, { status: e.status });
  const code = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
  return json(
    {
      message: ['23505', '23503', '23514'].includes(code)
        ? '内容或版本冲突，请检查后重新载入。'
        : '操作未完成，请稍后重试。',
    },
    { status: ['23505', '23503', '23514'].includes(code) ? 409 : 503 },
  );
}
export const GET: RequestHandler = async ({ params, locals, url }) => {
  try {
    ensure(locals.user, '请先登录。', 401);
    const app = getRuntime();
    if (params.action === 'state')
      return json({ ...(await adminState(app.db)), user: locals.user, publicOrigin: app.publicOrigin });
    if (params.action === 'map-settings') return json(await adminMapSettings(app.db, app.mapSecretKey));
    if (params.action === 'visits')
      return json(await adminVisited(app.db, url.searchParams.get('country') ?? undefined));
    if (params.action === 'tags') return json(await adminTags(app.db));
    if (params.action === 'source') return json(await picker(app.db, url.searchParams));
    throw new GalleryError(404, '接口不存在。');
  } catch (e) {
    return failure(e);
  }
};
export const POST: RequestHandler = async ({ params, request, locals, cookies, getClientAddress }) => {
  try {
    const input = await body(request);
    const app = getRuntime();
    if (params.action === 'login') {
      const session = await login(app.db, input.email, input.password, getClientAddress());
      cookies.set('gallery_admin_session', session.token, {
        path: '/',
        httpOnly: true,
        secure: app.secure,
        sameSite: 'strict',
        expires: session.expires,
      });
      return json({ ok: true });
    }
    ensure(locals.user, '请先登录。', 401);
    const user = locals.user;
    switch (params.action) {
      case 'logout':
        await logout(app.db, cookies.get('gallery_admin_session') ?? '');
        cookies.delete('gallery_admin_session', { path: '/' });
        return json({ ok: true });
      case 'profile':
        await updateProfile(app.db, user, input.displayName);
        break;
      case 'password':
        await changePassword(app.db, user, input.oldPassword, input.newPassword);
        cookies.delete('gallery_admin_session', { path: '/' });
        return json({ ok: true });
      case 'create':
        return json({ id: await createAlbum(app.db, user, input) });
      case 'save':
        await saveAlbum(app.db, user, uuid(input.id), input);
        break;
      case 'item':
        await saveAlbumItem(app.db, user, uuid(input.id), input, app.root);
        break;
      case 'delete':
        await deleteDraftAlbum(app.db, user, uuid(input.id), input);
        break;
      case 'publish':
        await publishAlbum(app.db, user, uuid(input.id), input, app.root);
        break;
      case 'availability':
        await setAlbumAvailability(app.db, user, uuid(input.id), input);
        break;
      case 'map-settings':
        await saveMapSettings(app.db, user, input, app.mapSecretKey);
        break;
      case 'visit-save':
        return json({ id: await saveVisit(app.db, user, input) });
      case 'visit-delete':
        await deleteVisit(app.db, user, input);
        break;
      case 'tag-save':
        return json({id: await saveTag(app.db, user, input)});
      case 'site':
        await saveSite(app.db, user, input);
        break;
      default:
        throw new GalleryError(404, '接口不存在。');
    }
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
};
