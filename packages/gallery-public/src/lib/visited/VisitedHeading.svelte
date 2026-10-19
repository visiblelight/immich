<script lang="ts">
  import { SegmentedControl } from '@gallery/ui';
  let { scope = 'world', count, total, regionTotal }: {
    scope?: 'world' | 'CN'; count: number; total: number; regionTotal?: number;
  } = $props();
</script>

<header class="heading">
  <div class="heading-main">
    <h1>去过</h1>
    <div class="scope-control"><SegmentedControl label="足迹范围" value={scope} options={[
      { value: 'world', label: '世界', href: '/visited' },
      { value: 'CN', label: '中国', href: '/visited/regions/CN' },
    ]} /></div>
  </div>
  <p class="stats"><strong>{count}{#if regionTotal}<small> / {regionTotal}</small>{/if}</strong>
    {scope === 'world' ? '个国家' : '个省级地区'}<span>·</span><strong>{total.toLocaleString('zh-CN')}</strong> 张照片</p>
</header>

<style>
  .heading { display:flex; justify-content:space-between; align-items:center; gap:24px; margin:28px 0 25px; }
  .heading-main { display:flex; align-items:center; gap:32px; }
  h1 { font-size:25px; font-weight:550; line-height:1.35; margin:0; }
  .scope-control { width:156px; flex-shrink:0; }
  .stats { color:#85907f; font-size:12px; margin:0; white-space:nowrap; }
  .stats strong { color:#3f5544; font-size:14px; font-weight:500; }
  .stats small { color:#879381; font-size:12px; font-weight:400; }
  .stats span { margin:0 17px; }
  @media(max-width:700px) {
    .heading { align-items:stretch; flex-direction:column; gap:18px; margin-top:24px; }
    .heading-main { justify-content:space-between; gap:16px; }
    .stats span { margin:0 12px; }
  }
</style>
