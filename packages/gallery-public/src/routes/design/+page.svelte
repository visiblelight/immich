<script lang="ts">
  import { tick } from 'svelte';
  import { scenes, type Scene } from '$lib/design/content';
  let direction = $state<'a' | 'b'>('a');
  let scene = $state<Scene>('home');
  let device = $state('responsive');
  let showNotes = $state(false);
  let notesDialog: HTMLDialogElement;
  async function openNotes() {
    showNotes = true;
    await tick();
    notesDialog.showModal();
  }
  const source = $derived(`/design/${direction}?scene=${scene}&embed=1`);
</script>

<svelte:head><title>Gallery · 两种观看方式</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<div class="workbench">
  <header class="review-header">
    <a href="/design" class="review-brand">Gallery<span>设计研究 / 01</span></a><span class="review-status"
      ><i></i>阶段 C · 方向待确认</span
    ><button class="notes-toggle" onclick={openNotes} aria-haspopup="dialog" aria-expanded={showNotes}
      >{showNotes ? '收起说明' : '方案说明与素材'}</button
    >
  </header>
  <div class="direction-controls" aria-label="设计方向">
    <button class:chosen={direction === 'a'} aria-pressed={direction === 'a'} onclick={() => (direction = 'a')}
      ><span class="option-letter">A</span><span><strong>摄影画册</strong><small>纸色 · 宋体 · 错落留白</small></span
      ><span class="chosen-marker">{direction === 'a' ? '正在预览' : '查看方案'} ↗</span></button
    ><button class:chosen={direction === 'b'} aria-pressed={direction === 'b'} onclick={() => (direction = 'b')}
      ><span class="option-letter">B</span><span><strong>当代摄影展</strong><small>黑白 · 大字 · 作品网格</small></span
      ><span class="chosen-marker">{direction === 'b' ? '正在预览' : '查看方案'} ↗</span></button
    >
  </div>
  <div class="view-controls">
    <nav aria-label="内容样例">
      {#each scenes as item}<button
          class:active={scene === item.id}
          aria-pressed={scene === item.id}
          onclick={() => (scene = item.id)}>{item.label}</button
        >{/each}
    </nav>
    <div class="device-controls">
      <label for="device">画面宽度</label><select id="device" bind:value={device}
        ><option value="responsive">自适应</option><option value="390">手机 · 390</option><option value="320"
          >小屏 · 320</option
        ><option value="768">平板 · 768</option></select
      ><a
        href={`/design/${direction}?scene=${scene}`}
        target="_blank"
        rel="noreferrer"
        aria-label="在新窗口打开当前方案">独立打开 ↗</a
      >
    </div>
  </div>
  <div class="preview-stage" class:mobile={device === '390' || device === '320'}>
    <div class="frame" style:width={device === 'responsive' ? '100%' : `${device}px`}>
      <iframe src={source} title={`方案 ${direction.toUpperCase()} · ${scenes.find((s) => s.id === scene)?.label}`}
      ></iframe>
    </div>
  </div>
  <footer class="review-bottom">
    <span>两组使用同一套示例内容。可点击相册、阅读游记与打开照片。</span><span
      >确认方向后，再完善地图、看图器与后台。</span
    >
  </footer>
</div>
<dialog
  bind:this={notesDialog!}
  class="notes-panel"
  id="sources"
  aria-label="方案说明与素材"
  onclose={() => (showNotes = false)}
>
  <div class="notes-head">
    <span>设计取舍 / 素材说明</span><button onclick={() => notesDialog.close()} aria-label="关闭说明">×</button>
  </div>
  <h1>两种观看方式，<br />同一个摄影平台。</h1>
  <div class="comparison">
    <article>
      <span>A / 摄影画册</span>
      <h2>照片与文字，一起慢下来。</h2>
      <p>暖白纸色、中文宋体、非对称留白。首页像画册的开篇，相册游记沿着窄正文栏展开，照片在段落之间获得更大的空间。</p>
      <p><b>适合：</b>游记与摄影同样重要，愿意让读者停留和阅读。</p>
    </article>
    <article>
      <span>B / 当代摄影展</span>
      <h2>先被作品吸引，再走进故事。</h2>
      <p>近白展墙、黑色展签、朱红指示。字号对比更强，作品以清晰网格陈列；城市游记保留大画幅与清楚的章节结构。</p>
      <p><b>适合：</b>强调摄影作品和系列之间的关系，第一眼更直接。</p>
    </article>
  </div>
  <h2 class="notes-section">这次可以比较什么</h2>
  <ul>
    <li>首页：主视觉、品牌气质、精选相册。</li>
    <li>国家相册：纯父相册，游记与子相册入口。</li>
    <li>城市游记：长段落、双图、三级相册、直接照片。</li>
    <li>照片集：36 个示例图位、两种布局、逐组加载。</li>
    <li>边界状态：空相册、无位置、失效图片与 404。</li>
  </ul>
  <p class="note-small">
    临时站名和文案只用于比较设计。示例照片并非你的作品；照片集重复素材用于观察布局。原型不连接 Immich 或 Gallery
    数据库，不代表已发布内容。
  </p>
  <h2 class="notes-section">示例影像与来源</h2>
  <p>
    图片作者及许可清单见 <a href="/design/credits" target="_blank">素材署名页 ↗</a>。展示封面使用 CSS
    裁切，正文与看图器保持完整比例。
  </p>
  <h2 class="notes-section">确认方式</h2>
  <p>
    在对话里告诉我更接近你期望的方向，也可以指定组合，例如保留 A 的游记排版，采用 B
    的首页作品陈列。这里切换的是设计稿，正式 MVP 不提供主题切换。
  </p>
</dialog>

<style>
  :global(body) {
    margin: 0;
  }
  :global(*) {
    box-sizing: border-box;
  }
  :global(html:has(dialog[open])) {
    overflow: hidden;
  }
  .workbench {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: #e9ebe7;
    color: #252c27;
    font:
      14px/1.5 'Helvetica Neue',
      'PingFang SC',
      sans-serif;
  }
  .workbench a {
    color: inherit;
    text-decoration: none;
  }
  .workbench button,
  .workbench select {
    font: inherit;
    color: inherit;
  }
  .workbench button {
    cursor: pointer;
  }
  .review-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 25px;
    background: #fff;
    padding: 17px 30px;
    border-bottom: 1px solid #dcdfd8;
  }
  .review-brand {
    font-size: 24px;
    letter-spacing: -1px;
    font-weight: 550;
    display: flex;
    gap: 22px;
    align-items: center;
  }
  .review-brand span {
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.07em;
  }
  .review-status {
    font-size: 12px;
    color: #64715f;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }
  .review-status i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #7e8a65;
  }
  .notes-toggle {
    background: transparent;
    border: 0;
    border-left: 1px solid #d7ddd2;
    padding: 5px 0 5px 25px;
    font-size: 12px !important;
  }
  .direction-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    padding: 17px 30px;
    background: #f9faf7;
  }
  .direction-controls button {
    display: flex;
    gap: 19px;
    align-items: center;
    text-align: left;
    background: #fff;
    border: 1px solid #d6dbd0;
    padding: 15px 19px;
    min-width: 0;
  }
  .direction-controls button.chosen {
    border-color: #343e2f;
    box-shadow: inset 3px 0 #343e2f;
  }
  .option-letter {
    font:
      30px/1 Georgia,
      serif;
    align-self: center;
  }
  .direction-controls strong {
    display: block;
    font-size: 16px;
    font-weight: 500;
  }
  .direction-controls small {
    font-size: 11px;
    color: #64705c;
    display: block;
    margin-top: 4px;
    letter-spacing: 0.04em;
  }
  .chosen-marker {
    margin-left: auto;
    font-size: 11px;
    color: #6e7668;
    white-space: nowrap;
  }
  .view-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 0 30px;
    background: #fff;
    border-bottom: 1px solid #d4d9d0;
    height: 51px;
    flex-shrink: 0;
  }
  .view-controls nav {
    display: flex;
    align-items: center;
    gap: 24px;
    height: 100%;
  }
  .view-controls nav button {
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    font-size: 12px;
    padding: 14px 0;
    white-space: nowrap;
  }
  .view-controls nav button.active {
    border-color: #3f4b36;
    font-weight: 600;
  }
  .device-controls {
    display: flex;
    gap: 13px;
    align-items: center;
    font-size: 11px;
  }
  .device-controls label {
    color: #64705c;
  }
  .device-controls select {
    background: #f7f8f4;
    padding: 5px 7px;
    border: 1px solid #d3d9cd;
    border-radius: 3px;
    font-size: 11px;
  }
  .device-controls a {
    border-left: 1px solid #e0e3db;
    padding-left: 15px;
  }
  .preview-stage {
    flex: 1;
    min-height: 0;
    display: flex;
    justify-content: safe center;
    padding: 21px 30px 17px;
    overflow: auto;
    align-items: stretch;
    background-image: radial-gradient(#cbd1c6 0.7px, transparent 0.7px);
    background-size: 10px 10px;
  }
  .frame {
    width: 100%;
    flex-shrink: 0;
    box-sizing: content-box;
    background: #fff;
    box-shadow: 0 6px 30px #2731220e;
    border: 1px solid #d2d7cb;
    min-width: 0;
    transition: max-width 0.25s;
  }
  .frame iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
  }
  .preview-stage.mobile .frame {
    border: 7px solid #323a31;
    border-radius: 25px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .review-bottom {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    padding: 7px 30px 10px;
    font-size: 11px;
    color: #697460;
  }
  .notes-panel {
    position: fixed;
    inset: 0 0 0 auto;
    margin: 0;
    border: 0;
    height: 100dvh;
    max-height: none;
    max-width: none;
    width: min(600px, 100vw);
    padding: 30px 36px;
    background: #f8f8f3;
    box-shadow: -30px 0 100px #101a1736;
    overflow-y: auto;
    z-index: 50;
    color: #293026;
    font:
      15px/1.9 'PingFang SC',
      sans-serif;
  }
  .notes-panel::backdrop {
    background: #101a1736;
  }
  .notes-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    border-bottom: 1px solid #cdd3c8;
    padding-bottom: 17px;
  }
  .notes-head button {
    font: 32px/1 sans-serif;
    background: transparent;
    border: 0;
    cursor: pointer;
    color: inherit;
  }
  .notes-panel h1 {
    font:
      400 33px/1.6 'Songti SC',
      serif;
    margin: 28px 0;
  }
  .comparison article {
    padding: 26px 0;
    border-top: 1px solid #d6dccd;
  }
  .comparison article > span {
    font-size: 12px;
    color: #6d775e;
  }
  .notes-panel h2 {
    font-size: 20px;
    line-height: 1.6;
    font-weight: 500;
  }
  .notes-panel p {
    font-size: 14px;
    color: #606955;
    line-height: 2;
  }
  .notes-panel b {
    font-weight: 500;
    color: #293026;
  }
  .notes-section {
    padding-top: 27px;
    border-top: 1px solid #d6dccd;
    margin-top: 25px;
  }
  .notes-panel li {
    font-size: 14px;
    margin-bottom: 7px;
    color: #58624d;
  }
  .notes-panel ul {
    padding-left: 20px;
  }
  .notes-panel .note-small {
    font-size: 12px;
    color: #64705c;
  }
  .notes-panel a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  button:focus-visible,
  a:focus-visible,
  select:focus-visible {
    outline: 2px solid #3c5830;
    outline-offset: 3px;
  }
  @media (max-width: 900px) {
    .review-header {
      padding: 13px 18px;
      gap: 15px;
    }
    .review-brand {
      font-size: 22px;
      gap: 15px;
    }
    .review-status {
      display: none;
    }
    .direction-controls {
      padding: 12px 18px;
      gap: 12px;
    }
    .direction-controls button {
      padding: 12px 13px;
      gap: 13px;
    }
    .chosen-marker {
      display: none;
    }
    .view-controls {
      padding: 0 18px;
      gap: 12px;
      flex-wrap: wrap;
      height: auto;
      min-height: 51px;
    }
    .view-controls nav {
      gap: 20px;
    }
    .device-controls {
      padding: 10px 0;
    }
    .device-controls label {
      display: none;
    }
    .preview-stage {
      padding: 16px;
    }
    .review-bottom {
      padding: 7px 18px 10px;
    }
    .review-bottom > span:last-child {
      display: none;
    }
  }
  @media (max-width: 520px) {
    .review-brand span {
      display: none;
    }
    .notes-toggle {
      border: 0;
      padding: 4px 0;
      font-size: 11px !important;
    }
    .direction-controls {
      padding: 10px 12px;
      gap: 10px;
    }
    .direction-controls button {
      padding: 11px 10px;
      gap: 11px;
    }
    .option-letter {
      font-size: 26px;
    }
    .direction-controls strong {
      font-size: 14px;
    }
    .direction-controls small {
      font-size: 9px;
      letter-spacing: 0;
    }
    .view-controls {
      padding: 0 14px;
      gap: 0;
    }
    .view-controls nav {
      width: 100%;
      justify-content: space-between;
      gap: 0;
    }
    .view-controls nav button {
      font-size: 11px;
      padding: 12px 0;
    }
    .device-controls {
      width: 100%;
      justify-content: space-between;
      border-top: 1px solid #edf0e7;
      padding: 8px 0;
    }
    .device-controls a {
      border: 0;
    }
    .preview-stage {
      padding: 10px 6px;
    }
    .preview-stage.mobile .frame {
      border-width: 3px;
      border-radius: 14px;
    }
    .review-bottom {
      font-size: 9px;
      padding: 6px 12px;
    }
    .notes-panel {
      padding: 20px 25px;
    }
    .notes-panel h1 {
      font-size: 29px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .frame {
      transition: none;
    }
  }
</style>
