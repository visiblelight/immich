<script lang="ts">
  import { onMount } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import type { MediaAttributionSettings } from '@gallery/core';
  let value = $state<MediaAttributionSettings | null>(null);
  let baseline = $state('');
  let busy = $state(false);
  let message = $state('');
  let failed = $state(false);
  let syncMessage = $state('');
  let dirty = $derived(value !== null && JSON.stringify(value) !== baseline);
  async function load() {
    try {
      const response = await fetch('/api/media-attribution');
      if (!response.ok) throw new Error('署名设置读取失败，请重试。');
      value = await response.json(); baseline = JSON.stringify(value); message=''; failed=false;
    } catch (error) { failed=true; message=(error as Error).message; }
  }
  async function status() {
    try {
      const response=await fetch('/api/media-attribution-status');
      if(!response.ok) throw new Error();
      syncMessage=(await response.json()).message;
    } catch { syncMessage='暂时无法读取云端同步状态。'; }
  }
  async function save() {
    busy=true; failed=false; message='';
    try {
      const response=await fetch('/api/media-attribution',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
      const result=await response.json();
      if(!response.ok) throw new Error(result.message ?? '保存失败，请稍后重试。');
      value=result; baseline=JSON.stringify(value); message='图片署名已保存，无需重新发布相册。'; await status();
    } catch(error) { failed=true; message=(error as Error).message; } finally { busy=false; }
  }
  beforeNavigate(event=>{if(dirty&&!confirm('图片署名尚未保存，确定离开？'))event.cancel();});
  onMount(()=>{
    void load(); void status(); const timer=setInterval(()=>void status(),15000);
    const unload=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',unload);
    return ()=>{clearInterval(timer);window.removeEventListener('beforeunload',unload);};
  });
</script>
<section class="panel content-panel form-panel settings-form attribution" aria-labelledby="attribution-heading">
  <h2 id="attribution-heading">图片署名</h2>
  <p class="muted">将创作者信息写入 Gallery 提供的照片文件，不添加可见水印。原片、Immich 缩略图和现有相册关联保持不变。</p>
  {#if value}
    <label class="checkbox-label"><input type="checkbox" bind:checked={value.enabled} />启用图片署名</label>
    <label>创作者<input bind:value={value.creator} maxlength="200" placeholder="https://vision.ke" /><small>可填写个人主页或公开使用的名字。</small></label>
    <label>创作者主页<input type="url" bind:value={value.homepage} maxlength="1000" placeholder="https://vision.ke" /></label>
    <label>版权说明（可选）<input bind:value={value.copyright} maxlength="500" placeholder="留空则不添加版权说明" /></label>
    <p class="muted">应用于从 Immich 选入的照片，包括相册、照片组及文章中的照片引用。单独上传的文章插图不自动署名。</p>
    <div class="actions"><button class="primary" disabled={busy || !dirty} onclick={save}>{busy?'正在保存…':'保存图片署名'}</button>{#if dirty}<button disabled={busy} onclick={load}>放弃修改</button>{/if}</div>
    <p class="muted" role="status">{syncMessage}</p>
  {:else}<button onclick={load}>重新读取署名设置</button>{/if}
  {#if message}<p role={failed?'alert':'status'} class:error={failed}>{message}</p>{/if}
</section>
<style>
  .attribution { margin-top:24px; }
  section.attribution > label.checkbox-label { display:flex; flex-direction:row; align-items:center; gap:10px; }
  section.attribution > label.checkbox-label input { width:18px; height:18px; flex:0 0 18px; margin:0; }
  .actions { display:flex;gap:12px;flex-wrap:wrap; }
  .error { color:#9b3939; }
</style>
