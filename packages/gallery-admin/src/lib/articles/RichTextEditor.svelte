<script lang="ts">
  import { onMount } from 'svelte';
  import { Editor, Node, type JSONContent } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Highlight from '@tiptap/extension-highlight';
  import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
  import { TaskList, TaskItem } from '@tiptap/extension-list';
  import { normalizeArticlePaste } from './paste';
  import {
    articleLink,
    type ArticleDocument,
    type ArticleImageResolver,
    type ArticleNode,
  } from '@gallery/core';
  import '@gallery/ui/article-style.css';
  let {
    editable = true,
    document,
    resolveImage,
    onChange,
    onInsertImage,
  }: {
    editable?: boolean;
    document: ArticleDocument;
    resolveImage: ArticleImageResolver;
    onChange: (document: ArticleDocument) => void;
    onInsertImage: () => void;
  } = $props();
  let element: HTMLDivElement;
  let editorState = $state.raw<{ editor: Editor | null }>({ editor: null });
  let pasteNotice = $state('');
  let linkOpen = $state(false);
  let link = $state('');
  let linkError = $state('');
  export function insertImages(nodes: ArticleNode[]) {
    if (editorState.editor?.isActive('imagePlaceholder')) editorState.editor.commands.deleteSelection();
    editorState.editor
      ?.chain()
      .focus()
      .insertContent([...nodes, { type: 'paragraph' }])
      .run();
  }
  $effect(() => {
    if (editorState.editor && editorState.editor.isEditable !== editable)
      editorState.editor.setEditable(editable, false);
  });
  function setLink() {
    if (link && !articleLink(link)) {
      linkError = '请输入有效的 http、https 或邮件链接';
      return;
    }
    const chain = editorState.editor?.chain().focus().extendMarkRange('link');
    if (link) chain?.setLink({ href: link }).run();
    else chain?.unsetLink().run();
    linkOpen = false;
  }
  onMount(() => {
    const GalleryImage = Node.create({
      name: 'galleryImage',
      group: 'block',
      content: 'inline*',
      draggable: true,
      defining: true,
      addAttributes() {
        return {
          kind: { default: 'photo' },
          ref: { default: '' },
          album: { default: '' },
        };
      },
      // Only Gallery's own reference markup round-trips; ordinary <img> becomes a placeholder.
      parseHTML() {
        return [
          {
            tag: 'figure[data-gallery-kind][data-gallery-ref]',
            getAttrs: (el) => ({
              kind: el.getAttribute('data-gallery-kind'),
              ref: el.getAttribute('data-gallery-ref'),
              album: el.getAttribute('data-gallery-album') ?? '',
            }),
            contentElement: 'figcaption',
          },
        ];
      },
      renderHTML({ HTMLAttributes }) {
        return [
          'figure',
          {
            'data-gallery-ref': HTMLAttributes.ref,
            'data-gallery-kind': HTMLAttributes.kind,
            'data-gallery-album': HTMLAttributes.album,
          },
          ['figcaption', 0],
        ];
      },
      addNodeView() {
        return ({ node }) => {
          const dom = window.document.createElement('figure');
          const img = window.document.createElement('img');
          const caption = window.document.createElement('figcaption');
          img.contentEditable = 'false';
          img.draggable = true;
          img.dataset.dragHandle = '';
          caption.dataset.placeholder = '写一点图片说明…';
          function update(next: typeof node) {
            const resolved = resolveImage(next.toJSON() as ArticleNode);
            if (resolved) {
              img.src = resolved.src;
              img.alt = resolved.alt;
            } else {
              img.removeAttribute('src');
              img.alt = '图片暂不可用';
            }
          }
          update(node);
          dom.append(img, caption);
          return {
            dom,
            contentDOM: caption,
            update(next) {
              if (next.type !== node.type) return false;
              update(next);
              return true;
            },
          };
        };
      },
    });
    const ImagePlaceholder = Node.create({
      name: 'imagePlaceholder',
      group: 'block',
      atom: true,
      selectable: true,
      addAttributes() {
        return { alt: { default: '原文配图' } };
      },
      parseHTML() {
        return [
          {
            tag: 'div[data-article-image-placeholder]',
            getAttrs: (el) => ({ alt: el.getAttribute('data-alt') ?? '原文配图' }),
          },
        ];
      },
      renderHTML({ node }) {
        return [
          'div',
          {
            'data-article-image-placeholder': '',
            'data-alt': node.attrs.alt,
            class: 'article-image-unavailable',
          },
          '图片待补充：' + node.attrs.alt + '（点选后用“图片”替换）',
        ];
      },
    });
    const editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3, 4] },
          link: {
            openOnClick: false,
            autolink: false,
            isAllowedUri: (url) => !!articleLink(url),
          },
        }),
        Highlight.configure({ multicolor: false }),
        Table.configure({ resizable: true, cellMinWidth: 40 }),
        TableRow,
        TableHeader,
        TableCell,
        TaskList,
        TaskItem.configure({ nested: true }),
        GalleryImage,
        ImagePlaceholder,
      ],
      content: document.doc as JSONContent,
      editorProps: {
        transformPastedHTML(html) {
          const result = normalizeArticlePaste(html);
          pasteNotice = result.message;
          return result.html;
        },
        handlePaste(_view, event) {
          if (event.clipboardData?.files.length) {
            pasteNotice = '剪贴板图片请通过“图片 → 上传素材”添加，以便保存和管理。';
            event.preventDefault();
            return true;
          }
          return false;
        },
        attributes: {
          class: 'article-prose',
          'aria-label': '文章正文',
          role: 'textbox',
          'aria-multiline': 'true',
        },
      },
      onTransaction: ({ editor }) => {
        editorState = { editor };
      },
      onUpdate: ({ editor }) => {
        onChange({ schemaVersion: 1, doc: editor.getJSON() as ArticleNode });
      },
    });
    editorState = { editor };
    return () => editor.destroy();
  });
