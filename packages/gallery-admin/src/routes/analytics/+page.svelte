<script lang="ts">
  import Frame from '$lib/MapAdminFrame.svelte';
  let { data } = $props();
</script>
<svelte:head><title>访问统计 · Gallery 管理</title></svelte:head>
<Frame active="analytics" user={data.user} publicOrigin={data.publicOrigin}>
  <section class="analytics-panel"><h1>访问统计</h1>
    <p>查看前台访问趋势、来源、热门相册与文章。统计报表使用独立的 Umami 账号登录。</p>
    {#if data.dashboard}<a class="primary" href={data.dashboard} target="_blank" rel="noreferrer">打开统计后台 ↗</a>
    {:else}<p>当前环境尚未配置统计服务。</p>{/if}
    <h2>排除自己的访问</h2><p>在你经常使用的浏览器中设置一次，日常浏览和编辑后的检查就不会混入统计。</p>
    <a href={`${data.publicOrigin}/analytics-preferences`} target="_blank" rel="noreferrer">设置当前浏览器的统计偏好 ↗</a>
    <h2>如何理解数据</h2><p>照片打开事件为 photo_view，国家地图查看事件为 country_view。访客数是估算值；拦截统计的浏览器不会计入。筛选、排序和同页翻页不会重复计入页面浏览量。</p>
    <p>此处不统计后台和草稿预览，前台不展示浏览次数。</p>
  </section>
</Frame>
<style>.analytics-panel{max-width:780px;padding:24px 0;line-height:1.8}.analytics-panel h1{font-size:27px;font-weight:550}.analytics-panel h2{font-size:17px;margin-top:32px}.analytics-panel p{color:#65705f}.analytics-panel a{color:#36593e}.analytics-panel .primary{display:inline-block;margin:12px 0;padding:10px 20px;background:#36593e;color:white;border-radius:6px;text-decoration:none}</style>
