import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { ensure } from '@gallery/core';
import { hashPassword } from './auth.server.ts';

/** Offline administration: requires the migration login, never a runtime role. */
export async function maintainAccount(
  client: pg.Client,
  action: string,
  email: string,
  password?: string,
  displayName?: string,
) {
  ensure(['create', 'reset-password', 'disable', 'enable'].includes(action), '账号维护操作无效。');
  ensure(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), '邮箱格式无效。');
  const normalized = email.trim().toLowerCase();
  const identity = await client.query('SELECT current_user');
  ensure(identity.rows[0].current_user === 'gallery_migrator', '账号维护必须使用迁移账号。', 403);
  const hash = ['create', 'reset-password'].includes(action) ? await hashPassword(password ?? '') : null;
  if (action === 'create')
    ensure(displayName && displayName.trim().length > 0 && displayName.length <= 100, '请提供 1–100 字符的昵称。');
  await client.query('BEGIN');
  try {
    // Serialize administrator creation/disable so concurrent commands cannot remove the last admin.
    await client.query('LOCK TABLE gallery."user" IN SHARE ROW EXCLUSIVE MODE');
    const existing = (
      await client.query('SELECT id,role,status FROM gallery."user" WHERE email_normalized=$1', [normalized])
    ).rows[0];
    let id = existing?.id;
    if (action === 'create') {
      ensure(!existing, '账号已存在。', 409);
      id = randomUUID();
      await client.query(
        'INSERT INTO gallery."user"(id,email,email_normalized,display_name,role) VALUES($1,$2,$3,$4,\'admin\')',
        [id, email.trim(), normalized, displayName!.trim()],
      );
      await client.query('INSERT INTO gallery.user_credential(user_id,password_hash) VALUES($1,$2)', [id, hash]);
    } else {
      ensure(existing && existing.role === 'admin', '管理员账号不存在。', 404);
      if (action === 'disable' && existing.status === 'active') {
        const count = await client.query(
          "SELECT count(*)::integer AS count FROM gallery.\"user\" WHERE role='admin' AND status='active'",
        );
        ensure(count.rows[0].count > 1, '不能停用最后一个可用管理员。', 409);
      }
      if (action === 'reset-password') {
        await client.query(
          'INSERT INTO gallery.user_credential(user_id,password_hash) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,password_changed_at=now(),updated_at=now()',
          [id, hash],
        );
      } else {
        await client.query('UPDATE gallery."user" SET status=$2,updated_at=now() WHERE id=$1', [
          id,
          action === 'enable' ? 'active' : 'disabled',
        ]);
      }
      await client.query('UPDATE gallery.session SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]);
    }
    await client.query("INSERT INTO gallery.audit_event(id,action,target_type,target_id) VALUES($1,$2,'user',$3)", [
      randomUUID(),
      'account.' + action,
      id,
    ]);
    await client.query('COMMIT');
    return { id };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}
