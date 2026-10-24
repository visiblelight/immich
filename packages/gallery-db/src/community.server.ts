import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { sql, type Kysely } from 'kysely';
import {
  ensure,
  uuid,
  type CommunityTarget,
  type CommunityThread,
  type CommunityComment,
  type GalleryUser,
} from '@gallery/core';
import { communitySettings, memberSession, requireMember } from './member.server.ts';
import { resolveDerivedPath, type MediaRoot } from './media.server.ts';
type Db = Kysely<unknown>;
export function communityTarget(input: unknown): CommunityTarget {
  ensure(input && typeof input === 'object', '互动对象无效。');
  const t = input as Record<string, unknown>;
  ensure(t.kind === 'album' || t.kind === 'photo' || t.kind === 'article', '互动对象无效。');
  return { kind: t.kind, id: uuid(t.id) };
}
export async function qualifyCommunityTarget(db: Db, target: CommunityTarget, root: MediaRoot) {
  if (target.kind === 'album') {
    ensure(
      (await sql`SELECT 1 FROM gallery.published_album WHERE album_id=${target.id}::uuid`.execute(db)).rows
        .length,
      '内容不存在或已下线。',
      404,
    );
    return target.id;
  }
  if (target.kind === 'article') {
    ensure(
      (await sql`SELECT 1 FROM gallery.published_article WHERE id=${target.id}::uuid`.execute(db)).rows
        .length,
      '内容不存在或已下线。',
      404,
    );
    return target.id;
  }
  const media = (
    await sql<{
      asset_id: string;
      preview_path: string;
      thumbnail_path: string;
    }>`
    SELECT m.asset_id,m.preview_path,m.thumbnail_path FROM gallery.published_media m WHERE m.photo_id=${target.id}::uuid
    UNION ALL SELECT m.asset_id,m.preview_path,m.thumbnail_path FROM gallery.published_article_photo p
    JOIN gallery.published_article_photo_media m ON m.article_id=p.article_id AND m.album_id=p.album_id AND m.asset_id=p.asset_id
    WHERE p.photo_id=${target.id}::uuid LIMIT 1`.execute(db)
  ).rows[0];
  ensure(media, '照片不存在或已下线。', 404);
  await validMedia(media, root);
  return media.asset_id;
}
async function validMedia(media: { thumbnail_path: string; preview_path: string }, root: MediaRoot) {
  try {
    for (const source of [media.thumbnail_path, media.preview_path]) {
      const path = await resolveDerivedPath(source, root),
        file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await file.stat();
        ensure(stat.isFile() && stat.size <= 64 * 1024 * 1024, '照片不可用。', 404);
      } finally {
        await file.close();
      }
    }
  } catch {
    ensure(false, '照片不存在或已下线。', 404);
  }
}
export async function communityThread(
  db: Db,
  root: MediaRoot,
  target: CommunityTarget,
  token?: string,
  page = 1,
  submittedId?: string,
): Promise<CommunityThread & { submitted?: CommunityComment }> {
  const id = await qualifyCommunityTarget(db, target, root),
    s = await communitySettings(db),
    m = await memberSession(db, token);
  const likes = s.showLikes
    ? (
        await sql<{
          n: string;
          liked: boolean;
        }>`SELECT count(*)::text AS n,coalesce(bool_or(member_id=${m?.id ?? null}::uuid),false) AS liked FROM gallery.community_like WHERE kind=${target.kind} AND target_id=${id}::uuid`.execute(
          db,
        )
      ).rows[0]!
    : null;
  const total = s.showComments
    ? Number(
        (
          await sql<{
            n: string;
          }>`SELECT count(*)::text AS n FROM gallery.community_comment WHERE kind=${target.kind} AND target_id=${id}::uuid AND status='published'`.execute(
            db,
          )
        ).rows[0]!.n,
      )
    : 0;
  const offset = (Math.max(1, Math.min(10000, Math.floor(page))) - 1) * 20;
  const comments = s.showComments
    ? (
        await sql<CommunityComment>`SELECT c.id,json_build_object('id',m.id,'name',m.display_name,'avatar',m.avatar) AS member,c.created_at::text AS date,c.body AS text,c.status,c.reply
    FROM gallery.community_comment c JOIN gallery.member m ON m.id=c.member_id
    WHERE c.kind=${target.kind} AND c.target_id=${id}::uuid AND (c.status='published' OR c.status='pending' AND c.member_id=${m?.id ?? null}::uuid)
    ORDER BY c.created_at ASC,c.id ASC LIMIT 21 OFFSET ${offset}`.execute(db)
      ).rows
    : [];
  const submitted =
    submittedId && s.showComments && m
      ? (
          await sql<CommunityComment>`
    SELECT c.id,json_build_object('id',m.id,'name',m.display_name,'avatar',m.avatar) AS member,
      c.created_at::text AS date,c.body AS text,c.status,c.reply
    FROM gallery.community_comment c JOIN gallery.member m ON m.id=c.member_id
    WHERE c.id=${submittedId}::uuid AND c.kind=${target.kind} AND c.target_id=${id}::uuid
      AND c.member_id=${m.id}::uuid AND c.status IN ('published','pending')`.execute(db)
        ).rows[0]
      : undefined;
  return {
    likes: Number(likes?.n ?? 0),
    liked: likes?.liked ?? false,
    total,
    comments: comments.slice(0, 20),
    hasMore: comments.length > 20,
    ...(submitted ? { submitted } : {}),
  };
}
export async function communityCounts(db: Db, root: MediaRoot, targets: CommunityTarget[]) {
  const s = await communitySettings(db);
  if (!s.showLikes) return {};
  const visible: { kind: string; id: string; canonical: string }[] = [];
  for (const kind of ['album', 'article'] as const) {
    const ids = targets.filter((t) => t.kind === kind).map((t) => t.id);
    if (!ids.length) continue;
    const column = kind === 'album' ? sql`album_id` : sql`id`,
      view = kind === 'album' ? sql`gallery.published_album` : sql`gallery.published_article`;
    const rows = (
      await sql<{
        id: string;
      }>`SELECT ${column} AS id FROM ${view} WHERE ${column}=ANY(${ids}::uuid[])`.execute(db)
    ).rows;
    visible.push(...rows.map((r) => ({ kind, id: r.id, canonical: r.id })));
  }
  const photoIds = targets.filter((t) => t.kind === 'photo').map((t) => t.id);
  if (photoIds.length) {
    const rows = (
      await sql<{
        id: string;
        asset_id: string;
        preview_path: string;
        thumbnail_path: string;
      }>`
      SELECT DISTINCT ON (id) * FROM (
       SELECT photo_id AS id,asset_id,preview_path,thumbnail_path FROM gallery.published_media WHERE photo_id=ANY(${photoIds}::uuid[])
       UNION ALL SELECT p.photo_id AS id,m.asset_id,m.preview_path,m.thumbnail_path FROM gallery.published_article_photo p
       JOIN gallery.published_article_photo_media m ON m.article_id=p.article_id AND m.album_id=p.album_id AND m.asset_id=p.asset_id
       WHERE p.photo_id=ANY(${photoIds}::uuid[])
      ) sources ORDER BY id`.execute(db)
    ).rows;
    for (const row of rows) {
      try {
        await validMedia(row, root);
        visible.push({ kind: 'photo', id: row.id, canonical: row.asset_id });
      } catch {
        /* Unavailable media has no public count. */
      }
    }
  }
  if (!visible.length) return {};
  const rows = (
    await sql<{
      kind: string;
      id: string;
      n: number;
    }>`SELECT kind,target_id AS id,count(*)::int AS n FROM gallery.community_like
    WHERE target_id=ANY(${visible.map((t) => t.canonical)}::uuid[]) GROUP BY kind,target_id`.execute(db)
  ).rows;
  const counts = new Map(rows.map((r) => [`${r.kind}:${r.id}`, r.n]));
  return Object.fromEntries(
    visible.map((t) => [`${t.kind}:${t.id}`, counts.get(`${t.kind}:${t.canonical}`) ?? 0]),
  );
}

