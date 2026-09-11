<script lang="ts">
  import { imageCredits } from '$lib/design/credits';
</script>

<svelte:head
  ><title>示例影像与来源 · Gallery 视觉研究</title><meta name="robots" content="noindex,nofollow" /></svelte:head
>
<main>
  <a class="back" href="/design">← 返回设计对比</a><span class="kicker">GALLERY / VISUAL STUDY</span>
  <h1>示例影像与来源</h1>
  <p class="intro">
    以下真实摄影作品仅用于本地设计原型，不代表站点所有者的作品。两组方案使用相同素材与虚构游记；照片集重复素材用于检查长页面布局。
  </p>
  <p class="intro">
    图片保留原有比例，生成了较小的 JPEG 展示版本；封面通过 CSS 裁切。未经调色或内容修饰。版权与许可属于下列原作者。
  </p>
  <div class="credit-grid">
    {#each imageCredits as item}<article>
        <img src={`/design-assets/${item.id}-small.jpg`} alt={item.title} width="800" loading="lazy" />
        <div>
          <h2>{item.title}</h2>
          <p>摄影：{item.author}</p>
          <a href={item.page} target="_blank" rel="noreferrer">原始作品页 ↗</a><a
            href={item.licenseUrl}
            target="_blank"
            rel="noreferrer">{item.license} ↗</a
          >
        </div>
      </article>{/each}
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f6f6f0;
    color: #283025;
    font-family: 'PingFang SC', sans-serif;
  }
  main {
    max-width: 1140px;
    margin: auto;
    padding: 50px 30px 80px;
  }
  .back {
    color: inherit;
    font-size: 14px;
    text-decoration: none;
  }
  .kicker {
    display: block;
    margin-top: 45px;
    font-size: 11px;
    letter-spacing: 0.16em;
    color: #758269;
  }
  h1 {
    font:
      400 42px/1.5 'Songti SC',
      serif;
    margin: 13px 0 24px;
  }
  .intro {
    max-width: 800px;
    font-size: 15px;
    line-height: 2;
    color: #616e56;
  }
  .credit-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 35px;
    margin-top: 40px;
  }
  article {
    border-top: 1px solid #d2d9c8;
    padding-top: 20px;
    display: grid;
    grid-template-columns: 170px 1fr;
    gap: 25px;
    align-items: start;
  }
  img {
    display: block;
    width: 100%;
    height: auto;
  }
  h2 {
    font-size: 18px;
    line-height: 1.6;
    font-weight: 500;
    margin: 0 0 12px;
  }
  article p {
    font-size: 13px;
    color: #69755d;
  }
  article a {
    color: inherit;
    font-size: 12px;
    display: block;
    margin-top: 10px;
    text-underline-offset: 4px;
  }
  @media (max-width: 800px) {
    .credit-grid {
      grid-template-columns: 1fr;
    }
    main {
      padding: 30px 22px;
    }
    h1 {
      font-size: 32px;
    }
    article {
      grid-template-columns: 110px 1fr;
      gap: 20px;
    }
  }
</style>
