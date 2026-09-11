import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { ensure, type GalleryUser } from '@gallery/core';
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (e, key) =>
      e ? reject(e) : resolve(key),
    ),
  );
export const tokenHash = (token: string) => createHash('sha256').update(token).digest();
export async function hashPassword(password: string) {
  ensure(password.length >= 16 && password.length <= 256, '密码需要 16–256 个字符。');
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
const dummy = `scrypt-v1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
async function verifyPassword(password: string, hash: string) {
  const [method, salt, key] = hash.split('$');
  if (method !== 'scrypt-v1' || !/^[0-9a-f]{32}$/.test(salt ?? '') || !/^[0-9a-f]{128}$/.test(key ?? '')) return false;
  const actual = await derive(password, salt!);
  return timingSafeEqual(actual, Buffer.from(key!, 'hex'));
}
async function throttle(db: Kysely<unknown>, key: string, limit: number) {
  const { rows } = await sql<{
    attempts: number;
  }>`INSERT INTO gallery.auth_throttle(key_hash,attempts,reset_at) VALUES(${tokenHash(key)},1,now()+interval '15 minutes') ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN gallery.auth_throttle.reset_at < now() THEN 1 ELSE gallery.auth_throttle.attempts+1 END, reset_at=CASE WHEN gallery.auth_throttle.reset_at < now() THEN now()+interval '15 minutes' ELSE gallery.auth_throttle.reset_at END RETURNING attempts`.execute(
    db,
  );
  ensure(rows[0]!.attempts <= limit, '尝试次数过多，请 15 分钟后再试。', 429);
}
export async function login(db: Kysely<unknown>, email: unknown, password: unknown, address: string) {
  ensure(
    typeof email === 'string' && email.length <= 254 && typeof password === 'string' && password.length <= 256,
    '账号或密码不正确。',
    401,
  );
  const normalized = email.trim().toLowerCase();
  await throttle(db, `ip:${address}`, 60);
  await throttle(db, `account:${normalized}`, 10);
  const { rows } = await sql<{
    id: string;
    password_hash: string;
  }>`SELECT u.id,c.password_hash FROM gallery."user" u JOIN gallery.user_credential c ON c.user_id=u.id WHERE u.email_normalized=${normalized} AND u.role='admin' AND u.status='active'`.execute(
    db,
  );
  const user = rows[0];
  const valid = await verifyPassword(password, user?.password_hash ?? dummy);
  ensure(user && valid, '账号或密码不正确。', 401);
  return db.transaction().execute(async (trx) => {
    const current = (
      await sql<{
        password_hash: string;
      }>`SELECT c.password_hash FROM gallery."user" u JOIN gallery.user_credential c ON c.user_id=u.id WHERE u.id=${user.id}::uuid AND u.status='active' AND u.role='admin' FOR UPDATE OF u`.execute(
        trx,
      )
    ).rows[0];
    ensure(current?.password_hash === user.password_hash, '账号或密码不正确。', 401);
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await sql`INSERT INTO gallery.session(id,user_id,token_hash,audience,expires_at) VALUES(${randomUUID()}::uuid,${user.id}::uuid,${tokenHash(token)},'admin',${expires})`.execute(
      trx,
    );
    await sql`DELETE FROM gallery.auth_throttle WHERE key_hash=${tokenHash(`account:${normalized}`)} OR reset_at < now()`.execute(
      trx,
    );
    await sql`DELETE FROM gallery.session WHERE expires_at < now()`.execute(trx);
    return { token, expires };
  });
}
export async function sessionUser(db: Kysely<unknown>, token: string | undefined): Promise<GalleryUser | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = (
    await sql<{
      id: string;
      email: string;
      display_name: string;
    }>`SELECT u.id,u.email,u.display_name FROM gallery.session s JOIN gallery."user" u ON u.id=s.user_id WHERE s.token_hash=${tokenHash(token)} AND s.audience='admin' AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status='active' AND u.role='admin'`.execute(
      db,
    )
  ).rows[0];
  return row ? { id: row.id, email: row.email, displayName: row.display_name } : null;
}
export async function logout(db: Kysely<unknown>, token: string) {
  await sql`UPDATE gallery.session SET revoked_at=now() WHERE token_hash=${tokenHash(token)}`.execute(db);
}
export async function changePassword(
  db: Kysely<unknown>,
  user: GalleryUser,
  oldPassword: unknown,
  newPassword: unknown,
) {
  ensure(
    typeof oldPassword === 'string' && oldPassword.length <= 256 && typeof newPassword === 'string',
    '密码格式无效。',
  );
  await throttle(db, `password:${user.id}`, 10);
  const hashed = await hashPassword(newPassword);
  await db.transaction().execute(async (trx) => {
    await sql`SELECT id FROM gallery."user" WHERE id=${user.id}::uuid FOR UPDATE`.execute(trx);
    const credential = (
      await sql<{
        password_hash: string;
      }>`SELECT password_hash FROM gallery.user_credential WHERE user_id=${user.id}::uuid`.execute(trx)
    ).rows[0];
    ensure(credential && (await verifyPassword(oldPassword, credential.password_hash)), '当前密码不正确。', 400);
    await sql`UPDATE gallery.user_credential SET password_hash=${hashed},password_changed_at=now(),updated_at=now() WHERE user_id=${user.id}::uuid`.execute(
      trx,
    );
    await sql`UPDATE gallery.session SET revoked_at=now() WHERE user_id=${user.id}::uuid AND revoked_at IS NULL`.execute(
      trx,
    );
    await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${randomUUID()}::uuid,${user.id}::uuid,'password.change','user',${user.id})`.execute(
      trx,
    );
  });
}

export async function updateProfile(db: Kysely<unknown>, user: GalleryUser, displayName: unknown) {
  ensure(
    typeof displayName === 'string' && displayName.trim().length > 0 && displayName.length <= 100,
    '昵称需要 1–100 个字符。',
  );
  await db.transaction().execute(async (trx) => {
    const result =
      await sql`UPDATE gallery."user" SET display_name=${displayName.trim()},updated_at=now() WHERE id=${user.id}::uuid AND role='admin' AND status='active' RETURNING id`.execute(
        trx,
      );
    ensure(result.rows.length, '登录已失效。', 401);
    await sql`INSERT INTO gallery.audit_event(id,actor_user_id,action,target_type,target_id) VALUES(${randomUUID()}::uuid,${user.id}::uuid,'profile.update','user',${user.id})`.execute(
      trx,
    );
  });
}
