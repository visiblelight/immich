<script lang="ts">
  import { untrack } from 'svelte';
  import MemberAvatar from './MemberAvatar.svelte';
  import type { Member } from './types';
  let { user, onsave, onlogout }: { user: Member; onsave: (user: Member) => void; onlogout: () => void } =
    $props();
  let name = $state(untrack(() => user.name));
  let avatar = $state(untrack(() => user.avatar));
  let status = $state('');
  let changingEmail = $state(false);
  let oldCode = $state('');
  let newEmail = $state('');
  let newCode = $state('');
  let emailStage = $state(0);
  function save() {
    onsave({ ...user, name: name.trim(), avatar });
    status = '个人资料已保存。';
  }
  function changeEmail() {
    if (emailStage === 0) {
      emailStage = 1;
      status = '样稿验证码：246810，不发送邮件。';
    } else if (emailStage === 1) {
      if (oldCode !== '246810') status = '验证码不正确。';
      else {
        emailStage = 2;
        status = '';
      }
    } else if (emailStage === 2) {
      emailStage = 3;
      status = '样稿验证码：246810，不发送邮件。';
    } else if (newCode !== '246810') status = '验证码不正确。';
    else if (newEmail.trim().toLowerCase() === user.email.toLowerCase()) status = '新邮箱与当前邮箱相同。';
    else {
      onsave({ ...user, email: newEmail.trim() });
      changingEmail = false;
      emailStage = 0;
      status = '绑定邮箱已更新（样稿）。';
    }
  }
</script>

<section class="profile">
  <h1>个人资料</h1>
  <p class="intro">一个名字，记录你的来访。</p>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      save();
    }}
  >
    <div class="avatar-row">
      <MemberAvatar seed={avatar} size={72} />
      <div>
        <button
          class="secondary"
          type="button"
          onclick={() => {
            avatar = crypto.randomUUID();
            status = '';
          }}>换一个头像</button
        >
        <p>随机生成，保存后生效</p>
      </div>
    </div>
    <label>展示名称<input bind:value={name} required maxlength="40" autocomplete="nickname" /></label>
    <div class="email-row">
      <div>
        <span>绑定邮箱</span>
        <p>{user.email}</p>
      </div>
      <button
        class="text"
        type="button"
        onclick={() => {
          changingEmail = !changingEmail;
          status = '';
        }}>修改</button
      >
    </div>
    <button class="primary">保存修改</button>
  </form>
  {#if changingEmail}<form
      class="email-change"
      onsubmit={(e) => {
        e.preventDefault();
        changeEmail();
      }}
    >
      <h2>修改绑定邮箱</h2>
      <p>{emailStage < 2 ? '先验证当前邮箱，再绑定新邮箱。' : '验证新邮箱后完成修改。'}</p>
      {#if emailStage === 1}<label
          >当前邮箱验证码<input
            bind:value={oldCode}
            required
            pattern={'[0-9]{6}'}
            maxlength="6"
            inputmode="numeric"
            autocomplete="one-time-code"
          /></label
        >{/if}
      {#if emailStage >= 2}<label
          >新邮箱<input
            type="email"
            bind:value={newEmail}
            required
            readonly={emailStage === 3}
            autocomplete="email"
          /></label
        >{/if}
      {#if emailStage === 3}<label
          >新邮箱验证码<input
            bind:value={newCode}
            required
            pattern={'[0-9]{6}'}
            maxlength="6"
            inputmode="numeric"
            autocomplete="one-time-code"
          /></label
        >{/if}
      <button class="primary"
        >{['获取当前邮箱验证码', '验证并继续', '获取新邮箱验证码', '确认更换邮箱'][emailStage]}</button
      >
    </form>{/if}
  {#if status}<p role="status" class="status">{status}</p>{/if}
  <div class="logout">
    <button class="text" onclick={onlogout}>退出登录</button><button class="text muted" onclick={onlogout}
      >退出所有设备</button
    >
  </div>
</section>

<style>
  .profile {
    max-width: 500px;
    margin: 52px auto 72px;
    font-size: 14px;
  }
  h1 {
    font-size: 28px;
    font-weight: 550;
    margin: 0 0 12px;
  }
  .intro {
    color: #7b8477;
    margin-bottom: 34px;
  }
  .avatar-row {
    display: flex;
    align-items: center;
    gap: 22px;
    margin: 32px 0;
  }
  .avatar-row p {
    font-size: 12px;
    color: #8a9486;
    margin: 8px 0 0;
  }
  button,
  input {
    font: inherit;
  }
  button {
    cursor: pointer;
    border-radius: 5px;
  }
  .secondary {
    border: 1px solid #dce2d6;
    padding: 9px 14px;
    background: white;
    color: #41664e;
  }
  label {
    display: block;
    font-size: 13px;
    margin: 22px 0;
  }
  input {
    box-sizing: border-box;
    display: block;
    width: 100%;
    margin-top: 8px;
    padding: 12px;
    border: 1px solid #dce2d6;
    border-radius: 5px;
    background: white;
    color: inherit;
  }
  .email-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 26px 0;
    gap: 16px;
  }
  .email-row span {
    font-size: 13px;
  }
  .email-row p {
    margin: 8px 0 0;
    color: #7b8477;
    overflow-wrap: anywhere;
  }
  .text {
    border: 0;
    background: none;
    color: #41664e;
    padding: 8px 0;
    font-size: 13px;
  }
  .primary {
    border: 0;
    background: #41664e;
    color: white;
    padding: 11px 20px;
  }
  .email-change {
    padding-top: 28px;
    margin-top: 32px;
    border-top: 1px solid #e4e7e0;
  }
  h2 {
    font-size: 17px;
    font-weight: 550;
  }
  .email-change p,
  .status {
    font-size: 13px;
    color: #748070;
    line-height: 1.8;
  }
  .logout {
    border-top: 1px solid #e4e7e0;
    margin-top: 40px;
    padding-top: 18px;
    display: flex;
    justify-content: space-between;
  }
  .muted {
    color: #8a9486;
  }
  @media (max-width: 600px) {
    .profile {
      margin-top: 30px;
    }
  }
</style>
