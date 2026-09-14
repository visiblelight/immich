<script lang="ts">
  import { onMount } from "svelte";
  import { Editor, Node, type JSONContent } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import {
    articleLink,
    type ArticleDocument,
    type ArticleImageResolver,
    type ArticleNode,
  } from "@gallery/core";
  import "@gallery/ui/article-style.css";
  let {
    document,
    resolveImage,
    onChange,
    onInsertImage,
  }: {
    document: ArticleDocument;
    resolveImage: ArticleImageResolver;
    onChange: (document: ArticleDocument) => void;
    onInsertImage: () => void;
  } = $props();
  let element: HTMLDivElement;
  let editorState = $state.raw<{ editor: Editor | null }>({ editor: null });
  let linkOpen = $state(false);
  let link = $state("");
  let linkError = $state("");
  export function insertImages(nodes: ArticleNode[]) {
    editorState.editor
      ?.chain()
      .focus()
      .insertContent([...nodes, { type: "paragraph" }])
      .run();
  }
  function setLink() {
    if (link && !articleLink(link)) {
      linkError = "请输入有效的 http、https 或邮件链接";
      return;
    }
    const chain = editorState.editor?.chain().focus().extendMarkRange("link");
    if (link) chain?.setLink({ href: link }).run();
    else chain?.unsetLink().run();
    linkOpen = false;
  }
  onMount(() => {
    const GalleryImage = Node.create({
      name: "galleryImage",
      group: "block",
      content: "inline*",
      draggable: true,
      defining: true,
      addAttributes() {
        return {
          kind: { default: "photo" },
          ref: { default: "" },
          album: { default: "" },
        };
      },
      // Ordinary pasted <img> must never become an authorized resource reference.
      parseHTML() {
        return [];
      },
      renderHTML({ HTMLAttributes }) {
        return [
          "figure",
          { "data-gallery-image": HTMLAttributes.ref },
          ["figcaption", 0],
        ];
      },
      addNodeView() {
        return ({ node }) => {
          const dom = window.document.createElement("figure");
          const img = window.document.createElement("img");
          const caption = window.document.createElement("figcaption");
          img.contentEditable = "false";
          img.draggable = true;
          img.dataset.dragHandle = "";
          caption.dataset.placeholder = "写一点图片说明…";
          function update(next: typeof node) {
            const resolved = resolveImage(next.toJSON() as ArticleNode);
            if (resolved) {
              img.src = resolved.src;
              img.alt = resolved.alt;
            } else {
              img.removeAttribute("src");
              img.alt = "图片暂不可用";
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
    const editor = new Editor({
      element,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          code: false,
          codeBlock: false,
          strike: false,
          underline: false,
          link: {
            openOnClick: false,
            autolink: false,
            isAllowedUri: (url) => !!articleLink(url),
          },
        }),
        GalleryImage,
      ],
      content: document.doc as JSONContent,
      editorProps: {
        attributes: {
          class: "article-prose",
          "aria-label": "文章正文",
          role: "textbox",
          "aria-multiline": "true",
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
        class:chosen={editorState.editor.isActive("paragraph")}
        onclick={() => editorState.editor?.chain().focus().setParagraph().run()}
        >正文</button
      >
      <button
        title="二级标题"
        class:chosen={editorState.editor.isActive("heading", { level: 2 })}
        onclick={() =>
          editorState.editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >H2</button
      >
      <button
        title="三级标题"
        class:chosen={editorState.editor.isActive("heading", { level: 3 })}
        onclick={() =>
          editorState.editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >H3</button
      >
      <span class="divider"></span>
      <button
        aria-label="加粗"
        aria-pressed={editorState.editor.isActive("bold")}
        onclick={() => editorState.editor?.chain().focus().toggleBold().run()}
        ><b>B</b></button
      >
      <button
        aria-label="斜体"
        aria-pressed={editorState.editor.isActive("italic")}
        onclick={() => editorState.editor?.chain().focus().toggleItalic().run()}
        ><i>I</i></button
      >
      <button
        title="引用"
        class:chosen={editorState.editor.isActive("blockquote")}
        onclick={() =>
          editorState.editor?.chain().focus().toggleBlockquote().run()}
        >引用</button
      >
      <button
        title="无序列表"
        class:chosen={editorState.editor.isActive("bulletList")}
        onclick={() =>
          editorState.editor?.chain().focus().toggleBulletList().run()}
        >• 列表</button
      >
      <button
        title="有序列表"
        class:chosen={editorState.editor.isActive("orderedList")}
        onclick={() =>
          editorState.editor?.chain().focus().toggleOrderedList().run()}
        >1. 列表</button
      >
      <button
        title="链接"
        onclick={() => {
          link = editorState.editor?.getAttributes("link").href ?? "";
          linkError = "";
          linkOpen = !linkOpen;
        }}>链接</button
      >
      <button
        title="分隔线"
        onclick={() =>
          editorState.editor?.chain().focus().setHorizontalRule().run()}
        >—</button
      >
      <span class="divider"></span><button
        class="insert"
        onclick={onInsertImage}>＋ 图片</button
      >
      <button
        aria-label="撤销"
        disabled={!editorState.editor.can().undo()}
        onclick={() => editorState.editor?.chain().focus().undo().run()}
        >↶</button
      >
      <button
        aria-label="重做"
        disabled={!editorState.editor.can().redo()}
        onclick={() => editorState.editor?.chain().focus().redo().run()}
        >↷</button
      >
    {/if}
  </div>
  {#if linkOpen}<form
      class="link-form"
      onsubmit={(event) => {
        event.preventDefault();
        setLink();
      }}
    >
      <label>链接地址<input bind:value={link} placeholder="https://…" /></label
      ><button type="submit">应用</button><button
        type="button"
        onclick={() => (linkOpen = false)}>取消</button
      >{#if linkError}<span role="alert">{linkError}</span>{/if}
    </form>{/if}
  <div bind:this={element} class="editor-body"></div>
</div>

<style>
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
  .toolbar button[aria-pressed="true"] {
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
    content: "从这里开始写作…";
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
