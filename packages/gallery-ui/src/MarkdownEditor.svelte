<script lang="ts">
  import { tick } from 'svelte';
  import Markdown from './Markdown.svelte';
  let {
    value = $bindable(''),
    label = '正文',
    maxLength = 250000,
    filename = 'story.md',
  }: { value?: string; label?: string; maxLength?: number; filename?: string } = $props();
  let mode = $state('edit'),
    full = $state(false),
    notice = $state('');
  let textarea = $state<HTMLTextAreaElement>();
  async function insert(before: string, after = '', placeholder = '文字') {
    const start = textarea?.selectionStart ?? value.length,
      end = textarea?.selectionEnd ?? start;
    value = value.slice(0, start) + before + (value.slice(start, end) || placeholder) + after + value.slice(end);
    mode = 'edit';
    await tick();
    textarea?.focus();
    textarea?.setSelectionRange(start + before.length, start + before.length + (end - start || placeholder.length));
  }
  async function importFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > maxLength * 4) throw Error('文件过大。');
      const text = await file.text();
      if (text.length > maxLength) throw Error('正文超过长度限制。');
      if (value && !confirm('导入会替换当前编辑内容，是否继续？')) return;
      value = text;
      notice = '已导入，请保存草稿。';
    } catch (e) {
      notice = e instanceof Error ? e.message : '导入失败。';
    } finally {
      input.value = '';
    }
  }
  function exportFile() {
    const url = URL.createObjectURL(new Blob([value], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
</script>

<section class="editor" class:full aria-label={`${label} Markdown 编辑器`}>
  <div class="editor-head">
    <strong>{label}</strong><button type="button" onclick={() => (full = !full)}
      >{full ? '退出全屏' : '全屏写作'}</button
    >
  </div>
  <div class="toolbar" aria-label="文字格式">
    <button type="button" onclick={() => insert('## ')}>标题</button><button
      type="button"
      onclick={() => insert('**', '**')}>粗体</button
    ><button type="button" onclick={() => insert('> ')}>引用</button><button type="button" onclick={() => insert('- ')}
      >列表</button
    ><button type="button" onclick={() => insert('[', '](https://example.com)')}>链接</button><button
      type="button"
      onclick={() => insert('\n\n---\n\n', '', '')}>分隔线</button
    >
    <button type="button" aria-pressed={mode === 'edit'} onclick={() => (mode = 'edit')}>编辑</button><button
      type="button"
      aria-pressed={mode === 'preview'}
      onclick={() => (mode = 'preview')}>预览</button
    >
  </div>
  {#if mode === 'edit'}<textarea
      bind:this={textarea}
      aria-label={label}
      bind:value
      maxlength={maxLength}
      rows={12}
      spellcheck="false"></textarea>{:else}<div class="preview">
      <Markdown text={value} />{#if !value}<p>正文预览会显示在这里。</p>{/if}
    </div>{/if}
  <div class="editor-foot">
    <span>Markdown · 仅文字，不嵌入图片或 HTML</span><label class="import"
      >导入 .md<input type="file" accept=".md,.markdown,text/markdown,text/plain" onchange={importFile} /></label
    ><button type="button" onclick={exportFile}>导出 .md</button>
  </div>
  {#if notice}<p role="status">{notice}</p>{/if}
</section>

<style>
  .editor {
    border: 1px solid #dce1d7;
    border-radius: 8px;
    background: #fff;
    color: #344332;
    min-width: 0;
  }
  .editor-head,
  .toolbar,
  .editor-foot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    flex-wrap: wrap;
  }
  .editor-head {
    justify-content: space-between;
  }
  .toolbar {
    border-block: 1px solid #e7ebe2;
    background: #f8faf6;
  }
  button,
  .import {
    font: inherit;
    font-size: 12px;
    padding: 6px 9px;
    background: transparent;
    border: 1px solid #dce1d7;
    border-radius: 4px;
    cursor: pointer;
    color: inherit;
  }
  button[aria-pressed='true'] {
    background: #e5ecdf;
  }
  textarea {
    display: block;
    box-sizing: border-box;
    width: 100%;
    border: 0 !important;
    resize: vertical;
    padding: 18px !important;
    line-height: 1.8;
    font:
      14px/1.8 ui-monospace,
      monospace;
    min-height: 220px;
  }
  .preview {
    padding: 18px;
    min-height: 220px;
  }
  .editor-foot {
    font-size: 11px;
    color: #73806b;
  }
  .editor-foot span {
    flex: 1;
  }
  .import input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  .import:focus-within {
    outline: 2px solid #6b865c;
  }
  .full {
    position: fixed;
    inset: 12px;
    z-index: 1000;
    overflow: auto;
    box-shadow: 0 0 0 100vmax #162112aa;
  }
  .full textarea,
  .full .preview {
    min-height: 65dvh;
    max-width: 900px;
    margin: auto;
  }
  .editor p[role='status'] {
    padding: 0 12px;
    font-size: 12px;
  }
</style>
