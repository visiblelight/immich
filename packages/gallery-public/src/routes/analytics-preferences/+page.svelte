<script lang="ts">
  import { onMount } from 'svelte';
  let excluded = $state(false), message = $state('');
  onMount(() => { try { excluded = !!localStorage.getItem('umami.disabled'); } catch { message = '浏览器不允许保存偏好。'; } });
  function update(value: boolean) {
    try {
      if (value) localStorage.setItem('umami.disabled', '1');
      else localStorage.removeItem('umami.disabled');
      excluded = value;
      message = '偏好已保存，下次打开前台时生效。';
    } catch { message = '浏览器不允许保存偏好。'; }
  }
</script>
<svelte:head><title>访问统计偏好</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<main><h1>访问统计偏好</h1><p>当前浏览器：{excluded ? '已排除自己的访问' : '允许匿名访问统计'}。</p>
<p>此设置只对当前浏览器和域名有效，清除网站数据后需要重新设置。浏览器启用“不跟踪”时，也不会发送统计。</p>
<button onclick={() => update(!excluded)}>{excluded ? '恢复匿名统计' : '排除这个浏览器的访问'}</button>
<p role="status">{message}</p><a href="/albums">返回相册</a></main>
<style>main{max-width:620px;margin:12vh auto;padding:24px;font-family:system-ui;line-height:1.8;color:#243329}h1{font-size:24px}button{padding:10px 16px;border:1px solid #bfc8bb;border-radius:6px;background:#eef2e9;color:inherit;cursor:pointer}a{color:inherit}</style>
