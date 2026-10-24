import { json, type RequestHandler } from '@sveltejs/kit';
import { GalleryError, ensure } from '@gallery/core';
import {
  communitySettings,
  renewMemberSession,
  memberSession,
  issueMemberCode,
  verifyMemberCode,
  revokeMemberSessions,
  saveMember,
  communityTarget,
  communityThread,
  communityCounts,
  setCommunityLike,
  addCommunityComment,
  removeCommunityComment,
} from '@gallery/db/server';
import { getCommunity, memberCookie } from '$lib/server/community';
import { getRuntime } from '$lib/server/runtime';
const result = (data: unknown) =>
  json(data, {
    headers: { 'cache-control': 'private, no-store', vary: 'Cookie' },
  });
function failure(e: unknown) {
  const conflict =
    !!e && typeof e === 'object' && 'code' in e && e.code === '23505';
  return json(
    {
      message:
        e instanceof GalleryError
          ? e.message
          : conflict
            ? '邮箱已被使用，请重新获取验证码。'
            : '操作未完成，请稍后再试。',
    },
    {
      status: e instanceof GalleryError ? e.status : conflict ? 409 : 503,
      headers: { 'cache-control': 'private, no-store' },
    },
  );
}
async function body(request: Request) {
  ensure(
    request.headers.get('content-type')?.split(';')[0] === 'application/json',
    '请使用 JSON 请求。',
    415,
  );
  const reader = request.body?.getReader();
  ensure(reader, '请求内容为空。');
  let bytes = 0,
    text = '';
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 32768) {
      await reader.cancel();
      throw new GalleryError(413, '请求内容过大。');
    }
    text += decoder.decode(value, { stream: true });
  }
  let data;
  try {
    data = JSON.parse(text + decoder.decode());
  } catch {
    throw new GalleryError(400, '请求格式无效。');
  }
  ensure(
    data && typeof data === 'object' && !Array.isArray(data),
    '请求格式无效。',
  );
  return data as Record<string, unknown>;
}
export const GET: RequestHandler = async ({ params, url, cookies }) => {
  try {
    const { db, ready } = getCommunity(),
      app = getRuntime(),
      token = cookies.get(memberCookie);
    await ready();
    if (params.action === 'me') {
      const member = token ? await renewMemberSession(db, token) : null;
      if (member && token)
        cookies.set(memberCookie, token, {
          path: '/',
          httpOnly: true,
          secure: app.secure,
          sameSite: 'lax',
          expires: member.expires,
        });
      return result({ user: member, settings: await communitySettings(db) });
    }
    if (params.action === 'thread') {
      const page = Number(url.searchParams.get('page') ?? 1);
      ensure(Number.isInteger(page) && page > 0 && page <= 10000, '页码无效。');
      const target = communityTarget({
        kind: url.searchParams.get('kind'),
        id: url.searchParams.get('id'),
      });
      return result({
        thread: await communityThread(db, app.root, target, token, page),
        settings: await communitySettings(db),
      });
    }
    throw new GalleryError(404, '接口不存在。');
  } catch (e) {
    return failure(e);
  }
};
export const POST: RequestHandler = async ({ params, request, cookies }) => {
  try {
    const app = getRuntime();
    ensure(
      request.headers.get('origin') === app.origin,
      '请求来源不一致，请从本站重新打开页面。',
      403,
    );
    const input = await body(request),
      { db, secret, send, ready } = getCommunity(),
      token = cookies.get(memberCookie);
    await ready();
    if (params.action === 'code')
      return result(await issueMemberCode(db, secret, send, input, token));
    if (params.action === 'verify') {
      const verified = await verifyMemberCode(db, secret, input, token);
      if (verified.session)
        cookies.set(memberCookie, verified.session.token, {
          path: '/',
          httpOnly: true,
          secure: app.secure,
          sameSite: 'lax',
          expires: verified.session.expires,
        });
      if (verified.emailChanged) cookies.delete(memberCookie, { path: '/' });
      return result({
        proof: verified.proof,
        emailChanged: verified.emailChanged,
        user: verified.session
          ? await memberSession(db, verified.session.token)
          : undefined,
      });
    }
    if (params.action === 'logout') {
      await revokeMemberSessions(db, token, input.all === true);
      cookies.delete(memberCookie, { path: '/' });
      return result({ ok: true });
    }
    if (params.action === 'profile')
      return result({ user: await saveMember(db, token, input) });
    if (params.action === 'counts') {
      ensure(
        Array.isArray(input.targets) && input.targets.length <= 100,
        '一次最多查询 100 个对象。',
      );
      return result({
        counts: await communityCounts(
          db,
          app.root,
          input.targets.map(communityTarget),
        ),
        settings: await communitySettings(db),
      });
    }
    const target = communityTarget(input.target);
    let submittedId: string | undefined;
    if (params.action === 'like') {
      ensure(typeof input.liked === 'boolean', '点赞状态无效。');
      await setCommunityLike(db, app.root, target, token, input.liked);
    } else if (params.action === 'comment')
      submittedId = await addCommunityComment(
        db,
        app.root,
        target,
        token,
        input.text,
      );
    else if (params.action === 'delete-comment')
      await removeCommunityComment(db, app.root, target, token, input.id);
    else throw new GalleryError(404, '接口不存在。');
    return result({
      thread: await communityThread(
        db,
        app.root,
        target,
        token,
        1,
        submittedId,
      ),
      settings: await communitySettings(db),
    });
  } catch (e) {
    return failure(e);
  }
};
