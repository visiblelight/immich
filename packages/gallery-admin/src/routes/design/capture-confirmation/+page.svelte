<script lang="ts">
  import {reuseCameraZone} from '../../../../../gallery-core/src/capture-reuse.ts';
  import type {CaptureEvidence} from '../../../../../gallery-core/src/capture-evidence.ts';
  const original:CaptureEvidence={clock:'2017-01-23T18:21:37.000Z',explicitOffset:null,dateSource:'original:DateTimeOriginal',destinationZone:null,gpsUtc:null,gpsStatus:null,gpsPositionValid:false,gpsPositionMatches:false};
  let scenario=$state<'before'|'gps'|'time'>('before');
  const result=$derived(scenario==='before'?null:reuseCameraZone(original,{...original,destinationZone:'Asia/Amman',clock:scenario==='time'?'2017-01-23T19:21:37.000Z':original.clock},'UTC+08:00'));
  const clock=(value:string)=>value.replace('T',' ').replace('.000Z','');
</script>
<svelte:head><title>相机时区确认复用 · 本地演示</title></svelte:head>
<main>
  <a href="/capture-times">← 拍摄时间管理</a>
  <h1>相机时区确认复用</h1>
  <p>以下为交互示例，复用实际判断函数，不保存到图库。已人工确认相机使用北京时间 UTC+08:00。</p>
  <nav aria-label="模拟变化">
    <button class:active={scenario==='before'} onclick={()=>scenario='before'}>补 GPS 前</button>
    <button class:active={scenario==='gps'} onclick={()=>scenario='gps'}>模拟补充 GPS</button>
    <button class:active={scenario==='time'} onclick={()=>scenario='time'}>模拟修改拍摄时间</button>
  </nav>
  <section aria-live="polite">
    <h2>{scenario==='before'?'已确认相机时区':result?'已复用相机时区确认':'需要重新核对'}</h2>
    <dl>
      <dt>相机原始时间</dt><dd>2017-01-23 {scenario==='time'?'19':'18'}:21:37</dd>
      <dt>拍摄地点</dt><dd>{scenario==='before'?'未知':'约旦 · Asia/Amman'}</dd>
      <dt>Gallery 展示</dt><dd>{result?clock(result.localTakenAt):scenario==='before'?'2017-01-23 18:21:37 · 拍摄地时区未知':'2017-01-23 19:21:37 · 时区未确认'}</dd>
    </dl>
    <p>{scenario==='before'?'没有地点时保留相机时间，不增加待核对。':result?'原始拍摄时间未变，沿用你确认的 UTC+08:00，按约旦当天的时区换算，无需再次确认。':'原始拍摄时间变化，旧确认已失效；不会自动套用之前的确认。'}</p>
  </section>
  <p>真实管理页会先显示“正在更新拍摄时间”，读取完成后自动显示结果。Immich 原片和元数据保持不变。</p>
</main>
<style>
  :global(body){margin:0;background:#fafbf8;color:#303930;font-family:system-ui,sans-serif}main{max-width:850px;margin:48px auto;padding:0 24px}a{color:#5b7254;text-decoration:none;font-size:14px}h1{font-size:30px}h2{font-size:20px}p{color:#737f6c;font-size:14px;line-height:1.9}nav{display:flex;gap:4px;flex-wrap:wrap;margin:28px 0;background:#eff2eb;width:fit-content;border-radius:7px;padding:4px}button{background:transparent;border:0;border-radius:5px;color:#62725a;padding:12px 18px;cursor:pointer;font-size:14px}button.active{background:white;color:#31553d;box-shadow:0 1px 4px #0000000d}section{background:white;border:1px solid #dfe5db;border-radius:8px;padding:24px}dl{display:grid;grid-template-columns:140px 1fr;gap:18px;font-size:14px;line-height:1.6}dt{color:#737f6c}dd{margin:0}@media(max-width:500px){dl{grid-template-columns:1fr;gap:8px}dd{margin-bottom:12px}}
</style>
