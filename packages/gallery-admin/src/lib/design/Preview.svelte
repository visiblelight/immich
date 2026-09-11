<script lang="ts">
  import { image, source, type Content, type Photo } from './model';
  let { content, children, siteName }: { content: Content; children: Content[]; siteName: string } = $props();
  let viewing = $state<Photo | null>(null);
</script>

{#snippet story()}
  <p class="summary">{content.summary}</p>
  {#each content.blocks as block}{#if block.kind === 'heading'}<h3>
        {block.text}
      </h3>{:else if block.kind === 'quote'}<blockquote>{block.text}</blockquote>{:else}<p class="prose">
        {block.text}
      </p>{/if}{/each}
{/snippet}

{#if viewing}
  <div class="preview-viewer">
    <button class="quiet" onclick={() => (viewing = null)}>← 返回相册预览</button>
    <div class="viewer-layout">
      <img src={image(viewing.asset)} alt={viewing.alt || viewing.title || '相册照片'} />
      <aside>
        <p class="eyebrow">照片信息</p>
        <h2>{viewing.title || '未设置标题'}</h2>
        <p class="prose">{viewing.description || '暂无描述'}</p>
        <hr />
        <p class="muted">EXIF · 示例参数</p>
        <p>Sony α7 IV · 35mm<br />f/2.8 · 1/250s · ISO 100</p>
        {#if viewing.location !== 'hidden'}<p>
            {viewing.location === 'approximate' ? '近似位置' : '位置'}：{source(viewing.asset).place}（示例）
          </p>{/if}
      </aside>
    </div>
  </div>
{:else}
  <div class="public-preview">
    <header><strong>{siteName}</strong><span>相册 <span class="muted"> / 关于</span></span></header>
    <p class="eyebrow">相册 / {content.title}</p>
    <h2>{content.title || '未命名相册'}</h2>
    <div class="preview-layout">
      <section aria-label="预览照片与子相册">
        {#if children.length}<h3>子相册 <small>{children.length}</small></h3>
          <div class="preview-grid">
            {#each children as child}<div class="child-card">
                {#if child.cover}<img src={image(child.cover)} alt="" />{:else}<div class="cover-empty">
                    相册
                  </div>{/if}<strong>{child.title}</strong>
                <p class="muted">{child.photos.length} 张照片 · 子相册封面示意</p>
              </div>{/each}
          </div>{/if}
        <h3>照片 <small>{content.photos.length}</small></h3>
        <div class="preview-grid">
          {#each content.photos as p}<button class="preview-photo" onclick={() => (viewing = p)}
              ><img src={image(p.asset)} alt={p.alt || p.title || '查看照片'} /><span>{p.title || '未设置标题'}</span
              ></button
            >{/each}
        </div>
        {#if !content.photos.length}<div class="empty">
            本册暂无直接照片{children.length ? '，可从子相册继续浏览。' : '。'}
          </div>{/if}
      </section>
      <aside class="story-preview">
        <div class="desktop-story">{@render story()}</div>
        <details class="mobile-story"><summary>相册介绍 · 展开阅读</summary>{@render story()}</details>
      </aside>
    </div>
  </div>
{/if}
