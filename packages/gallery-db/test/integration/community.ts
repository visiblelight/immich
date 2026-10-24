import assert from 'node:assert/strict';
import { communityHttp } from './community-http.ts';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type { Kysely } from 'kysely';
import {
  createDatabase,
  assertDatabaseCompatibility,
  createArticle,
  getArticle,
  saveArticle,
  publishArticle,
  offlineArticle,
} from '../../src/index.server.ts';
import {
  issueMemberCode,
  verifyMemberCode,
  memberSession,
  renewMemberSession,
  saveMember,
  revokeMemberSessions,
} from '../../src/member.server.ts';
import {
  communityThread,
  addCommunityComment,
  setCommunityLike,
  removeCommunityComment,
  manageCommunity,
  adminCommunity,
  communityCounts,
} from '../../src/community.server.ts';
import type { MediaRoot } from '../../src/media.server.ts';
import type { GalleryUser, CommunityTarget } from '@gallery/core';

export async function community(
  owner: pg.Client,
  admin: Kysely<unknown>,
  adminId: string,
  root: MediaRoot,
  a: { id: string; photos: string[] },
  b: { id: string; photos: string[] },
  asset: string,
  ownerUrl: string,
) {
  await owner.query(
    await readFile(
      new URL('../../../../deployment/gallery/database/community-role.sql', import.meta.url),
      'utf8',
    ),
  );
  const password = randomBytes(32).toString('hex');
  await owner.query(`ALTER ROLE gallery_community PASSWORD ${pg.escapeLiteral(password)}`);
  const url = new URL(ownerUrl);
  url.username = 'gallery_community';
  url.password = password;
  const db = createDatabase<unknown>(url.toString(), 'gallery-community'),
    raw = new pg.Client({ connectionString: url.toString() });
  await raw.connect();
  const user = {
    id: adminId,
    email: 'admin@example.invalid',
    displayName: 'Admin',
    role: 'admin',
  } as GalleryUser;
  const flags = {
    registration: true,
    comments: true,
    likes: true,
    showComments: true,
    showLikes: true,
  };
  const setFlags = (value: Partial<typeof flags>) =>
    manageCommunity(admin, user, {
      action: 'settings',
      settings: { ...flags, ...value },
    });
  const secret = randomBytes(32).toString('hex');
  let inbox: { email: string; code: string; purpose: string }[] = [];
  const send = async (email: string, code: string, purpose: string) => {
    inbox.push({ email, code, purpose });
  };
  const issue = async (input: Record<string, unknown>, token?: string) => {
    const c = await issueMemberCode(db, secret, send, input, token);
    return { ...c, code: inbox.at(-1)?.code ?? '' };
  };
  const verify = (c: { id: string; code: string }, token?: string) => verifyMemberCode(db, secret, c, token);
  const target: CommunityTarget = { kind: 'album', id: a.id };
  const adminComment = async (id: string) => {
    const state = await adminCommunity(admin, new URLSearchParams('status=all'));
    return (
      state.comments as {
        id: string;
        title: string;
        targetPath: string | null;
        targetContext: string | null;
      }[]
    ).find((c) => c.id === id)!;
  };
  try {
    await assertDatabaseCompatibility(db, 'gallery-community');
    await owner.query("INSERT INTO gallery.site(id,name) VALUES(1,'Community test') ON CONFLICT DO NOTHING");
    for (const query of [
      'SELECT * FROM public.asset',
      "UPDATE gallery.album SET status='draft'",
      'SELECT * FROM gallery."user"',
      'UPDATE gallery.community_settings SET registration=true',
      'SET ROLE gallery_migrator',
      'SET ROLE gallery_admin',
    ])
      await assert.rejects(raw.query(query), (e: { code: string }) => e.code === '42501');
    await assert.rejects(
      issue({
        purpose: 'register',
        email: 'one@example.invalid',
        name: '访客',
      }),
      /注册暂时关闭/,
    );
    await setFlags({});
    const c = await issue({
      purpose: 'register',
      email: 'ONE@example.invalid',
      name: '访客',
    });
    await assert.rejects(
      issue({
        purpose: 'register',
        email: 'one@example.invalid',
        name: '访客',
      }),
      /60 秒/,
    );
    const wrong = c.code === '000000' ? '000001' : '000000';
    await assert.rejects(verify({ ...c, code: wrong }), /验证码不正确/);
    assert.equal(
      (await owner.query('SELECT attempts FROM gallery.member_challenge WHERE id=$1', [c.id])).rows[0]
        .attempts,
      1,
    );
    const concurrent = await Promise.allSettled([verify(c), verify(c)]);
    assert.equal(
      concurrent.filter((r) => r.status === 'fulfilled').length,
      1,
      'only one simultaneous OTP redemption',
    );
    const success = concurrent.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
      Awaited<ReturnType<typeof verify>>
    >;
    const token = success.value.session!.token;
    let member = (await memberSession(db, token))!;
    assert.equal(member.email, 'one@example.invalid');
    assert.equal(await memberSession(db, 'bad'), null);
    await assert.rejects(verify(c), /已失效/);
    await owner.query(
      "UPDATE gallery.member_challenge SET created_at=now()-interval '61 seconds' WHERE id=$1",
      [c.id],
    );
    await assert.rejects(
      issue({
        purpose: 'register',
        email: 'One@example.invalid',
        name: '访客',
      }),
      /已经注册/,
    );
    const r2 = await issue({
      purpose: 'register',
      email: 'two@example.invalid',
      name: '访客',
    });
    await setFlags({ registration: false });
    await assert.rejects(verify(r2), /注册暂时关闭/);
    await setFlags({});
    const token2 = (await verify(r2)).session!.token,
      member2 = (await memberSession(db, token2))!;
    assert.notEqual(member.avatar, member2.avatar);
    assert.equal(member.name, member2.name, 'names need not be unique');
    const saved = await saveMember(db, token, {
      name: '新名字',
      randomAvatar: true,
    });
    assert.notEqual(saved.avatar, member.avatar);
    const previewAvatar = randomUUID();
    assert.equal(
      (await saveMember(db, token, { name: '新名字', avatar: previewAvatar })).avatar,
      previewAvatar,
    );
    await assert.rejects(
      saveMember(db, token, { name: '不得保存', avatar: member2.avatar }),
      /头像已有人使用/,
    );
    assert.equal(
      (await memberSession(db, token))!.name,
      '新名字',
      'conflicting avatar rolls back profile changes',
    );
    member = (await memberSession(db, token))!;
    const login = await issue({ purpose: 'login', email: member.email });
    await setFlags({ registration: false });
    const token3 = (await verify(login)).session!.token;
    await setFlags({});
    await owner.query(
      "UPDATE gallery.member_session SET expires_at=now()+interval '5 days' WHERE member_id=$1",
      [member.id],
    );
    assert.ok((await renewMemberSession(db, token))!.expires.getTime() > Date.now() + 179 * 86400_000);
    const failed = await issue({
      purpose: 'register',
      email: 'attempt@example.invalid',
      name: '尝试',
    });
    for (let i = 0; i < 5; i++)
      await assert.rejects(
        verify({
          ...failed,
          code: failed.code === '000000' ? '000001' : '000000',
        }),
      );
    await assert.rejects(verify(failed), /已失效/);
    const expired = await issue({
      purpose: 'register',
      email: 'expired@example.invalid',
      name: '过期',
    });
    await owner.query(
      "UPDATE gallery.member_challenge SET expires_at=now()-interval '1 second' WHERE id=$1",
      [expired.id],
    );
    await assert.rejects(verify(expired), /已失效/);
    await assert.rejects(
      issueMemberCode(
        db,
        secret,
        async () => {
          throw new Error('mail unavailable');
        },
        { purpose: 'register', email: 'failed@example.invalid', name: '失败' },
      ),
      /mail unavailable/,
    );
    const delivered = (
      await owner.query(
        "SELECT delivered,consumed_at FROM gallery.member_challenge WHERE email='failed@example.invalid'",
      )
    ).rows[0];
    assert.equal(delivered.delivered, false);
    assert.ok(delivered.consumed_at);
    const before = inbox.length;
    await assert.rejects(issue({ purpose: 'login', email: 'unknown@example.invalid' }), /尚未注册/);
    assert.equal(inbox.length, before);
    assert.equal(
      (
        await owner.query(
          "SELECT count(*)::int AS n FROM gallery.member_challenge WHERE email='unknown@example.invalid'",
        )
      ).rows[0].n,
      0,
    );
    await setFlags({ registration: false });
    await assert.rejects(issue({ purpose: 'login', email: 'unknown@example.invalid' }), /暂未开放注册/);
    await setFlags({});
    await Promise.all([
      setCommunityLike(db, root, target, token, true),
      setCommunityLike(db, root, target, token, true),
    ]);
    assert.equal((await communityThread(db, root, target, token)).likes, 1);
    assert.equal((await communityThread(db, root, target)).liked, false);
    await setFlags({ likes: false });
    await assert.rejects(setCommunityLike(db, root, target, token2, true), /关闭/);
    await setCommunityLike(db, root, target, token, false);
    assert.equal((await communityThread(db, root, target)).likes, 0);
    await setFlags({});
    const photo: CommunityTarget = { kind: 'photo', id: a.photos[0]! },
      other: CommunityTarget = { kind: 'photo', id: b.photos[0]! };
    await setCommunityLike(db, root, photo, token, true);
    assert.equal((await communityThread(db, root, other)).likes, 1, 'same photo across albums shares likes');
    const comment = await addCommunityComment(
      db,
      root,
      target,
      token,
      '<script>alert(1)</script>\n**plain text**',
    );
    const own = await communityThread(db, root, target, token);
    await owner.query('UPDATE gallery.album_draft SET title=$2 WHERE album_id=$1', [a.id, '未发布的新标题']);
    assert.equal((await adminComment(comment)).targetPath, '/albums/community-a');
    assert.equal(
      (await adminComment(comment)).title,
      'community-a',
      'admin link names use the public release',
    );
    assert.equal(own.comments[0]?.status, 'pending');
    assert.equal(own.total, 0);
    assert.equal((await communityThread(db, root, target, token, 1, comment)).submitted?.status, 'pending');
    assert.equal(
      (await communityThread(db, root, target, token2)).comments.length,
      0,
      'pending comments private',
    );
    await assert.rejects(removeCommunityComment(db, root, target, token2, comment), /不能删除/);
    await manageCommunity(admin, user, {
      action: 'comment',
      id: comment,
      status: 'published',
    });
    await manageCommunity(admin, user, {
      action: 'comment',
      id: comment,
      reply: '站长回复',
    });
    const publicThread = await communityThread(db, root, target);
    assert.equal(publicThread.total, 1);
    assert.equal(publicThread.comments[0]?.text, '<script>alert(1)</script>\n**plain text**');
    assert.equal(publicThread.comments[0]?.reply, '站长回复');
    assert.ok(!JSON.stringify(publicThread).includes('@example.invalid'));
    const photoComment = await addCommunityComment(db, root, photo, token, '再次留言');
    assert.equal((await adminComment(photoComment)).targetPath, `/albums/community-a?photo=${a.photos[0]}`);
    assert.equal((await adminComment(photoComment)).targetContext, 'community-a');
    assert.equal((await communityThread(db, root, other)).total, 1);
    await setFlags({ showComments: false, showLikes: false });
    assert.equal((await communityThread(db, root, target, token)).comments.length, 0);
    assert.deepEqual(await communityCounts(db, root, [photo]), {});
    await assert.rejects(addCommunityComment(db, root, target, token, '关闭后留言'), /关闭/);
    await assert.rejects(setCommunityLike(db, root, photo, token, true), /关闭/);
    await setFlags({});
    await manageCommunity(admin, user, {
      action: 'comment',
      id: comment,
      status: 'hidden',
    });
    assert.equal((await communityThread(db, root, target)).total, 0);
    await manageCommunity(admin, user, {
      action: 'comment',
      id: comment,
      status: 'published',
    });
    await removeCommunityComment(db, root, target, token, comment);
    await assert.rejects(
      manageCommunity(admin, user, {
        action: 'comment',
        id: comment,
        status: 'published',
      }),
      /不存在/,
    );
    await owner.query("UPDATE gallery.album SET status='offline',offline_at=now() WHERE id=$1", [a.id]);
    await assert.rejects(communityThread(db, root, target), /下线/);
    await assert.rejects(setCommunityLike(db, root, photo, token, true), /下线/);
    assert.equal(
      (await adminComment(photoComment)).targetPath,
      `/albums/community-b?photo=${b.photos[0]}`,
      'use another currently public album',
    );
    assert.equal((await communityThread(db, root, other)).likes, 1);
    await owner.query("UPDATE public.asset SET status='trashed' WHERE id=$1", [asset]);
    await assert.rejects(communityThread(db, root, other), /下线/);
    assert.equal(
      (await adminComment(photoComment)).targetPath,
      null,
      'trashed sources have no public destination',
    );
    await owner.query("UPDATE public.asset SET status='active' WHERE id=$1", [asset]);
    const path = (
      await owner.query('SELECT path FROM public.asset_file WHERE "assetId"=$1 AND type=\'preview\'', [asset])
    ).rows[0].path;
    await owner.query(
      "UPDATE public.asset_file SET path='/etc/passwd' WHERE \"assetId\"=$1 AND type='preview'",
      [asset],
    );
    await assert.rejects(communityThread(db, root, other), /下线/);
    await owner.query('UPDATE public.asset_file SET path=$2 WHERE "assetId"=$1 AND type=\'preview\'', [
      asset,
      path,
    ]);
    await owner.query("UPDATE gallery.album SET status='published',offline_at=NULL WHERE id=$1", [a.id]);
    await assert.rejects(addCommunityComment(db, root, target, undefined, '未登录'), /先登录/);
    await manageCommunity(admin, user, {
      action: 'member',
      id: member2.id,
      disabled: true,
    });
    assert.equal(await memberSession(db, token2), null);
    await assert.rejects(issue({ purpose: 'login', email: member2.email }), /已停用/);
    await manageCommunity(admin, user, {
      action: 'member',
      id: member2.id,
      disabled: false,
    });
    assert.equal(await memberSession(db, token2), null, 'restore must not restore revoked sessions');
    const articleId = await createArticle(admin, user);
    let article = await getArticle(admin, articleId);
    article.title = '互动文章';
    article.document = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '公开文章' }] }],
      },
    };
    article = await saveArticle(admin, user, {
      id: articleId,
      version: article.version,
      slug: 'community-article',
      content: article,
    });
    article = await publishArticle(admin, user, { id: articleId, version: article.version }, root);
    const articleTarget: CommunityTarget = { kind: 'article', id: articleId };
    await setCommunityLike(db, root, articleTarget, token, true);
    const articleComment = await addCommunityComment(db, root, articleTarget, token, '文章评论');
    assert.equal((await adminComment(articleComment)).targetPath, '/records/community-article');
    assert.equal((await communityThread(db, root, articleTarget)).total, 1);
    assert.equal(
      (await communityCounts(db, root, [target, other, articleTarget]))[`article:${articleId}`],
      1,
    );
    await offlineArticle(admin, { id: articleId, version: article.version });
    assert.equal(
      (await adminComment(articleComment)).targetPath,
      null,
      'offline articles have no public destination',
    );
    await assert.rejects(communityThread(db, root, articleTarget), /下线/);
    // Ascending pagination stays stable; a newly sent own comment is returned even beyond page one.
    const chronological: string[] = [];
    for (let i = 0; i < 23; i++)
      chronological.push(await addCommunityComment(db, root, target, token, `按时间留言 ${i}`));
    const firstPage = await communityThread(db, root, target, token, 1, chronological[22]);
    const secondPage = await communityThread(db, root, target, token, 2);
    assert.deepEqual(
      firstPage.comments.map((c) => c.id),
      chronological.slice(0, 20),
    );
    assert.deepEqual(
      secondPage.comments.map((c) => c.id),
      chronological.slice(20),
    );
    assert.equal(firstPage.hasMore, true);
    assert.equal(secondPage.hasMore, false);
    assert.equal(firstPage.submitted?.id, chronological[22]);
    assert.equal(
      (await communityThread(db, root, target, token2, 1, chronological[22])).submitted,
      undefined,
    );
    for (const id of chronological) await removeCommunityComment(db, root, target, token, id);
    const httpCode = await issue({
      purpose: 'register',
      email: 'http@example.invalid',
      name: '网页验证',
    });
    await communityHttp(url.toString(), secret, root, token, target, httpCode);
    const old = await issue({ purpose: 'email-old' }, token);
    await assert.rejects(verify(old, token3), /不属于/);
    const proof = (await verify(old, token)).proof!;
    await assert.rejects(issue({ purpose: 'email-new', email: member2.email, proof }, token), /被使用/);
    const next = await issue({ purpose: 'email-new', email: 'changed@example.invalid', proof }, token);
    await verify(next, token);
    assert.equal(await memberSession(db, token), null);
    assert.equal(await memberSession(db, token3), null);
    assert.equal(
      (await owner.query('SELECT email FROM gallery.member WHERE id=$1', [member.id])).rows[0].email,
      'changed@example.invalid',
    );
    const after = await issue({
      purpose: 'login',
      email: 'changed@example.invalid',
    });
    const finalToken = (await verify(after)).session!.token;
    await revokeMemberSessions(db, finalToken, true);
    assert.equal(await memberSession(db, finalToken), null);
    const state = await adminCommunity(admin, new URLSearchParams('status=all'));
    assert.ok(state.totals.members >= 2);
  } finally {
    await raw.end();
    await db.destroy();
    await setFlags({
      registration: false,
      comments: false,
      likes: false,
      showComments: false,
      showLikes: false,
    });
  }
}
