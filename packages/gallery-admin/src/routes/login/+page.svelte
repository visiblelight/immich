<script lang="ts">
  import '$lib/design/admin.css';
  let email = $state('');
  let password = $state('');
  let message = $state('');
  let busy = $state(false);
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    message = '';
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? '登录失败');
      window.location.assign('/albums');
    } catch (e) {
      message = e instanceof Error ? e.message : '登录暂不可用';
    } finally {
      busy = false;
      password = '';
    }
  }
</script>

<svelte:head><title>登录 · Gallery</title></svelte:head>
<main class="login">
  <div class="brand-mark">G</div>
  <p class="eyebrow">GALLERY STUDIO</p>
  <h1>回到你的相册工作台</h1>
  <p class="muted">使用独立的 Gallery 账号管理作品。</p>
  <form class="login-card" onsubmit={submit}>
    <h2>管理员登录</h2>
    <label>邮箱<input type="email" autocomplete="username" required bind:value={email} /></label><label
      >密码<input
        type="password"
        autocomplete="current-password"
        required
        maxlength="256"
        bind:value={password}
      /></label
    >{#if message}<p class="error" role="alert">{message}</p>{/if}<button class="primary" disabled={busy}
      >{busy ? '正在登录…' : '登录工作台 →'}</button
    ><small>账号由站点管理员初始化，不与 Immich 共用密码。</small>
  </form>
</main>
