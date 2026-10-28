<script lang="ts">
  import { analyzeCapture, type CaptureEvidence } from '../../../../../gallery-core/src/capture-evidence';
  import { captureTime } from '../../../../../gallery-core/src/capture-time';
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
    { name: 'Canon EOS 5D Mark IV · 后补位置', place: '约旦 · 无有效 GPS 拍摄时间', previous: '2017/01/23 22:57:07 · Asia/Amman', evidence: {
      clock: '2017-01-23T20:57:07.000Z', explicitOffset: null, dateSource: 'original:SubSecDateTimeOriginal', destinationZone: 'Asia/Amman',
      gpsUtc: null, gpsStatus: 'Measurement Void', gpsPositionValid: false, gpsPositionMatches: false,
    } },
  ];
</script>

<svelte:head><title>拍摄时间核对 · 本地对照</title></svelte:head>
<main>
  <a href="/capture-times">← 拍摄时间管理</a>
  <h1>拍摄时间核对</h1>
  <p>使用已只读核验的照片时间字段展示新规则。本页不保存校正；实际重新读取和处理状态请进入上方「拍摄时间管理」。</p>
  {#each samples as s, i}
    {@const result = analyzeCapture(s.evidence)}
    {@const resolved = { ...result, captureStatus: result.status }}
    {@const display = captureTime(resolved)}
    <section>
      <h2>{s.name}<small>{s.place}</small></h2>
      <dl><dt>相机记录</dt><dd>{s.evidence.clock?.slice(0,19).replace('T',' ')}{s.evidence.explicitOffset !== null ? ' · UTC+08:00' : ' · 未写入拍摄时区'}</dd>
        <dt>此前展示</dt><dd>{s.previous}</dd>
        <dt>{display.label}</dt><dd class="result">{display.value}</dd>
      </dl>
      <p>{result.reason}</p>
      {#if i === 0}
        <p><strong>自动核对完成，无需再确认。</strong> 有效 GPS 时间与相机钟表相差约 8 小时，校验偏差 45.9 秒。自动显示 <strong>12:21:37</strong>，保留相机秒数。</p>
      {:else if i === 1}<p>原片的 +08:00 和拍摄地点的 UTC+04:00 分别处理，正确的当地时间保持不变。</p>
      {:else}<p>补充位置后可以重新读取并恢复操作；缺少拍摄时区与有效 GPS 时间，仍需指定相机当时使用的时区。若确认为北京时间，结果为 <strong>14:57:07</strong>。</p>{/if}
    </section>
  {/each}
</main>
<style>
  :global(body){background:#fafbf8;color:#303930;font-family:system-ui,sans-serif;margin:0}main{max-width:900px;margin:60px auto;padding:0 28px}a{color:#5b7254;font-size:14px;text-decoration:none}h1{font-size:30px;margin-top:28px}p{font-size:14px;color:#7a8674;line-height:1.9}section{margin-top:32px;padding:28px;border:1px solid #dfe5db;border-radius:8px;background:white}h2{font-size:19px;font-weight:600;margin:0 0 24px}small{display:block;font-size:13px;color:#8b9586;font-weight:400;margin-top:8px}dl{display:grid;grid-template-columns:100px 1fr;gap:18px;font-size:14px}dt{color:#819078}dd{margin:0;overflow-wrap:anywhere}.result{color:#365c40;font-weight:600}@media(max-width:560px){main{margin:28px auto;padding:0 16px}section{padding:20px}dl{grid-template-columns:1fr;gap:8px}dd{margin-bottom:12px}}
</style>
