<script lang="ts">
  import { renderMarkdown } from '../../gallery-core/src/markdown';
  let { text = '' }: { text?: string } = $props();
</script>

<div class="markdown">{@html renderMarkdown(text)}</div>

<style>
  .markdown {
    line-height: 1.9;
    overflow-wrap: anywhere;
    font-size: 15px;
  }
  .markdown :global(p) {
    margin: 0 0 1.15em;
    white-space: normal;
  }
  .markdown :global(h1),
  .markdown :global(h2),
  .markdown :global(h3),
  .markdown :global(h4) {
    font-size: 1.15em;
    line-height: 1.5;
    margin: 1.7em 0 0.7em;
    font-weight: 600;
  }
  .markdown :global(blockquote) {
    margin: 1em 0;
    padding-left: 1em;
    border-left: 2px solid #93a48b;
    opacity: 0.8;
  }
  .markdown :global(a) {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .markdown :global(ul),
  .markdown :global(ol) {
    padding-left: 1.5em;
  }
  .markdown :global(pre) {
    overflow: auto;
    padding: 1em;
    background: #82907718;
  }
  .markdown :global(table) {
    display: block;
    overflow: auto;
    border-collapse: collapse;
  }
  .markdown :global(td),
  .markdown :global(th) {
    border: 1px solid #82907755;
    padding: 0.4em 0.7em;
  }
  .markdown :global(hr) {
    border: 0;
    border-top: 1px solid #82907755;
    margin: 2em 0;
  }
</style>
