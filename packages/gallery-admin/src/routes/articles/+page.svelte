<script lang="ts">
  import { articleTime } from '@gallery/core';
  import { goto } from '$app/navigation';
  import AdminSidebar from '$lib/AdminSidebar.svelte';
  import { articleRequest } from '$lib/articles/api';
  import '$lib/design/admin.css';
  let { data } = $props();
  let busy = $state(false);
  let message = $state('');
  async function create() {
    busy = true;
    try {
      const result = await articleRequest('article-create', {});
      await goto('/articles/' + result.id);
    } catch (e) {
      message = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>文章 · Gallery</title></svelte:head>
<div class="workspace">
  <AdminSidebar active="articles" user={data.user} publicOrigin={data.publicOrigin} />
  <main>
    <header>
      <div>
        <h1>文章</h1>
        <p>正式游记，也记下日常里的想法。</p>
      </div>
      <button class="primary" onclick={create} disabled={busy}>＋ 写文章</button>
    </header>
    <form method="GET">
      <input name="q" value={data.query} aria-label="搜索文章标题" placeholder="搜索文章标题" /><select
        name="status"
        value={data.status}
        aria-label="文章状态"
        ><option value="">全部状态</option><option value="draft">草稿</option><option value="published"
          >已发布</option
        ><option value="offline">已下线</option></select
      ><button>搜索</button><span>{data.total} 篇</span>
    </form>
    {#if message}<p role="alert">{message}</p>{/if}
    <div class="article-list">
      {#each data.articles as article}<a class="article-row" href={'/articles/' + article.id}
          ><div>
            <h2>
              {article.title || '未命名文章'}{#if data.about.id === article.id}<small>关于页</small>{/if}
            </h2>
            <p>{article.summary || '尚未填写摘要'}</p>
            <div class="publication-times">
              {#if article.firstPublishedAt}<span
                  >首次发布 <time datetime={article.firstPublishedAt} title="北京时间 UTC+8"
                    >{articleTime(article.firstPublishedAt)}</time
                  ></span
                ><span
                  >最近更新 <time datetime={article.publishedAt!} title="北京时间 UTC+8"
                    >{articleTime(article.publishedAt!)}</time
                  ></span
                >{:else}<span>尚未发布</span>{/if}
            </div>
          </div>
          <span class="status"
            >{{ draft: '草稿', published: '已发布', offline: '已下线' }[article.status]}{article.status ===
              'published' && article.hasChanges
              ? ' · 有未发布修改'
              : ''}</span
          ></a
        >{:else}<p class="empty">
          {data.query ? '没有找到符合条件的文章。' : '还没有文章，从第一篇开始记录吧。'}
        </p>{/each}
    </div>
    <nav class="pagination" aria-label="文章翻页">
      {#if data.page > 1}<a
          href={'?q=' +
            encodeURIComponent(data.query) +
            '&status=' +
            encodeURIComponent(data.status) +
            '&page=' +
            (data.page - 1)}>← 上一页</a
        >{/if}{#if data.page * 30 < data.total}<a
          href={'?q=' +
            encodeURIComponent(data.query) +
            '&status=' +
            encodeURIComponent(data.status) +
            '&page=' +
            (data.page + 1)}>下一页 →</a
        >{/if}
    </nav>
  </main>
</div>

<style>
  .publication-times {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 22px;
  }
  main {
    padding: 34px 40px;
    min-width: 0;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    margin-bottom: 30px;
  }
  h1 {
    font-size: 26px;
  }
  header p {
    font-size: 13px;
    color: #87927e;
    margin: 0;
  }
  .primary {
    background: #3e654b;
    color: white;
    border-color: #3e654b;
  }
  form {
    display: flex;
    gap: 14px;
    align-items: center;
    margin-bottom: 20px;
  }
  form input {
    max-width: 340px;
  }
  form select {
    max-width: 150px;
    padding-right: 34px;
    appearance: none;
    background: white
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23727e70' stroke-width='1.5'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E")
      no-repeat right 12px center;
  }
  form {
    flex-wrap: wrap;
  }
  form input {
    flex: 1;
    min-width: 140px;
  }
  form span {
    white-space: nowrap;
    font-size: 13px;
    color: #899581;
  }
  .article-list {
    border: 1px solid #e0e6dc;
    border-radius: 8px;
    overflow: hidden;
    background: #fcfdfb;
  }
  .article-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    padding: 25px 28px;
    border-bottom: 1px solid #e4e9df;
    text-decoration: none;
    color: inherit;
  }
  .article-row:last-child {
    border: 0;
  }
  .article-row:hover {
    background: #f0f4eb;
  }
  .article-row h2 {
    font-size: 17px;
    font-weight: 550;
    margin: 0 0 10px;
  }
  .article-row p {
    font-size: 13px;
    color: #849179;
    margin: 0 0 10px;
  }
  .article-row span {
    font-size: 12px;
    color: #8a957f;
  }
  .article-row small {
    font-size: 11px;
    margin-left: 12px;
    background: #eaf0e1;
    padding: 4px 8px;
  }
  .status {
    flex-shrink: 0;
  }
  .empty {
    padding: 50px 20px;
    color: #849179;
    text-align: center;
  }
  .pagination {
    display: flex;
    gap: 25px;
    margin: 20px 0;
  }
  @media (max-width: 780px) {
    main {
      padding: 24px 16px;
    }
    .article-row {
      padding: 20px 16px;
      align-items: start;
      flex-direction: column;
      gap: 10px;
    }
    header {
      gap: 12px;
    }
    h1 {
      font-size: 23px;
    }
  }
</style>
