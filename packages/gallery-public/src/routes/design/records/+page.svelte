<script lang="ts">
  import { PublicHeader } from "@gallery/ui";
  import { sampleArticles } from "@gallery/ui/article-design";
</script>

<svelte:head><title>记录 · Gallery 设计预览</title></svelte:head>
<div class="public-site records-site">
  <PublicHeader
    name="Gallery"
    active="records"
    recordsHref="/design/records"
    aboutHref="/design/records/about"
  />
  <main>
    <div class="list-heading">
      <h1>记录</h1>
      <span>旅途与日常里的文字</span>
    </div>
    {#each sampleArticles.filter((article) => article.listed) as article}
      <a
        class="record"
        class:no-cover={!article.cover}
        href={"/design/records/" + article.id}
      >
        <div>
          <time datetime={article.date}
            >{article.date.replaceAll("-", ".")}</time
          >
          <h2>{article.title}</h2>
          <p>{article.summary}</p>
          <span class="read">阅读全文 <span aria-hidden="true">↗</span></span>
        </div>
        {#if article.cover}<img
            src={"/design-assets/" + article.cover + ".jpg"}
            alt=""
          />{/if}
      </a>
    {/each}
    <p class="sample-note">页面样例 · 内容仅用于排版预览</p>
  </main>
</div>

<style>
  .records-site {
    padding: 0 4vw;
  }
  main {
    max-width: 1010px;
    margin: 34px auto 90px;
  }
  .list-heading {
    display: flex;
    align-items: baseline;
    gap: 18px;
    padding-bottom: 14px;
    border-bottom: 1px solid #e1e6dc;
  }
  h1 {
    font-size: 21px;
    font-weight: 550;
    margin: 0;
  }
  .list-heading span {
    font-size: 13px;
    color: #8a9285;
  }
  .record {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 270px;
    align-items: center;
    gap: 55px;
    padding: 34px 0;
    border-bottom: 1px solid #e1e6dc;
    text-decoration: none;
    color: inherit;
  }
  .record:hover h2 {
    color: #477049;
  }
  .record.no-cover {
    display: block;
  }
  .no-cover > div {
    max-width: 685px;
  }
  time {
    font-size: 12px;
    color: #858d80;
  }
  h2 {
    font-size: 24px;
    font-weight: 550;
    margin: 12px 0;
    line-height: 1.5;
  }
  p {
    font-size: 14px;
    line-height: 1.9;
    color: #7c8675;
    margin: 0 0 20px;
  }
  .read {
    font-size: 12px;
    color: #566e4e;
  }
  img {
    width: 100%;
    aspect-ratio: 1.45;
    object-fit: cover;
    border-radius: 3px;
  }
  .sample-note {
    margin-top: 40px;
    font-size: 12px;
    color: #969c90;
  }
  @media (max-width: 680px) {
    .record {
      gap: 18px;
      grid-template-columns: minmax(0, 1fr) 100px;
      padding: 26px 0;
    }
    h2 {
      font-size: 20px;
    }
    img {
      aspect-ratio: 1;
      align-self: start;
      margin-top: 28px;
    }
    .record p {
      font-size: 13px;
    }
  }
</style>
