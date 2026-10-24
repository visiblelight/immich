import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { ensure, uuid, avatarGeometry, type Member, type CommunitySettings } from '@gallery/core';
import { tokenHash } from './auth.server.ts';
import type { SendMemberCode } from './community-mail.server.ts';
type Db = Kysely<unknown>;
export const memberLifetime = 180 * 86400_000;
export function memberEmail(input: unknown) {
  ensure(typeof input === 'string', '请输入邮箱。');
  const value = input.trim().toLowerCase();
  ensure(value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value), '邮箱格式不正确。');
  return value;
}
export function memberName(input: unknown) {
  ensure(
    typeof input === 'string' &&
      input.trim().length > 0 &&
      [...input.trim()].length <= 40 &&
      !/[\u0000-\u001f\u007f]/.test(input),
    '展示名称需要 1–40 个字。',
  );
  return input.trim();
}
export async function communitySettings(db: Db, lock = false): Promise<CommunitySettings> {
  if (lock) await sql`SELECT pg_advisory_xact_lock_shared(728310,24)`.execute(db);
  return (
    await sql<CommunitySettings>`SELECT registration,comments,likes,show_comments AS "showComments",show_likes AS "showLikes" FROM gallery.community_settings WHERE id=1`.execute(
      db,
    )
  ).rows[0]!;
}
type SessionRow = Member & { expires: Date };
export async function memberSession(
  db: Db,
  token: string | undefined,
  lock = false,
): Promise<SessionRow | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return (
    (
      await sql<SessionRow>`SELECT m.id,m.display_name AS name,m.email,m.avatar,m.trusted,s.expires_at AS expires
    FROM gallery.member_session s JOIN gallery.member m ON m.id=s.member_id
    WHERE s.token_hash=${tokenHash(token)} AND s.expires_at>now() AND s.revoked_at IS NULL AND NOT m.disabled ${lock ? sql`FOR UPDATE OF m,s` : sql``}`.execute(
        db,
      )
    ).rows[0] ?? null
  );
}
export async function requireMember(db: Db, token: string | undefined, lock = false) {
  const member = await memberSession(db, token, lock);
  ensure(member, '请先登录。', 401);
  return member;
}
export async function renewMemberSession(db: Db, token: string) {
  return db.transaction().execute(async (trx) => {
    const member = await memberSession(trx, token, true);
    if (!member) return null;
    if (member.expires.getTime() < Date.now() + memberLifetime - 86400_000) {
      member.expires = new Date(Date.now() + memberLifetime);
      await sql`UPDATE gallery.member_session SET expires_at=${member.expires} WHERE token_hash=${tokenHash(token)}`.execute(
        trx,
      );
    }
    return member;
  });
}
async function newSession(db: Db, id: string) {
  const token = randomBytes(32).toString('base64url'),
    expires = new Date(Date.now() + memberLifetime);
  await sql`INSERT INTO gallery.member_session(token_hash,member_id,expires_at) VALUES(${tokenHash(token)},${id}::uuid,${expires})`.execute(
    db,
  );
  return { token, expires };
}
export async function revokeMemberSessions(db: Db, token: string | undefined, all = false) {
  const m = await memberSession(db, token);
  if (!m) return;
  await sql`UPDATE gallery.member_session SET revoked_at=now() WHERE member_id=${m.id}::uuid ${all ? sql`` : sql`AND token_hash=${tokenHash(token!)}`}`.execute(
    db,
  );
}
async function unusedAvatar(db: Db) {
  for (let i = 0; i < 10; i++) {
    const avatar = randomUUID(),
      fingerprint = avatarGeometry(avatar).fingerprint;
    if (
      !(await sql`SELECT 1 FROM gallery.member WHERE avatar_fingerprint=${fingerprint}`.execute(db)).rows
        .length
    )
      return { avatar, fingerprint };
  }
  throw new Error('Avatar allocation failed');
}
export async function saveMember(db: Db, token: string | undefined, input: Record<string, unknown>) {
  const name = memberName(input.name);
  return db.transaction().execute(async (trx) => {
    const m = await requireMember(trx, token, true);
    // Serialize only avatar allocation; no email-derived identity or third-party service.
    await sql`SELECT pg_advisory_xact_lock(728310,23)`.execute(trx);
    let avatar: { avatar: string; fingerprint: string } | null =
      input.randomAvatar === true ? await unusedAvatar(trx) : null;
    if (input.avatar !== undefined) {
      const seed = uuid(input.avatar),
        fingerprint = avatarGeometry(seed).fingerprint;
      ensure(
        !(
          await sql`SELECT 1 FROM gallery.member WHERE avatar_fingerprint=${fingerprint} AND id<>${m.id}::uuid`.execute(
            trx,
          )
        ).rows.length,
        '这个头像已有人使用，请再换一个。',
        409,
      );
      avatar = { avatar: seed, fingerprint };
    }
    await sql`UPDATE gallery.member SET display_name=${name},updated_at=now() ${avatar ? sql`,avatar=${avatar.avatar},avatar_fingerprint=${avatar.fingerprint}` : sql``} WHERE id=${m.id}::uuid`.execute(
      trx,
    );
    return { ...m, name, avatar: avatar?.avatar ?? m.avatar };
  });
}
type Challenge = {
  id: string;
  email: string;
  purpose: string;
  member_id: string | null;
  name: string | null;
  session_hash: Buffer | null;
  proof_hash: Buffer | null;
  code_hash: Buffer;
  attempts: number;
  expires_at: Date;
  delivered: boolean;
  consumed_at: Date | null;
};
const otpHash = (secret: string, id: string, code: string) =>
  createHmac('sha256', secret).update(`${id}:${code}`).digest();
