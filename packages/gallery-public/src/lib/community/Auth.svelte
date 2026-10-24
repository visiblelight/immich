<script lang="ts">
  import { tick, onMount } from 'svelte';
  import './forms.css';
  import type { CommunityClient } from './context';
  let {
    open = $bindable(false),
    client,
    onlogin,
  }: {
    open?: boolean;
    client: CommunityClient;
    onlogin: () => Promise<void>;
  } = $props();
  let dialog: HTMLDialogElement,
    mode = $state<'login' | 'register'>('login'),
    stage = $state('email');
  let email = $state(''),
    name = $state(''),
    code = $state(''),
    id = $state(''),
    error = $state(''),
    busy = $state(false),
    remaining = $state(0);
  let deadline = 0;
  onMount(() => {
    const timer = setInterval(
      () => (remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))),
      500,
    );
    return () => clearInterval(timer);
  });
  $effect(() => {
    if (open)
      void tick().then(() => {
        if (open && !dialog.open) dialog.showModal();
      });
    else dialog?.close();
  });
  $effect(() => {
    if (!client.settings.registration && mode === 'register') {
      mode = 'login';
      stage = 'email';
    }
  });
  async function send() {
    busy = true;
    error = '';
    try {
      const r = await client.request('code', { purpose: mode, email, name });
      id = r.id;
      stage = 'code';
      code = '';
      deadline = Date.now() + r.resendAfter * 1000;
      remaining = r.resendAfter;
    } catch (e) {
      error = (e as Error).message;
      await client.refresh().catch(() => {});
    } finally {
      busy = false;
    }
  }
  async function submit() {
    if (stage === 'email') return send();
    busy = true;
    error = '';
    try {
      await client.request('verify', { id, code });
      await onlogin();
      open = false;
      stage = 'email';
      code = '';
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<dialog
  class="live-member-dialog member-surface"
  bind:this={dialog}
  aria-labelledby="member-auth-title"
  onclose={() => (open = false)}
  oncancel={() => (open = false)}
>
  <button class="close" aria-label="关闭登录" onclick={() => (open = false)}>×</button>
  <p class="brand">光与远方</p>
  <h2 id="member-auth-title">
    {stage === 'code' ? '查收邮箱验证码' : mode === 'register' ? '加入光与远方' : '欢迎回来'}
  </h2>
  <p class="intro">{stage === 'code' ? email : '使用邮箱验证码，无需密码。'}</p>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      void submit();
    }}
  >
    {#if stage === 'email'}{#if mode === 'register'}<label
          >展示名称<input bind:value={name} maxlength="40" required autocomplete="nickname" /></label
        >{/if}<label
        >邮箱<input type="email" bind:value={email} required maxlength="254" autocomplete="email" /></label
      >
    {:else}<label
        >验证码<input
          bind:value={code}
          required
          pattern={'[0-9]{6}'}
          maxlength="6"
          inputmode="numeric"
          autocomplete="one-time-code"
        /></label
      >
      <p class="intro">已发送验证码，10 分钟内有效。</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}<button class="primary" disabled={busy}
      >{busy
        ? '处理中…'
        : stage === 'email'
          ? '获取验证码'
          : mode === 'register'
            ? '完成注册'
            : '登录'}</button
    >
  </form>
  {#if stage === 'code'}<div class="alternates">
      <button disabled={busy || remaining > 0} onclick={send}
        >{remaining ? `${remaining} 秒后重发` : '重新获取'}</button
      ><button
        disabled={busy}
        onclick={() => {
          stage = 'email';
          error = '';
        }}>更换邮箱</button
      >
    </div>
  {:else if client.settings.registration}<p class="intro">
      {mode === 'login' ? '第一次来？' : '已经注册？'}
      <button
        class="text"
        onclick={() => {
          mode = mode === 'login' ? 'register' : 'login';
          error = '';
        }}
        >{mode === 'login'
          ? error === '这个邮箱尚未注册。'
            ? '使用此邮箱注册'
            : '创建账号'
          : '登录'}</button
      >
    </p>{/if}
  <p class="privacy">邮箱仅用于身份验证，不会公开展示。</p>
</dialog>

<style>
  :global(html:has(dialog.live-member-dialog[open])) {
    overflow: hidden;
  }
  dialog {
    box-sizing: border-box;
    width: min(420px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 42px 38px 28px;
    border: 0;
    border-radius: 18px;
    background: #fafbf9;
    overflow: auto;
    box-shadow: 0 24px 100px #14231b33;
  }
  dialog::backdrop {
    background: #182c2460;
    backdrop-filter: blur(5px);
  }
  .close {
    position: absolute;
    right: 16px;
    top: 12px;
    border: 0;
    background: none;
    color: #879181;
    font-size: 26px;
    padding: 4px 8px;
  }
  h2 {
    font-size: 25px;
    font-weight: 500;
    margin: 28px 0 8px;
    letter-spacing: 0.03em;
  }
  .brand {
    color: #6f7e69;
    font-family: Georgia, 'Songti SC', serif;
    font-size: 15px;
    margin: 0;
  }
  .intro,
  .privacy {
    font-size: 12px;
    color: #879181;
    line-height: 1.8;
    overflow-wrap: anywhere;
  }
  .privacy {
    font-size: 10px;
    margin: 24px 0 0;
  }
  form {
    margin: 28px 0 12px;
  }
  .primary {
    width: 100%;
    margin: 10px 0 0;
  }
  .alternates {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  @media (max-width: 420px) {
    dialog {
      padding: 36px 26px 24px;
    }
  }
</style>
