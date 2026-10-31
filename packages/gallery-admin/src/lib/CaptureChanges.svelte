<script lang="ts">
  import type {captureChange} from '@gallery/core';
  let {changes}: {changes: (ReturnType<typeof captureChange>&{assetId:string;filename:string;manualVisits:number})[]}=$props();
  const clock=(v:string|null)=>v?v.replace('T',' ').replace(/(?:\.\d+)?Z$/,''):'时间未知';
  const hours=(seconds:number)=>Number((Math.abs(seconds)/3600).toFixed(4));
</script>
{#each changes as p(p.assetId)}
  <section class="change">
    <h3>{p.filename}</h3>
    <div class="comparison">
      <div><small>当前 · {p.beforeCaption}</small><time>{clock(p.before)}</time></div>
      <div><small>确认后 · {p.afterCaption}</small><time class="result">{clock(p.after)}</time></div>
    </div>
    {#if p.destinationPending}<p>拍摄时刻已确定；地点时区待确认，暂按相机时区显示，自动行程不使用该日期。</p>{/if}
    {#if p.secondsChanged}<p>用于排序的拍摄时刻{p.secondsChanged<0?'提前':'推后'} {hours(p.secondsChanged)} 小时。{p.destinationPending?'这不代表已换算为当地时间。':''}</p>{:else}<p>用于排序的拍摄时刻保持不变。</p>{/if}
    {#if p.dateChanged}<p>显示日期发生变化，月份筛选随之更新。{!p.destinationPending?'自动行程使用确认后的当地日期。':''}</p>{/if}
    {#if p.manualVisits}<p>关联 {p.manualVisits} 段人工到访记录，已填写的行程日期保持不变。</p>{/if}
    <details><summary>查看用于排序的 UTC 时刻</summary><p>当前：{clock(p.beforeInstant)} UTC<br />确认后：{clock(p.afterInstant)} UTC</p></details>
  </section>
{/each}
<style>
  .change{padding:22px 0;border-bottom:1px solid #e0e5dc}h3{margin:0 0 14px;font-size:15px;overflow-wrap:anywhere}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:16px}small{display:block;color:#7b8676;font-size:12px;line-height:1.6;margin-bottom:6px}time{font-size:15px;font-variant-numeric:tabular-nums}.result{font-weight:600;color:#36593e}p{font-size:13px;line-height:1.7;color:#737f6c;margin:10px 0 0}details{font-size:12px;color:#737f6c;margin-top:12px}summary{cursor:pointer}@media(max-width:560px){.comparison{grid-template-columns:1fr;gap:12px}}
</style>