</script>

<div class="rich-editor">
  <div class="toolbar" aria-label="文字格式">
    {#if editorState.editor}
      <button
        title="正文"
        class:chosen={editorState.editor.isActive('paragraph')}
        onclick={() => editorState.editor?.chain().focus().setParagraph().run()}>正文</button
      >
      <button
        title="二级标题"
        class:chosen={editorState.editor.isActive('heading', { level: 2 })}
        onclick={() => editorState.editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button
      >
      <button
        title="三级标题"
        class:chosen={editorState.editor.isActive('heading', { level: 3 })}
        onclick={() => editorState.editor?.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button
      >
      <button
        title="四级标题"
        class:chosen={editorState.editor.isActive('heading', { level: 4 })}
        onclick={() => editorState.editor?.chain().focus().toggleHeading({ level: 4 }).run()}>H4</button
      >
      <span class="divider"></span>
      <button
        aria-label="加粗"
        aria-pressed={editorState.editor.isActive('bold')}
        onclick={() => editorState.editor?.chain().focus().toggleBold().run()}><b>B</b></button
      >
      <button
        aria-label="斜体"
        aria-pressed={editorState.editor.isActive('italic')}
        onclick={() => editorState.editor?.chain().focus().toggleItalic().run()}><i>I</i></button
      >
      <button
        title="引用"
        class:chosen={editorState.editor.isActive('blockquote')}
        onclick={() => editorState.editor?.chain().focus().toggleBlockquote().run()}>引用</button
      >
      <button
        title="无序列表"
        class:chosen={editorState.editor.isActive('bulletList')}
        onclick={() => editorState.editor?.chain().focus().toggleBulletList().run()}>• 列表</button
      >
      <button
        title="有序列表"
        class:chosen={editorState.editor.isActive('orderedList')}
        onclick={() => editorState.editor?.chain().focus().toggleOrderedList().run()}>1. 列表</button
      >
      <button
        title="任务清单"
        class:chosen={editorState.editor.isActive('taskList')}
        onclick={() => editorState.editor?.chain().focus().toggleTaskList().run()}>☑ 清单</button
      >
      <button
        title="插入表格"
        onclick={() =>
          editorState.editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >表格</button
      >
      <details class="more-format">
        <summary>更多格式</summary>
        <div class="format-menu">
          <button
            class:chosen={editorState.editor.isActive('underline')}
            onclick={() => editorState.editor?.chain().focus().toggleUnderline().run()}>下划线</button
          >
          <button
            class:chosen={editorState.editor.isActive('strike')}
            onclick={() => editorState.editor?.chain().focus().toggleStrike().run()}>删除线</button
          >
          <button
            class:chosen={editorState.editor.isActive('highlight')}
            onclick={() => editorState.editor?.chain().focus().toggleHighlight().run()}>高亮</button
          >
          <button
            class:chosen={editorState.editor.isActive('code')}
            onclick={() => editorState.editor?.chain().focus().toggleCode().run()}>行内代码</button
          >
          <button
            class:chosen={editorState.editor.isActive('codeBlock')}
            onclick={() => editorState.editor?.chain().focus().toggleCodeBlock().run()}>代码块</button
          >
        </div>
      </details>
      <button
        title="链接"
        onclick={() => {
          link = editorState.editor?.getAttributes('link').href ?? '';
          linkError = '';
          linkOpen = !linkOpen;
        }}>链接</button
      >
      <button title="分隔线" onclick={() => editorState.editor?.chain().focus().setHorizontalRule().run()}
        >—</button
      >
      <span class="divider"></span><button class="insert" onclick={onInsertImage}>＋ 图片</button>
      <button
        aria-label="撤销"
        disabled={!editorState.editor.can().undo()}
        onclick={() => editorState.editor?.chain().focus().undo().run()}>↶</button
      >
      <button
        aria-label="重做"
        disabled={!editorState.editor.can().redo()}
        onclick={() => editorState.editor?.chain().focus().redo().run()}>↷</button
      >
    {/if}
  </div>
  {#if editorState.editor?.isActive('table')}<div class="table-tools" aria-label="表格操作">
      <span>表格</span>
      <button onclick={() => editorState.editor?.chain().focus().addRowBefore().run()}>上方加行</button>
      <button onclick={() => editorState.editor?.chain().focus().addRowAfter().run()}>下方加行</button>
      <button onclick={() => editorState.editor?.chain().focus().deleteRow().run()}>删除行</button>
      <button onclick={() => editorState.editor?.chain().focus().addColumnBefore().run()}>左侧加列</button>
      <button onclick={() => editorState.editor?.chain().focus().addColumnAfter().run()}>右侧加列</button>
      <button onclick={() => editorState.editor?.chain().focus().deleteColumn().run()}>删除列</button>
      <button onclick={() => editorState.editor?.chain().focus().toggleHeaderRow().run()}>切换表头</button>
      <button
        disabled={!editorState.editor.can().mergeCells()}
        onclick={() => editorState.editor?.chain().focus().mergeCells().run()}>合并单元格</button
      >
      <button
        disabled={!editorState.editor.can().splitCell()}
        onclick={() => editorState.editor?.chain().focus().splitCell().run()}>拆分单元格</button
      >
      <button onclick={() => editorState.editor?.chain().focus().deleteTable().run()}>删除表格</button>
    </div>{/if}
  {#if pasteNotice}<div class="paste-notice" role="status">
      <span>{pasteNotice}</span><button aria-label="关闭粘贴提示" onclick={() => (pasteNotice = '')}>✕</button
      >
    </div>{/if}
  {#if linkOpen}<form
      class="link-form"
      onsubmit={(event) => {
        event.preventDefault();
        setLink();
      }}
    >
      <label>链接地址<input bind:value={link} placeholder="https://…" /></label><button type="submit"
        >应用</button
      ><button type="button" onclick={() => (linkOpen = false)}>取消</button>{#if linkError}<span role="alert"
          >{linkError}</span
        >{/if}
    </form>{/if}
  <div bind:this={element} class="editor-body"></div>
</div>

<style>
  .more-format {
    position: relative;
  }
  .more-format summary {
    cursor: pointer;
    padding: 7px 9px;
    font-size: 13px;
  }
  .format-menu {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 4;
    width: 145px;
    padding: 8px;
    display: grid;
    gap: 4px;
    background: #fff;
    border: 1px solid #dfe5da;
    border-radius: 8px;
    box-shadow: 0 8px 20px #263a2e18;
  }
  .table-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    padding: 10px 16px;
    background: #f2f5ef;
    border-bottom: 1px solid #e4e8e1;
  }
  .table-tools button {
    font-size: 12px;
    padding: 5px 8px;
    min-height: 30px;
  }
  .table-tools span {
    font-size: 12px;
    color: #6c7b65;
  }
  .paste-notice {
    display: flex;
    align-items: start;
    gap: 12px;
    padding: 12px 20px;
    font-size: 13px;
    line-height: 1.7;
    background: #f7f2e3;
    color: #77683d;
  }
  .paste-notice span {
    flex: 1;
  }
  .paste-notice button {
    background: transparent;
    border: 0;
  }
  .editor-body :global(.tableWrapper) {
    max-width: 100%;
    overflow-x: auto;
  }
  .editor-body :global(td),
  .editor-body :global(th) {
    position: relative;
  }
  .editor-body :global(.selectedCell:after) {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: #668c7733;
  }
  .editor-body :global(.column-resize-handle) {
    position: absolute;
    right: -2px;
    top: 0;
    bottom: 0;
    width: 4px;
    background: #668c77;
    pointer-events: none;
  }
  .editor-body :global(.resize-cursor) {
    cursor: col-resize;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px;
    border-bottom: 1px solid #e4e8e1;
    border-top: 1px solid #e4e8e1;
    padding: 10px 16px;
    position: sticky;
    top: 0;
    z-index: 2;
    background: #fffefc;
  }
  .toolbar button {
    border: 0;
    background: transparent;
    border-radius: 4px;
    padding: 7px 9px;
    font-size: 13px;
    min-height: 34px;
  }
  .toolbar button.chosen,
  .toolbar button[aria-pressed='true'] {
    background: #eaf1e7;
    color: #3f663f;
  }
  .toolbar .insert {
    color: #3c694b;
  }
  .divider {
    height: 17px;
    border-right: 1px solid #dfe5da;
    margin: 0 6px;
  }
  .editor-body {
    padding: 32px 46px 80px;
  }
  .editor-body :global(.tiptap) {
    outline: none;
    min-height: 500px;
  }
  .editor-body :global(.tiptap p.is-editor-empty:first-child:before) {
    content: '从这里开始写作…';
    color: #9da596;
    float: left;
    pointer-events: none;
    height: 0;
  }
  .editor-body :global(.ProseMirror-selectednode) {
    outline: 2px solid #6b8a60;
    outline-offset: 6px;
  }
  .editor-body :global(figcaption:empty:before) {
    content: attr(data-placeholder);
    color: #909b87;
  }
  .editor-body :global(figure img) {
    max-height: 420px;
    cursor: grab;
  }
  .link-form {
    padding: 16px 24px;
    display: flex;
    gap: 10px;
    align-items: end;
    flex-wrap: wrap;
    border-bottom: 1px solid #e4e8e1;
  }
  .link-form label {
    flex: 1;
    min-width: 180px;
    font-size: 12px;
  }
  .link-form span {
    width: 100%;
    color: #a5493e;
  }
  @media (max-width: 650px) {
    .editor-body {
      padding: 24px 20px 60px;
    }
    .toolbar {
      padding: 7px;
      gap: 1px;
    }
    .toolbar button {
      padding: 7px;
    }
  }
</style>
