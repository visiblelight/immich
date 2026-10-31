<script lang="ts">
  import {captureChange} from '@gallery/core';
  import {correctedCapture, type CaptureEvidence} from '../../../../../gallery-core/src/capture-evidence.ts';
  import CaptureReviewFields from '$lib/CaptureReviewFields.svelte';
  import CaptureChanges from '$lib/CaptureChanges.svelte';
  const samples = [
    ['0529','22:17:29.000',false], ['0530','22:15:06.860',false],
    ['0534','22:06:11.000',false], ['0541','21:56:26.000',true],
  ] as const;
  const photos=samples.map(([id,time,active])=>({
    asset_id:id,filename:`IMG_2017_01_26_${id}.JPG`,
    destination_candidate:active?'Asia/Jerusalem':'Asia/Hebron',
    destination_candidate_source:active?'已核对的位置':'Immich 地点记录（需确认）',
    evidence:{clock:`2017-01-26T${time}Z`,explicitOffset:null,dateSource:'original:SubSecDateTimeOriginal',
      destinationZone:active?'Asia/Jerusalem':null,gpsUtc:'2017-01-26T13:54:16.534Z',
      gpsStatus:active?'Measurement Active':'Measurement Void',gpsPositionValid:true,gpsPositionMatches:true} satisfies CaptureEvidence,
  }));
  let sourceZone=$state('UTC+08:00'),destinations=$state<Record<string,string>>({'0541':'Asia/Jerusalem'}),message=$state('');
  let changes=$state<(ReturnType<typeof captureChange>&{assetId:string;filename:string;manualVisits:number})[]>([]);
  function clear(){changes=[];message='';}
  function preview(){
    clear();
    try{changes=photos.map(p=>{
      const resolved=correctedCapture(p.evidence,sourceZone.trim(),destinations[p.asset_id]?.trim()||null);
      return {assetId:p.asset_id,filename:p.filename,manualVisits:0,...captureChange(
        {takenAt:new Date(Date.parse(p.evidence.clock)-2*3600000).toISOString(),localTakenAt:p.evidence.clock,timeZone:null,captureStatus:p.asset_id==='0541'?'conflict':'unknown'},
        {...resolved,captureStatus:'confirmed'},
      )};
    });}catch(e){message=e instanceof Error?e.message:'请检查时区。';}
  }
</script>
<svelte:head><title>拍摄时间核对 · 本地对照</title></svelte:head>
<main>
  <a href="/capture-times">← 拍摄时间管理</a>
  <h1>确认拍摄时间</h1>
  <p>使用截图中四张照片已只读核验的时间字段，与实际管理页共用表单和预览组件。本页仅作交互对照，不保存到图库。</p>
  <section>
    <CaptureReviewFields {photos} bind:sourceZone bind:destinations onchange={clear} />
    <button class="preview" onclick={preview}>预览变化</button>
    {#if message}<p role="alert">{message}</p>{/if}
    <CaptureChanges {changes} />
  </section>
</main>
<style>
  :global(body){background:#fafbf8;color:#303930;font-family:system-ui,sans-serif;margin:0}main{max-width:820px;margin:48px auto;padding:0 24px}a{color:#5b7254;font-size:14px;text-decoration:none}h1{font-size:30px;margin-top:28px}p{font-size:14px;color:#7a8674;line-height:1.9}section{margin-top:24px;padding:28px;border:1px solid #dfe5db;border-radius:8px;background:white}.preview{padding:10px 18px;border:1px solid #d5ded1;border-radius:5px;background:white;color:#31553d;cursor:pointer;margin:12px 0}p[role=alert]{color:#9b3c2c}@media(max-width:560px){main{margin:28px auto;padding:0 16px}section{padding:20px}}
</style>