export async function setCommunityLike(
  db: Db,
  root: MediaRoot,
  target: CommunityTarget,
  token: string | undefined,
  liked: boolean,
) {
  await db.transaction().execute(async (trx) => {
    const s = await communitySettings(trx, true),
      m = await requireMember(trx, token, true),
      id = await qualifyCommunityTarget(trx, target, root);
    ensure(s.showLikes && (!liked || s.likes), '点赞暂时关闭。', 403);
    if (liked)
      await sql`INSERT INTO gallery.community_like(member_id,kind,target_id) VALUES(${m.id}::uuid,${target.kind},${id}::uuid) ON CONFLICT DO NOTHING`.execute(
        trx,
      );
    else
      await sql`DELETE FROM gallery.community_like WHERE member_id=${m.id}::uuid AND kind=${target.kind} AND target_id=${id}::uuid`.execute(
        trx,
      );
  });
}
export function commentText(input: unknown) {
  ensure(typeof input === 'string', '请输入评论。');
  const value = input.trim();
  ensure(
    [...value].length >= 1 &&
      [...value].length <= 1000 &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    '评论需要 1–1000 个字。',
  );
  return value;
}
export async function addCommunityComment(
  db: Db,
  root: MediaRoot,
  target: CommunityTarget,
  token: string | undefined,
  text: unknown,
) {
  const body = commentText(text);
  return db.transaction().execute(async (trx) => {
    const s = await communitySettings(trx, true),
      m = await requireMember(trx, token, true),
      id = await qualifyCommunityTarget(trx, target, root);
    ensure(s.comments && s.showComments, '评论暂时关闭。', 403);
    const commentId = randomUUID();
    await sql`INSERT INTO gallery.community_comment(id,member_id,kind,target_id,body,status) VALUES(${commentId}::uuid,${m.id}::uuid,${target.kind},${id}::uuid,${body},${m.trusted ? 'published' : 'pending'})`.execute(
      trx,
    );
    return commentId;
  });
}
export async function removeCommunityComment(
  db: Db,
  root: MediaRoot,
  target: CommunityTarget,
  token: string | undefined,
  commentId: unknown,
) {
  const cid = uuid(commentId);
  await db.transaction().execute(async (trx) => {
    const m = await requireMember(trx, token, true),
      id = await qualifyCommunityTarget(trx, target, root);
    const r =
      await sql`UPDATE gallery.community_comment SET status='deleted',body='[已删除]',reply='',updated_at=now() WHERE id=${cid}::uuid AND member_id=${m.id}::uuid AND kind=${target.kind} AND target_id=${id}::uuid AND status<>'deleted' RETURNING id`.execute(
        trx,
      );
    ensure(r.rows.length, '评论不存在或不能删除。', 404);
  });
}
export async function adminCommunity(db: Db, input: URLSearchParams) {
  const page = Math.max(1, Math.min(10000, Number(input.get('page')) || 1)),
    q = (input.get('q') ?? '').trim().slice(0, 100);
  const status = input.get('status') ?? 'pending';
  ensure(['pending', 'published', 'hidden', 'all'].includes(status), '评论状态无效。');
  const needle = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  const predicate = sql`(${q}='' OR m.display_name ILIKE ${needle} OR m.email ILIKE ${needle} OR c.body ILIKE ${needle}) AND c.status<>'deleted' ${status === 'all' ? sql`` : sql`AND c.status=${status}`}`;
  const members = (
    await sql`SELECT id,email,display_name AS name,avatar,disabled,trusted,created_at AS date,
    (SELECT count(*)::int FROM gallery.community_comment c WHERE c.member_id=m.id AND c.status<>'deleted') AS comments,
    (SELECT count(*)::int FROM gallery.community_like l WHERE l.member_id=m.id) AS likes FROM gallery.member m
    WHERE ${q}='' OR display_name ILIKE ${needle} OR email ILIKE ${needle} ORDER BY created_at DESC,id LIMIT 50 OFFSET ${(page - 1) * 50}`.execute(
      db,
    )
  ).rows;
  const comments = (
    await sql`WITH listed AS (
    SELECT c.* FROM gallery.community_comment c JOIN gallery.member m ON m.id=c.member_id
    WHERE ${predicate} ORDER BY c.created_at DESC,c.id DESC LIMIT 50 OFFSET ${(page - 1) * 50}
    ) SELECT c.id,c.kind,c.target_id AS "targetId",c.body AS text,c.reply,c.status,c.created_at AS date,
    json_build_object('id',m.id,'name',m.display_name,'avatar',m.avatar) AS member,
    coalesce(destination.title,CASE c.kind WHEN 'album' THEN (SELECT title FROM gallery.album_draft WHERE album_id=c.target_id)
      WHEN 'photo' THEN (SELECT title FROM gallery.photo WHERE immich_asset_id=c.target_id)
      ELSE (SELECT content->>'title' FROM gallery.article WHERE id=c.target_id) END) AS title,
    destination.path AS "targetPath",destination.context AS "targetContext"
    FROM listed c JOIN gallery.member m ON m.id=c.member_id
    LEFT JOIN LATERAL (
      SELECT a.title,'/albums/' || a.slug AS path,NULL::text AS context,0 AS priority
      FROM gallery.published_album a WHERE c.kind='album' AND a.album_id=c.target_id
      UNION ALL
      SELECT coalesce(nullif(g.title,''),nullif(p.title,''),'未命名照片'),
        '/albums/' || p.album_slug || '?photo=' || p.photo_id::text,a.title,0
      FROM gallery.published_photo p JOIN gallery.published_album a ON a.album_id=p.album_id
      LEFT JOIN gallery.article_source_group g ON g.album_id=p.album_id AND g.group_id=p.group_id
      WHERE c.kind='photo' AND p.asset_id=c.target_id
      UNION ALL
      SELECT coalesce(nullif(g.title,''),nullif(p.title,''),'未命名照片'),
        '/records/' || a.slug,a.content->>'title',1
      FROM gallery.published_article_photo p JOIN gallery.published_article a ON a.id=p.article_id
      LEFT JOIN gallery.published_article_group g ON g.article_id=p.article_id AND g.album_id=p.album_id AND g.group_id=p.group_id
      WHERE c.kind='photo' AND p.asset_id=c.target_id
      UNION ALL
      SELECT a.content->>'title','/records/' || a.slug,NULL::text,0
      FROM gallery.published_article a WHERE c.kind='article' AND a.id=c.target_id
      ORDER BY priority,path LIMIT 1
    ) destination ON true
    ORDER BY c.created_at DESC,c.id DESC`.execute(db)
  ).rows;
  const totals = (
    await sql<{ members: number; comments: number; pending: number }>`SELECT
    (SELECT count(*)::int FROM gallery.member m WHERE ${q}='' OR display_name ILIKE ${needle} OR email ILIKE ${needle}) AS members,
    (SELECT count(*)::int FROM gallery.community_comment c JOIN gallery.member m ON m.id=c.member_id WHERE ${predicate}) AS comments,
    (SELECT count(*)::int FROM gallery.community_comment WHERE status='pending') AS pending`.execute(db)
  ).rows[0]!;
  return {
    settings: await communitySettings(db),
    members,
    comments,
    totals,
    page,
  };
}
export async function manageCommunity(db: Db, user: GalleryUser, input: Record<string, unknown>) {
  await db.transaction().execute(async (trx) => {
    const action = String(input.action);
    if (action === 'settings') {
      await sql`SELECT pg_advisory_xact_lock(728310,24)`.execute(trx);
      const s = input.settings as Record<string, unknown>;
      ensure(
        s &&
          ['registration', 'comments', 'likes', 'showComments', 'showLikes'].every(
            (k) => typeof s[k] === 'boolean',
          ),
        '互动设置无效。',
      );
      await sql`UPDATE gallery.community_settings SET registration=${s.registration as boolean},comments=${s.comments as boolean},likes=${s.likes as boolean},show_comments=${s.showComments as boolean},show_likes=${s.showLikes as boolean},updated_at=now() WHERE id=1`.execute(
        trx,
      );
    } else if (action === 'member') {
      const id = uuid(input.id);
      const exists = (await sql`SELECT id FROM gallery.member WHERE id=${id}::uuid FOR UPDATE`.execute(trx))
        .rows.length;
      ensure(exists, '用户不存在。', 404);
      if (typeof input.disabled === 'boolean')
        await sql`UPDATE gallery.member SET disabled=${input.disabled},updated_at=now() WHERE id=${id}::uuid`.execute(
          trx,
        );
      if (input.disabled === true || input.revoke === true)
        await sql`UPDATE gallery.member_session SET revoked_at=now() WHERE member_id=${id}::uuid`.execute(
          trx,
        );
    } else if (action === 'comment') {
      const id = uuid(input.id);
      const c = (
        await sql<{
          member_id: string;
          status: string;
        }>`SELECT member_id,status FROM gallery.community_comment WHERE id=${id}::uuid AND status<>'deleted'`.execute(
          trx,
        )
      ).rows[0];
      ensure(c, '评论不存在。', 404);
      // Match member-before-comment lock order used by public submission.
      await sql`SELECT id FROM gallery.member WHERE id=${c.member_id}::uuid FOR UPDATE`.execute(trx);
      ensure(
        (
          await sql`SELECT id FROM gallery.community_comment WHERE id=${id}::uuid AND status<>'deleted' FOR UPDATE`.execute(
            trx,
          )
        ).rows.length,
        '评论不存在。',
        404,
      );
      if (input.status !== undefined) {
        ensure(['published', 'hidden'].includes(String(input.status)), '评论状态无效。');
        await sql`UPDATE gallery.community_comment SET status=${String(input.status)},moderated_by=${user.id}::uuid,updated_at=now() WHERE id=${id}::uuid AND status<>'deleted'`.execute(
          trx,
        );
        if (input.status === 'published')
          await sql`UPDATE gallery.member SET trusted=true WHERE id=${c.member_id}::uuid`.execute(trx);
      }
      if (input.reply !== undefined) {
        const reply = input.reply === '' ? '' : commentText(input.reply);
        await sql`UPDATE gallery.community_comment SET reply=${reply},moderated_by=${user.id}::uuid,updated_at=now() WHERE id=${id}::uuid AND status='published'`.execute(
          trx,
        );
      }
    } else ensure(false, '未知管理操作。');
    await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${randomUUID()}::uuid,${user.id}::uuid,${`community.${action}`},'community',${typeof input.id === 'string' ? input.id : null})`.execute(
      trx,
    );
  });
}
