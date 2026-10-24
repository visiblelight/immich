<script lang="ts">
  import { onMount } from 'svelte';
  import '$lib/community/forms.css';
  import { PublicFrame, MemberAvatar } from '@gallery/ui';
  import { communityClient } from '$lib/community/context';
  import { goto } from '$app/navigation';
  const client = communityClient();
  let name = $state(''),
    avatar = $state(''),
    error = $state(''),
    notice = $state(''),
    busy = $state(false),
    changing = $state(false),
    editing = $state(false),
    step = $state(0),
    code = $state(''),
    email = $state(''),
    proof = $state(''),
    challenge = $state(''),
    remaining = $state(0);
  let deadline = 0;
  $effect(() => {
    name = client.user?.name ?? '';
    avatar = client.user?.avatar ?? '';
  });
  onMount(() => {
    const t = setInterval(() => (remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  });
  async function save() {
    busy = true;
    error = '';
    notice = '';
    try {
      await client.request('profile', { name, avatar });
      await client.refresh();
      notice = '个人资料已保存。';
      editing = false;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function logout(all = false) {
    busy = true;
    try {
      await client.request('logout', { all });
      await client.refresh();
      await goto('/albums');
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function send() {
    busy = true;
    error = '';
    try {
      const r = await client.request('code', {
        purpose: step < 2 ? 'email-old' : 'email-new',
        email,
        proof,
      });
      challenge = r.id;
      deadline = Date.now() + r.resendAfter * 1000;
      remaining = r.resendAfter;
      step = step < 2 ? 1 : 3;
      code = '';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function verify() {
    busy = true;
    error = '';
    try {
      const r = await client.request('verify', { id: challenge, code });
      if (step === 1) {
        proof = r.proof;
        step = 2;
        code = '';
        deadline = 0;
        remaining = 0;
      } else {
        await client.refresh();
        changing = false;
        notice = '邮箱已更新，所有设备已退出。请使用新邮箱重新登录。';
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>个人资料 · 光与远方</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<PublicFrame site={{ name: '光与远方' }} active="">
  <section class="profile member-surface">
    <p class="eyebrow">个人资料</p>
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}{#if error}<p class="error" role="alert">
        {error}
      </p>{/if}
    {#if client.user}
      <div class="identity">
        <MemberAvatar seed={editing ? avatar : client.user.avatar} size={72} />
        <div>
          <h1>{client.user.name}</h1>
          <span>在光与远方留下你的足迹</span>
        </div>
        {#if !editing}<button
            class="text"
            onclick={() => {
              editing = true;
              notice = '';
              error = '';
            }}>修改资料</button
          >{/if}
      </div>
      {#if editing}<form
          class="edit-profile"
          onsubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div class="avatar-actions">
            <button
              class="text"
              type="button"
              disabled={busy}
              onclick={() => {
                avatar = crypto.randomUUID();
                notice = '';
              }}>换一个随机头像 ↻</button
            >
            {#if avatar !== client.user.avatar}<button
                class="text"
                type="button"
                disabled={busy}
                onclick={() => (avatar = client.user!.avatar)}>还原</button
              >{/if}
          </div>
          <label>展示名称<input bind:value={name} required maxlength="40" autocomplete="nickname" /></label>
          <div class="form-actions">
            <button class="primary" disabled={busy}>{busy ? '保存中…' : '保存修改'}</button><button
              class="text"
              type="button"
              disabled={busy}
              onclick={() => {
                editing = false;
                name = client.user!.name;
                avatar = client.user!.avatar;
                error = '';
              }}>取消</button
            >
          </div>
        </form>{/if}
      <div class="email-row">
        <div>
          <span>绑定邮箱</span>
          <p>{client.user.email}</p>
        </div>
        <button
          class="text"
          disabled={busy}
          onclick={() => {
            changing = !changing;
            step = 0;
            proof = '';
            code = '';
            error = '';
          }}>修改邮箱</button
        >
      </div>
      {#if changing}<section class="email">
          <h2>修改绑定邮箱</h2>
          <p>
            {step < 2 ? '先验证当前邮箱，再绑定新邮箱。' : '请输入新的邮箱地址并完成验证。'}
          </p>
          <form
            onsubmit={(e) => {
              e.preventDefault();
              void (step === 0 || step === 2 ? send() : verify());
            }}
          >
            {#if step >= 2}<label
                >新邮箱<input
                  type="email"
                  bind:value={email}
                  required
                  readonly={step === 3}
                  autocomplete="email"
                /></label
              >{/if}
            {#if step === 1 || step === 3}<label
                >{step === 1 ? '当前邮箱' : '新邮箱'}验证码<input
                  bind:value={code}
                  required
                  pattern={'[0-9]{6}'}
                  maxlength="6"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                /></label
              >{/if}
            <button class="primary" disabled={busy}
              >{['获取当前邮箱验证码', '验证并继续', '获取新邮箱验证码', '确认更换邮箱'][step]}</button
            >
            {#if step === 1 || step === 3}<button
                class="text"
                type="button"
                disabled={busy || remaining > 0}
                onclick={send}>{remaining ? `${remaining} 秒后重发` : '重新获取'}</button
              >{/if}
            <button
              class="text"
              type="button"
              disabled={busy}
              onclick={() => {
                changing = false;
                proof = '';
                code = '';
              }}>取消</button
            >
          </form>
        </section>{/if}
      <div class="logout">
        <button class="text" disabled={busy} onclick={() => logout()}>退出登录</button><button
          class="text"
          disabled={busy}
          onclick={() => logout(true)}>退出所有设备</button
        >
      </div>
    {:else if client.enabled}<p>登录后管理你的名称、头像和邮箱。</p>
      <button class="primary" onclick={() => client.login()}>登录</button>{:else}<p>
        用户功能暂未启用。
      </p>{/if}
  </section>
</PublicFrame>

<style>
  .profile {
    max-width: 560px;
    margin: 65px auto 90px;
  }
  .eyebrow {
    font-size: 12px;
    color: #7b8872;
    margin: 0 0 32px;
  }
  h1 {
    font-size: 26px;
    font-weight: 500;
    margin: 0 0 8px;
    overflow-wrap: anywhere;
  }
  h2 {
    font-size: 16px;
    font-weight: 500;
  }
  p {
    color: #7b8477;
    line-height: 1.8;
    overflow-wrap: anywhere;
  }
  .identity {
    display: flex;
    align-items: center;
    gap: 22px;
    margin-bottom: 36px;
  }
  .identity > div {
    flex: 1;
    min-width: 0;
  }
  .identity span {
    color: #8d9687;
    font-size: 11px;
  }
  .identity > button {
    white-space: nowrap;
  }
  .edit-profile {
    padding: 0 0 30px;
  }
  .avatar-actions,
  .form-actions {
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .email-row {
    border-top: 1px solid #e4e7e0;
    padding: 26px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .email-row span {
    font-size: 11px;
    color: #8d9687;
  }
  .email-row p {
    font-size: 14px;
    color: #40503c;
    margin: 5px 0 0;
  }
  .email-row button {
    flex: none;
  }
  .email {
    padding: 6px 0 26px;
  }
  .email p {
    font-size: 12px;
  }
  .email button {
    margin: 8px 12px 0 0;
  }
  .logout {
    border-top: 1px solid #e4e7e0;
    padding-top: 20px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .logout button {
    color: #8b9584;
    font-size: 11px;
  }
  @media (max-width: 600px) {
    .profile {
      margin: 36px 0 65px;
    }
    .identity {
      gap: 16px;
      flex-wrap: wrap;
    }
  }
</style>
