<script lang="ts">
  type Photo = {asset_id: string; filename: string; destination_candidate: string | null; destination_candidate_source: string; evidence: {destinationZone: string | null; gpsStatus: string | null} | null};
  let {photos, sourceZone = $bindable('UTC+08:00'), destinations = $bindable<Record<string,string>>({}), disabled = false, onchange}:
    {photos: Photo[]; sourceZone?: string; destinations?: Record<string,string>; disabled?: boolean; onchange: () => void} = $props();
  function useCandidates() {
    destinations = {...destinations, ...Object.fromEntries(photos.filter(p=>p.destination_candidate).map(p=>[p.asset_id,p.destination_candidate!]))};
    onchange();
  }
</script>

<label class="source">相机当时采用的时区
  <input bind:value={sourceZone} oninput={onchange} {disabled} placeholder="UTC+08:00 或 Asia/Shanghai" />
</label>
<p>北京时间填写 UTC+08:00。用于确定实际拍摄时刻，与拍摄地点的时区分别处理。</p>
<div class="places-heading"><h3>拍摄地点时区</h3>
  {#if photos.length>1&&photos.some(p=>p.destination_candidate)}<button type="button" {disabled} onclick={useCandidates}>使用各照片的地点候选</button>{/if}
</div>
<p>确认拍摄地点后填写；暂不确定可以留空。留空时按相机时区显示，拍摄时间排序仍会更新。</p>
{#each photos as p(p.asset_id)}
  <div class="place">
    <label>{p.filename}<input aria-label={p.filename+' 的拍摄地点时区'} value={destinations[p.asset_id]??''} oninput={e=>{destinations={...destinations,[p.asset_id]:e.currentTarget.value};onchange();}} {disabled} placeholder="暂不确定，先保留相机时间" /></label>
    {#if p.destination_candidate}<div class="candidate"><span>候选：{p.destination_candidate} · {p.destination_candidate_source}</span>
      <button type="button" {disabled} onclick={()=>{destinations={...destinations,[p.asset_id]:p.destination_candidate!};onchange();}}>使用此候选</button>
    </div>{/if}
    {#if p.evidence?.gpsStatus&&!['A','Measurement Active','Active'].includes(p.evidence.gpsStatus)}<p class="hint">相机标记 GPS 定位无效，请确认候选是否符合实际拍摄地点。</p>{/if}
  </div>
{/each}
<style>
  label{display:block;font-size:14px;color:#303930}input{display:block;margin:8px 0;padding:10px 12px;border:1px solid #d5ded1;border-radius:5px;width:100%;box-sizing:border-box;background:white;color:inherit;font:inherit}input:disabled{opacity:.6}.source{margin-top:20px}p{font-size:13px;line-height:1.7;color:#737f6c;margin:8px 0 16px}.places-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:24px}h3{font-size:15px;margin:0}.place{padding:14px 0;border-top:1px solid #e0e5dc}.place label{font-weight:600}.place input{font-weight:400}.candidate{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;color:#737f6c;font-size:12px}button{background:transparent;border:0;padding:4px 0;color:#36593e;cursor:pointer;font-size:13px;text-decoration:underline;text-underline-offset:3px}button:disabled{opacity:.5;cursor:default}.hint{margin:8px 0 0;font-size:12px}
</style>
