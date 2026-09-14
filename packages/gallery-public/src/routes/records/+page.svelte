<script lang="ts">
  import { PublicHeader } from '@gallery/ui';
  import { articleImageKey, articleTime } from '@gallery/core';
  let { data } = $props();
</script>

<svelte:head
  ><title>记录 · {data.site.name}</title><meta name="description" content="旅途与日常里的文字" /></svelte:head
>
<div class="public-site records-site">
  <PublicHeader name={data.site.name} active="records" />
  <main>
    <div class="list-heading">
      <h1>记录</h1>
      <span>旅途与日常里的文字</span>
    </div>
    {#each data.articles as article}{@const cover = article.cover
        ? article.images[articleImageKey(article.cover)]
        : null}<a class="record" class:no-cover={!cover} href={'/records/' + article.slug}
        ><div>
          <div class="record-times">
            <time datetime={article.firstPublishedAt} title="北京时间 UTC+8"
              >发布于 {articleTime(article.firstPublishedAt)}</time
            >{#if article.publishedAt !== article.firstPublishedAt}<time
                datetime={article.publishedAt}
                title="北京时间 UTC+8">更新于 {articleTime(article.publishedAt)}</time
              >{/if}
          </div>
          <h2>{article.title}</h2>
          <p>{article.summary}</p>
          <span class="read">阅读全文 ↗</span>
        </div>
        {#if cover}<img src={cover.src} alt="" loading="lazy" />{/if}</a
      >{:else}<p class="empty">还没有公开的记录，之后再来看看吧。</p>{/each}
    <nav class="pages" aria-label="记录翻页">
      {#if data.page > 1}<a href={'?page=' + (data.page - 1)}>← 上一页</a
        >{/if}{#if data.page * 20 < data.total}<a href={'?page=' + (data.page + 1)}>下一页 →</a>{/if}
    </nav>
  </main>
</div>

<style>
  .record-times {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
  }
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
  .empty {
    padding: 60px 0;
  }
  .pages {
    display: flex;
    gap: 28px;
    margin-top: 30px;
    font-size: 13px;
  }
  .pages a {
    color: #61785a;
    text-decoration: none;
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
