<script lang="ts">
  import { PublicHeader, ArticleReader } from "@gallery/ui";
  import { resolveSampleImage } from "@gallery/ui/article-design";
  let { data } = $props();
  const resolve = (node: Parameters<typeof resolveSampleImage>[0]) => {
    const image = resolveSampleImage(node);
    return image
      ? {
          ...image,
          src: image.src.replace("-small", ""),
          preview: image.preview.replace("-small", ""),
        }
      : null;
  };
</script>

<svelte:head><title>{data.article.title} · Gallery</title></svelte:head>
<div class="public-site" style="padding:0 4vw">
  <PublicHeader
    name="Gallery"
    active={data.article.id === "about" ? "about" : "records"}
    recordsHref="/design/records"
    aboutHref="/design/records/about"
  />
  <div class="back">
    <a href="/design/records">← 全部记录</a><span>阅读样例</span>
  </div>
  <ArticleReader
    title={data.article.title}
    date={data.article.id === "about" ? "" : data.article.date}
    document={data.article.document}
    resolveImage={resolve}
    related={data.article.albums.map((title: string) => ({
      title,
      href:
        "/design?album=" + (title === "第比利斯" ? "tbilisi" : "mountain-days"),
    }))}
  />
</div>

<style>
  .back {
    max-width: 1090px;
    margin: 24px auto 0;
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #8a9285;
  }
  .back a {
    color: #6c7b65;
    text-decoration: none;
  }
</style>
