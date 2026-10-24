<script lang="ts">
  // Design-preview flow only. Real email verification is a separate delivery milestone.
  import { tick } from 'svelte';
  import type { Member } from './types';
  let {
    open = $bindable(false),
    registration = true,
    onlogin,
  }: {
    open?: boolean;
    registration?: boolean;
    onlogin: (user: Member) => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let mode = $state<'login' | 'register'>('login');
  let stage = $state<'email' | 'code'>('email');
  let email = $state('');
  let name = $state('');
  let code = $state('');
  let error = $state('');
  let attempts = $state(0);
  $effect(() => {
    if (open) {
      void tick().then(() => {
        if (open && !dialog.open) dialog.showModal();
      });
    } else dialog?.close();
  });
  $effect(() => {
    if (!registration && mode === 'register') {
      mode = 'login';
      stage = 'email';
    }
  });
  function submit() {
    error = '';
    if (stage === 'email') {
      if (mode === 'register' && !name.trim()) {
        error = '请输入展示名称。';
        return;
      }
      stage = 'code';
      code = '';
      attempts = 0;
      return;
    }
    if (code !== '246810') {
      attempts++;
      error = attempts >= 5 ? '尝试次数已用完，请重新获取验证码。' : '验证码不正确，请重试。';
      return;
    }
    if (attempts >= 5) return;
    onlogin({
      id: 'demo-member',
      name: mode === 'register' ? name.trim() : '山间来信',
      email: email.trim(),
      avatar: crypto.randomUUID(),
    });
    open = false;
    stage = 'email';
    code = '';
  }
</script>

<dialog
  class="member-dialog"
  bind:this={dialog}
  onclose={() => (open = false)}
  oncancel={() => (open = false)}
  aria-labelledby="member-dialog-title"
>
  <button class="close" aria-label="关闭登录" onclick={() => (open = false)}>×</button>
  <p class="brand">光与远方</p>
  <h2 id="member-dialog-title">
    {stage === 'code' ? '查收邮箱验证码' : mode === 'register' ? '留下你的名字' : '欢迎回来'}
  </h2>
  <p class="intro">
    {stage === 'code'
      ? email
      : mode === 'register'
        ? '用一个名字，分享旅途中的共鸣。'
        : '使用邮箱验证码登录，无需密码。'}
  </p>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      submit();
    }}
  >
    {#if stage === 'email'}
      {#if mode === 'register'}<label
          >展示名称<input
            bind:value={name}
            autocomplete="nickname"
            maxlength="40"
            required
            placeholder="你希望大家如何称呼你"
          /></label
        >{/if}
      <label
        >邮箱<input
          type="email"
          bind:value={email}
          autocomplete="email"
          maxlength="254"
          required
          placeholder="you@example.com"
        /></label
      >
      <button class="primary">获取验证码</button>
    {:else}
      <label
        >验证码<input
          class="code"
          bind:value={code}
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern={'[0-9]{6}'}
          maxlength="6"
          required
          placeholder="6 位数字"
        /></label
      >
      <p class="demo-hint">交互样稿 · 输入 246810 体验，不发送邮件。</p>
      <button class="primary" disabled={attempts >= 5}>{mode === 'register' ? '完成注册' : '登录'}</button>
      <button
        class="text-button"
        type="button"
        onclick={() => {
          stage = 'email';
          error = '';
        }}>更换邮箱 / 重新获取</button
      >
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </form>
  {#if registration && stage === 'email'}<p class="alternate">
      {mode === 'login' ? '第一次来？' : '已经注册？'}<button
        class="text-button"
        onclick={() => {
          mode = mode === 'login' ? 'register' : 'login';
          error = '';
        }}>{mode === 'login' ? '注册' : '登录'}</button
      >
    </p>{/if}
  <p class="privacy">邮箱仅用于身份验证，不会公开展示。</p>
</dialog>

<style>
  :global(html:has(dialog.member-dialog[open])) {
    overflow: hidden;
  }
  dialog {
    box-sizing: border-box;
    width: min(420px, calc(100vw - 32px));
    max-height: calc(100dvh - 40px);
    padding: 38px 36px 28px;
    border: 1px solid #dce2d6;
    border-radius: 9px;
    background: #fafbf9;
    color: #2f3731;
    overflow: auto;
  }
  dialog::backdrop {
    background: #182c2480;
    backdrop-filter: blur(3px);
  }
  .close {
    position: absolute;
    right: 14px;
    top: 12px;
    background: none;
    border: 0;
    font-size: 25px;
    line-height: 32px;
    width: 32px;
    color: #7b8477;
    cursor: pointer;
  }
  .brand {
    font:
      16px Georgia,
      'Songti SC',
      serif;
    color: #6f7e69;
    margin: 0 0 24px;
  }
  h2 {
    font-size: 25px;
    font-weight: 550;
    margin: 0 0 10px;
  }
  .intro {
    color: #7b8477;
    font-size: 13px;
    line-height: 1.8;
    margin: 0 0 26px;
    overflow-wrap: anywhere;
  }
  label {
    display: block;
    font-size: 13px;
    margin: 18px 0;
  }
  input {
    box-sizing: border-box;
    display: block;
    width: 100%;
    margin-top: 8px;
    border: 1px solid #dce2d6;
    background: white;
    color: inherit;
    font: inherit;
    padding: 12px;
    border-radius: 5px;
  }
  .code {
    font-size: 20px;
    letter-spacing: 0.18em;
  }
  .code::placeholder {
    font-size: 14px;
    letter-spacing: 0;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .primary {
    background: #41664e;
    color: white;
    width: 100%;
    border: 0;
    border-radius: 5px;
    padding: 12px;
    font-size: 14px;
    margin-top: 4px;
  }
  button:disabled {
    opacity: 0.5;
  }
  .text-button {
    background: none;
    border: 0;
    color: #41664e;
    padding: 8px 3px;
    font-size: 13px;
  }
  .alternate {
    font-size: 13px;
    margin: 18px 0 8px;
    color: #7b8477;
  }
  .privacy,
  .demo-hint {
    font-size: 11px;
    color: #8a9486;
    line-height: 1.7;
  }
  .privacy {
    margin: 18px 0 0;
  }
  .error {
    color: #a0523a;
    font-size: 12px;
  }
  @media (max-width: 400px) {
    dialog {
      padding: 32px 24px 24px;
    }
  }
</style>
