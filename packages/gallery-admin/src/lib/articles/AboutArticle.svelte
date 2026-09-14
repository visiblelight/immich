<script lang="ts">
  import { onMount } from 'svelte';
  import { articleRequest } from './api';
  let options = $state<{ id: string; title: string }[]>([]);
  let selected = $state('');
  let version = '';
  let ready = $state(false);
  let saving = $state(false);
  let message = $state('');
  async function reload() {
    try {
      const data = await articleRequest('article-about');
      options = data.articles;
      selected = data.id;
      version = data.version;
      ready = true;
      message = '';
    } catch (e) {
      message = (e as Error).message;
    }
  }
  onMount(() => {
    void reload();
  });
  async function save() {
    saving = true;
    try {
      const data = await articleRequest('article-about', { id: selected, version });
      version = data.version;
      message = '关于页面已更新。';
    } catch (e) {
      message = (e as Error).message;
    } finally {
      saving = false;
    }
  }
</script>

<section class="about-article">
  <h2>关于页面</h2>
  <p>选择一篇已发布文章作为关于页。正文更新需要在文章中发布。</p>
  <label
    >展示文章<select bind:value={selected} disabled={!ready || saving}
      ><option value="">使用原有关于内容</option>{#each options as article}<option value={article.id}
          >{article.title}</option
        >{/each}</select
    ></label
  >
  <div>
    <button onclick={save} disabled={!ready || saving}>{saving ? '正在保存…' : '应用关于页选篇'}</button
    ><button onclick={reload} disabled={saving}>重新载入选篇</button><a href="/articles">管理文章 ↗</a>
  </div>
  {#if message}<p role="status">{message}</p>{/if}
</section>

<style>
  .about-article {
    margin: 30px 0;
    padding: 26px 0;
    border-top: 1px solid #e0e5dc;
    border-bottom: 1px solid #e0e5dc;
  }
  .about-article h2 {
    font-size: 17px;
  }
  .about-article p {
    font-size: 13px;
    color: #7c8776;
    line-height: 1.8;
  }
  .about-article label {
    display: grid;
    gap: 10px;
    max-width: 560px;
  }
  .about-article select {
    appearance: none;
    background: #fff
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23727e70' stroke-width='1.5'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E")
      no-repeat right 12px center;
    padding: 10px 36px 10px 12px;
  }
  .about-article div {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin-top: 18px;
  }
</style>
