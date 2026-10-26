<script lang="ts">
  import {invalidateAll} from '$app/navigation';
  import {tick} from 'svelte';
  import MapAdminFrame from '$lib/MapAdminFrame.svelte';
  import type {PageData} from './$types';
  let {data}:{data:PageData}=$props();
  let query=$state(''),filter=$state('review'),page=$state(1),selected=$state<string[]>([]),busy=$state(false),message=$state(''),failed=$state(false);
  let mode=$state<'manual'|'suggestion'|'disable'>('suggestion'),sourceZone=$state('UTC+08:00'),dialog=$state<HTMLDialogElement>();
  type Row=PageData['photos'][number];
  type Change={assetId:string;filename:string;before:string|null;after:string|null;timeZone:string|null;sourceZone:string|null;secondsChanged:number;dateChanged:boolean;manualVisits:number};
  let preview=$state<Change[]>([]),payload=$state<Record<string,unknown>|null>(null);
  const pending=(p:Row)=>['suggested','unknown','conflict','stale'].includes(p.capture_status);
  const labels:Record<string,string>={legacy:'尚未核对',verified:'时区明确',confirmed:'已确认',suggested:'待确认建议',unknown:'缺少依据',conflict:'证据冲突',stale:'来源已变化'};
  const visible=$derived(data.photos.filter(p=>(filter==='all'||(filter==='review'?pending(p):filter==='confirmed'?['verified','confirmed'].includes(p.capture_status):p.capture_status==='legacy'))&&[p.filename,p.model,p.time_zone,p.evidence?.destinationZone].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase())));
  const chosen=$derived(data.photos.filter(p=>selected.includes(p.asset_id)));
  const rows=$derived(visible.slice((page-1)*40,page*40));
  const clock=(v:string|null|undefined)=>v?v.replace('T',' ').replace(/(?:\.\d+)?Z$/,''):'时间未知';
  function changeFilter(value:string){filter=value;page=1;selected=[];}
  function toggle(p:Row,checked:boolean){selected=checked?[...selected,p.asset_id]:selected.filter(id=>id!==p.asset_id);}
  async function api(action:string,input:Record<string,unknown>){
    const response=await fetch('/api/capture-'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
    const result=await response.json();if(!response.ok)throw new Error(result.message);return result;
  }
  async function start(next:typeof mode){mode=next;preview=[];payload=null;message='';await tick();dialog!.showModal();if(next!=='manual')await check();}
  async function check(){
    busy=true;message='';failed=false;preview=[];payload=null;
    try{
      const input={mode,sourceZone,items:chosen.map(p=>({assetId:p.asset_id,version:p.version,correctionVersion:p.correction_version,sourceSignature:p.source_signature}))};
      const result=await api('preview',input);preview=result.preview;payload=input;
    }catch(e){message=(e as Error).message;failed=true;}finally{busy=false;}
  }
  async function apply(){
    if(!payload)return;busy=true;message='';failed=false;
    try{await api('apply',payload);dialog!.close();selected=[];await invalidateAll();message=mode==='disable'?'已停用所选照片的校正，恢复 Immich 原记录。':'已应用到所选照片，原片和内容关联保持不变。';}
    catch(e){message=(e as Error).message;failed=true;}finally{busy=false;}
  }
</script>

<svelte:head><title>拍摄时间 · Gallery 工作台</title></svelte:head>
<MapAdminFrame active="capture-times" user={data.user} publicOrigin={data.publicOrigin}>
  <section class="map-admin capture-manager">
    <h1>拍摄时间</h1>
    <p>核对相机记录的时间与拍摄地点时区。校正仅在 Gallery 生效，可以撤销。</p>
    <div class="tabs" aria-label="时间核对筛选">
      {#each [['review','待核对'],['confirmed','已确认'],['legacy','未采集 / 已停用'],['all','全部']] as [id,label]}
        <button class:active={filter===id} onclick={()=>changeFilter(id!)}>{label}{id==='review'?' '+data.photos.filter(pending).length:''}</button>
      {/each}
    </div>
    <div class="controls"><label>查找照片<input aria-label="查找照片" placeholder="文件名、相机或时区" bind:value={query} oninput={()=>{page=1;selected=[];}} /></label><span>{visible.length} 张照片</span></div>
    {#if message&&!dialog?.open}<div class="notice" class:failure={failed} role={failed?'alert':'status'}>{message}</div>{/if}
    {#if chosen.length}<div class="selection"><span>已选择 {chosen.length} 张</span><button disabled={busy||chosen.some(p=>p.analysis?.status!=='suggested')} onclick={()=>start('suggestion')}>核对建议</button><button disabled={busy} onclick={()=>start('manual')}>指定相机时区</button><button class="secondary" disabled={busy} onclick={()=>start('disable')}>停用校正</button></div>{/if}
    <div class="table-wrap"><table>
      <thead><tr><th><input type="checkbox" aria-label="选择本页可核对照片" checked={rows.filter(p=>p.evidence&&p.capture_status!=='stale').length>0&&rows.filter(p=>p.evidence&&p.capture_status!=='stale').every(p=>selected.includes(p.asset_id))} onchange={e=>{selected=e.currentTarget.checked?rows.filter(p=>p.evidence&&p.capture_status!=='stale').map(p=>p.asset_id):[];}} /></th><th>照片</th><th>当前展示</th><th>建议 / 依据</th></tr></thead>
      <tbody>{#each rows as p(p.asset_id)}<tr>
        <td><input type="checkbox" aria-label={'选择 '+p.filename} checked={selected.includes(p.asset_id)} disabled={!p.evidence||p.capture_status==='stale'} onchange={e=>toggle(p,e.currentTarget.checked)} /></td>
        <td><strong>{p.filename}</strong><small>{p.model??'相机未知'}</small>{#if p.album_slug&&p.photo_id}<a href={data.publicOrigin+'/albums/'+p.album_slug+'?photo='+p.photo_id} target="_blank" rel="noreferrer">查看照片 ↗</a>{/if}<small>{p.capture_status==='legacy'&&p.mode==='disabled'?'已停用':labels[p.capture_status]}</small></td>
        <td><time>{clock(p.effective_local_at)}</time><small>{p.effective_zone??(['verified','confirmed'].includes(p.capture_status)?'拍摄地点时区未知':'时区未确认')}</small><details><summary>原始记录</summary><small>Immich：{clock(p.local_taken_at)} · {p.time_zone??'未知'}</small><small>相机：{clock(p.evidence?.clock)}</small><small>GPS UTC：{clock(p.evidence?.gpsUtc)}</small></details></td>
        <td>{#if p.capture_status==='stale'}来源时间或位置已变化，请重新采集证据。{:else if p.analysis}<strong>{p.analysis.status==='suggested'?clock(p.analysis.localTakenAt):''}</strong><small>{p.analysis.status==='suggested'?p.analysis.timeZone??'地点时区未知':''}</small><p>{p.analysis.reason}</p>{#if p.analysis.gpsDifferenceSeconds!==null}<small>相机与 GPS 校验差：{p.analysis.gpsDifferenceSeconds.toFixed(1)} 秒</small>{/if}{:else}<p>等待只读采集时间元数据，当前保留 Immich 记录。</p>{/if}</td>
      </tr>{/each}</tbody>
    </table>{#if rows.length===0}<p class="empty">{filter==='review'?'目前没有已采集的待核对照片。':'没有符合条件的照片。'}</p>{/if}</div>
    {#if visible.length>40}<div class="pagination"><button disabled={page===1} onclick={()=>{page--;selected=[];}}>上一页</button><span>{page} / {Math.ceil(visible.length/40)}</span><button disabled={page*40>=visible.length} onclick={()=>{page++;selected=[];}}>下一页</button></div>{/if}
  </section>
</MapAdminFrame>
<dialog bind:this={dialog} aria-labelledby="capture-review-title" oncancel={e=>{if(busy)e.preventDefault();}}>
  <div class="review"><h2 id="capture-review-title">{mode==='disable'?'停用时间校正':'确认拍摄时间'}</h2>
    <p>{mode==='disable'?'以下照片将恢复 Immich 的原时间显示。':'先核对前后变化，再应用到明确选中的照片。相机时间的秒数保持不变。'}</p>
    {#if mode==='manual'}<label>相机当时采用的时区<input bind:value={sourceZone} oninput={()=>{preview=[];payload=null;}} placeholder="UTC+08:00 或 Asia/Shanghai" /></label><button disabled={busy} onclick={check}>预览变化</button>{/if}
    {#if message}<p role="alert" class="failure">{message}</p>{/if}
    {#if busy&&!preview.length}<p role="status">正在核对…</p>{/if}
    {#each preview as p}<div class="change"><strong>{p.filename}</strong><div>{clock(p.before)} → <b>{clock(p.after)}</b></div><small>{p.timeZone??'拍摄地点时区未知'}{p.sourceZone?' · 相机采用 '+p.sourceZone:''}</small>{#if p.dateChanged}<p>日期发生变化，月份筛选和自动行程日期会随之更新。</p>{/if}{#if p.secondsChanged}<p>拍摄时刻变化 {p.secondsChanged/3600} 小时，拍摄时间排序将使用新结果。</p>{/if}{#if p.manualVisits}<p>关联 {p.manualVisits} 段人工到访记录，已填写的行程日期保持不变。</p>{/if}</div>{/each}
    <div class="dialog-actions"><button disabled={busy} onclick={()=>dialog!.close()}>取消</button><button class="primary" disabled={busy||!payload||!preview.length} onclick={apply}>{busy?'处理中…':mode==='disable'?'确认停用':'确认应用'}</button></div>
  </div>
</dialog>
<style>
  .capture-manager{max-width:1500px}.tabs{display:flex;flex-wrap:wrap;gap:4px;background:#eff2eb;border-radius:7px;padding:4px;width:fit-content;margin:28px 0}.tabs button{background:transparent;color:#62725a}.tabs button.active{background:white;color:#31553d;box-shadow:0 1px 4px #0000000d}.controls,.selection,.pagination{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:20px 0}.controls label{display:flex;gap:12px;align-items:center}.controls input{width:300px}.controls span{color:#7a8575;font-size:13px}.selection{position:sticky;top:0;z-index:3;background:#f8faf5;padding:12px}.selection .secondary{background:white;color:#36593e;border:1px solid #d5ded1}.table-wrap{overflow-x:auto;border:1px solid #e0e5dc;border-radius:8px;background:white}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:20px 16px;border-bottom:1px solid #e4e8e1;vertical-align:top}th{background:#f5f7f2;color:#7a8575;font-weight:500}td:first-child,th:first-child{width:24px}td:nth-child(2){min-width:200px}td:nth-child(3){min-width:230px}small{display:block;color:#7b8676;font-size:12px;margin-top:7px}td a{display:block;margin-top:8px;color:#36593e}td p{margin:6px 0}time{white-space:nowrap}details{margin-top:12px}summary{cursor:pointer;color:#6c7867}.empty{padding:24px}.pagination{justify-content:center}.failure{color:#9b3c2c!important;background:#fff1eb!important;padding:12px;border-radius:6px}dialog{border:1px solid #dce3d6;border-radius:12px;padding:0;width:min(760px,calc(100vw - 32px));max-height:85dvh;color:#2d352d;background:#fafbf8}dialog::backdrop{background:#13201666}.review{padding:28px}.review p{font-size:13px;line-height:1.7;color:#737f6c}.review label{display:block;margin:16px 0}.review input{display:block;margin:8px 0;padding:10px;border:1px solid #d5ded1;border-radius:5px;width:100%;box-sizing:border-box}.review button{padding:10px 18px;border:1px solid #d5ded1;border-radius:5px;background:white;color:#31553d;cursor:pointer}.review button:disabled{opacity:.5;cursor:default}.review .primary{background:#36593e;color:white}.change{padding:18px 0;border-bottom:1px solid #e0e5dc}.change div{margin-top:10px;font-size:14px}.dialog-actions{display:flex;justify-content:flex-end;gap:12px;position:sticky;bottom:-28px;background:#fafbf8;padding:18px 0 0}.change p{margin-bottom:0}@media(max-width:600px){.controls input{width:200px}.review{padding:20px}}
</style>
