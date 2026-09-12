<script lang="ts">
  import Frame from '$lib/visited/Frame.svelte';
  import World from '$lib/visited/World.svelte';
</script>

<svelte:head><title>完整世界轮廓 · 设计样稿</title></svelte:head><Frame name="Gallery"
  ><p>完整地图样稿，以下点亮及统计为示例；真实足迹请进入 <a href="/visited">去过</a>。</p>
  <World
    countries={[
      {
        id: 'GE',
        name: '格鲁吉亚',
        count: 82,
        visits: [{ id: 'sample', start: '2025-10-01', end: '2025-10-12', count: 82, manual: false, label: '' }],
      },
      {
        id: 'CN',
        name: '中国',
        count: 150,
        visits: [{ id: 'sample', start: '2025-03-01', end: '2025-04-01', count: 150, manual: false, label: '' }],
      },
    ]}
    total={232}
  /></Frame
>