const checkSecret = (secret: string) => ensure(secret.length >= 32, '邮箱验证码服务尚未配置。', 503);
export async function issueMemberCode(
  db: Db,
  secret: string,
  send: SendMemberCode,
  input: Record<string, unknown>,
  token?: string,
) {
  checkSecret(secret);
  const purpose = String(input.purpose);
  ensure(['register', 'login', 'email-old', 'email-new'].includes(purpose), '验证码用途无效。');
  const member = purpose.startsWith('email-') ? await requireMember(db, token) : null;
  const email = purpose === 'email-old' ? member!.email : memberEmail(input.email);
  const name = purpose === 'register' ? memberName(input.name) : null;
  const id = randomUUID(),
    code = String(randomInt(0, 1000000)).padStart(6, '0');
  const issued = await db.transaction().execute(async (trx) => {
    const settings = await communitySettings(trx, true);
    if (purpose === 'register') ensure(settings.registration, '注册暂时关闭。', 403);
    // A cooldown is scoped to email + purpose and persists across application instances.
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${email}:${purpose}`},23))`.execute(trx);
    const latest = (
      await sql<{
        recent: boolean;
      }>`SELECT created_at>now()-interval '60 seconds' AS recent FROM gallery.member_challenge WHERE email=${email} AND purpose=${purpose} ORDER BY created_at DESC LIMIT 1`.execute(
        trx,
      )
    ).rows[0];
    ensure(!latest?.recent, '请在 60 秒后重新获取验证码。', 429);
    const existing = (
      await sql<{
        id: string;
        disabled: boolean;
      }>`SELECT id,disabled FROM gallery.member WHERE email=${email}`.execute(trx)
    ).rows[0];
    if (purpose === 'register') ensure(!existing, '这个邮箱已经注册，请直接登录。', 409);
    if (purpose === 'login') {
      ensure(
        existing,
        settings.registration ? '这个邮箱尚未注册。' : '这个邮箱尚未注册，目前暂未开放注册。',
        404,
      );
      ensure(!existing.disabled, '此账号已停用，请联系站长。', 403);
    }
    if (member) await requireMember(trx, token, true);
    let proof: Buffer | null = null;
    if (purpose === 'email-new') {
      ensure(!existing, '这个邮箱已经被使用。', 409);
      ensure(typeof input.proof === 'string' && input.proof.length === 43, '请先验证当前邮箱。');
      proof = tokenHash(input.proof);
      const old = (
        await sql`SELECT id FROM gallery.member_challenge WHERE member_id=${member!.id}::uuid AND purpose='email-old' AND email=${member!.email} AND session_hash=${tokenHash(token!)} AND proof_hash=${proof} AND expires_at>now() AND consumed_at IS NOT NULL`.execute(
          trx,
        )
      ).rows[0];
      ensure(old, '当前邮箱验证已过期，请重新验证。', 401);
    }
    await sql`UPDATE gallery.member_challenge SET consumed_at=now() WHERE email=${email} AND purpose=${purpose} AND consumed_at IS NULL`.execute(
      trx,
    );
    await sql`INSERT INTO gallery.member_challenge(id,email,purpose,member_id,name,session_hash,proof_hash,code_hash,expires_at)
      VALUES(${id}::uuid,${email},${purpose},${member?.id ?? existing?.id ?? null}::uuid,${name},${member ? tokenHash(token!) : null},${proof},${otpHash(secret, id, code)},now()+interval '10 minutes')`.execute(
      trx,
    );
    await sql`DELETE FROM gallery.member_challenge WHERE expires_at<now()-interval '1 day'`.execute(trx);
    await sql`DELETE FROM gallery.member_session WHERE expires_at<now()-interval '1 day'`.execute(trx);
    return true;
  });
  if (issued) {
    try {
      await send(email, code, purpose);
      await sql`UPDATE gallery.member_challenge SET delivered=true WHERE id=${id}::uuid AND consumed_at IS NULL`.execute(
        db,
      );
    } catch (e) {
      await sql`UPDATE gallery.member_challenge SET consumed_at=now() WHERE id=${id}::uuid`.execute(db);
      throw e;
    }
  }
  return { id, expiresIn: 600, resendAfter: 60 };
}
export async function verifyMemberCode(
  db: Db,
  secret: string,
  input: Record<string, unknown>,
  token?: string,
) {
  checkSecret(secret);
  const id = uuid(input.id);
  ensure(typeof input.code === 'string' && /^[0-9]{6}$/.test(input.code), '请输入 6 位验证码。');
  const code = input.code;
  const result = await db.transaction().execute(async (trx) => {
    const settings = await communitySettings(trx, true);
    const identity = (
      await sql<{
        member_id: string | null;
      }>`SELECT member_id FROM gallery.member_challenge WHERE id=${id}::uuid`.execute(trx)
    ).rows[0];
    if (identity?.member_id)
      await sql`SELECT id FROM gallery.member WHERE id=${identity.member_id}::uuid FOR UPDATE`.execute(trx);
    const c = (
      await sql<Challenge>`SELECT * FROM gallery.member_challenge WHERE id=${id}::uuid FOR UPDATE`.execute(
        trx,
      )
    ).rows[0];
    if (!c || !c.delivered || c.consumed_at || c.attempts >= 5 || c.expires_at.getTime() <= Date.now())
      return { error: '验证码已失效，请重新获取。' };
    if (!timingSafeEqual(c.code_hash, otpHash(secret, id, code))) {
      await sql`UPDATE gallery.member_challenge SET attempts=attempts+1 WHERE id=${id}::uuid`.execute(trx);
      return {
        error: c.attempts === 4 ? '尝试次数已用完，请重新获取验证码。' : '验证码不正确。',
      };
    }
    if (c.purpose === 'register') {
      ensure(settings.registration, '注册暂时关闭。', 403);
      await sql`SELECT pg_advisory_xact_lock(728310,23)`.execute(trx);
      const avatar = await unusedAvatar(trx),
        memberId = randomUUID();
      await sql`INSERT INTO gallery.member(id,email,display_name,avatar,avatar_fingerprint) VALUES(${memberId}::uuid,${c.email},${c.name},${avatar.avatar},${avatar.fingerprint})`.execute(
        trx,
      );
      await sql`UPDATE gallery.member_challenge SET consumed_at=now() WHERE id=${id}::uuid`.execute(trx);
      return { session: await newSession(trx, memberId) };
    }
    if (c.purpose === 'login') {
      const m = (
        await sql`SELECT id FROM gallery.member WHERE id=${c.member_id}::uuid AND email=${c.email} AND NOT disabled FOR UPDATE`.execute(
          trx,
        )
      ).rows[0];
      ensure(m, '账号不可用，请联系站长。', 403);
      await sql`UPDATE gallery.member_challenge SET consumed_at=now() WHERE id=${id}::uuid`.execute(trx);
      return { session: await newSession(trx, c.member_id!) };
    }
    const m = await requireMember(trx, token, true);
    ensure(
      m.id === c.member_id && c.session_hash?.equals(tokenHash(token!)),
      '邮箱验证不属于当前登录。',
      403,
    );
    if (c.purpose === 'email-old') {
      ensure(m.email === c.email, '当前邮箱已变更，请重新验证。', 409);
      const proof = randomBytes(32).toString('base64url');
      await sql`UPDATE gallery.member_challenge SET consumed_at=now(),proof_hash=${tokenHash(proof)} WHERE id=${id}::uuid`.execute(
        trx,
      );
      return { proof };
    }
    const old = (
      await sql`SELECT id FROM gallery.member_challenge WHERE member_id=${m.id}::uuid AND purpose='email-old' AND email=${m.email} AND session_hash=${tokenHash(token!)} AND proof_hash=${c.proof_hash} AND consumed_at IS NOT NULL AND expires_at>now() FOR UPDATE`.execute(
        trx,
      )
    ).rows[0];
    ensure(old, '当前邮箱验证已过期，请重新验证。', 401);
    await sql`UPDATE gallery.member SET email=${c.email},updated_at=now() WHERE id=${m.id}::uuid`.execute(
      trx,
    );
    await sql`UPDATE gallery.member_session SET revoked_at=now() WHERE member_id=${m.id}::uuid`.execute(trx);
    await sql`UPDATE gallery.member_challenge SET consumed_at=now(),proof_hash=NULL WHERE member_id=${m.id}::uuid`.execute(
      trx,
    );
    return { emailChanged: true };
  });
  ensure(!result.error, result.error ?? '验证码无效。', 400);
  return result;
}
