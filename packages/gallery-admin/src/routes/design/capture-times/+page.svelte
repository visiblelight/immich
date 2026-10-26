<script lang="ts">
  import { analyzeCapture, type CaptureEvidence } from '../../../../../gallery-core/src/capture-evidence';
  import { captureTime } from '../../../../../gallery-core/src/capture-time';
  let confirmed = $state(false);
  // Read-only metadata observations. No asset IDs, media copies, credentials or database writes.
  const samples: { name: string; place: string; previous: string; evidence: CaptureEvidence }[] = [
    { name: 'Canon EOS 5D Mark IV', place: '约旦 · 佩特拉', previous: '2017/01/23 18:21:37 · Asia/Amman', evidence: {
      clock: '2017-01-23T18:21:37.000Z', explicitOffset: null, dateSource: 'original:SubSecDateTimeOriginal', destinationZone: 'Asia/Amman',
      gpsUtc: '2017-01-23T10:22:22.911Z', gpsStatus: 'Measurement Active', gpsPositionValid: true, gpsPositionMatches: true,
    } },
    { name: 'Sony A7CR', place: '格鲁吉亚 · 第比利斯', previous: '2026/07/27 14:19:28 · Asia/Tbilisi', evidence: {
      clock: '2026-07-27T18:19:28.822Z', explicitOffset: 480, dateSource: 'original:SubSecDateTimeOriginal', destinationZone: 'Asia/Tbilisi',
      gpsUtc: null, gpsStatus: null, gpsPositionValid: false, gpsPositionMatches: false,
    } },
  ];
</script>

<svelte:head><title>拍摄时间核对 · 本地对照</title></svelte:head>
<main>
  <a href="/capture-times">← 拍摄时间管理</a>
  <h1>拍摄时间核对</h1>
  <p>使用已只读核验的两张照片元数据。此页仅演示展示结果，不保存任何校正，也不修改生产数据。</p>
  {#each samples as s, i}
    {@const result = analyzeCapture(s.evidence)}
    {@const resolved = i === 0 && !confirmed ? { localTakenAt: s.evidence.clock, takenAt: null, timeZone: null, captureStatus: 'suggested' } : { ...result, captureStatus: i === 0 ? 'confirmed' : result.status }}
    {@const display = captureTime(resolved)}
    <section>
      <h2>{s.name}<small>{s.place}</small></h2>
      <dl><dt>相机记录</dt><dd>{s.evidence.clock?.slice(0,19).replace('T',' ')}{s.evidence.explicitOffset !== null ? ' · UTC+08:00' : ' · 未写入拍摄时区'}</dd>
        <dt>此前展示</dt><dd>{s.previous}</dd>
        <dt>{display.label}</dt><dd class="result">{display.value}</dd>
      </dl>
      <p>{result.reason}</p>
      {#if i === 0}
        <p>建议确认相机当时使用北京时间（UTC+08:00）。换算结果为 <strong>12:21:37</strong>，保留相机秒数；GPS 仅用于交叉核对。</p>
        <button onclick={() => confirmed = !confirmed}>{confirmed ? '返回待核对状态' : '查看确认后的显示'}</button>
      {:else}<p>原片的 +08:00 和拍摄地点的 UTC+04:00 分别处理，正确的当地时间保持不变。</p>{/if}
    </section>
  {/each}
</main>
<style>
  :global(body){background:#fafbf8;color:#303930;font-family:system-ui,sans-serif;margin:0}main{max-width:900px;margin:60px auto;padding:0 28px}a{color:#5b7254;font-size:14px;text-decoration:none}h1{font-size:30px;margin-top:28px}p{font-size:14px;color:#7a8674;line-height:1.9}section{margin-top:32px;padding:28px;border:1px solid #dfe5db;border-radius:8px;background:white}h2{font-size:19px;font-weight:600;margin:0 0 24px}small{display:block;font-size:13px;color:#8b9586;font-weight:400;margin-top:8px}dl{display:grid;grid-template-columns:100px 1fr;gap:18px;font-size:14px}dt{color:#819078}dd{margin:0;overflow-wrap:anywhere}.result{color:#365c40;font-weight:600}button{background:#36593e;color:white;padding:11px 20px;border:0;border-radius:6px;cursor:pointer;margin-top:8px}@media(max-width:560px){main{margin:28px auto;padding:0 16px}section{padding:20px}dl{grid-template-columns:1fr;gap:8px}dd{margin-bottom:12px}}
</style>
