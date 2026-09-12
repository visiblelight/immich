# ADR 0008：使用 Immich 生成的展示图片

状态：用户已确认，2026-09-12。实际交付另记。

- 图片尺寸及有损压缩由 Immich 管理。当前用户选择 Thumbnail 短边 1080 px、Preview 短边 2160 px（后台标为 4K）；实际尺寸随原片比例及是否已重新生成而变化，不放大小图。
- Gallery 前台列表、封面、地图缩略图以及后台选片使用 Thumbnail；大图和后台大图预览使用 Preview。取消 Gallery 长边 600／2560 限制及 WebP 二次压缩，不新增 Gallery 图片生成任务。
- 保留来源 JPEG／WebP 的压缩像素、尺寸、ICC 色彩配置及透明度。仅移除容器中的 EXIF、XMP、IPTC、注释、其他非显示用途附加信息及尾部数据，不重编码像素。
- HTTP Content-Type 按实际内容识别。未支持或损坏的图片拒绝返回，不回退到原图。Immich 衍生图应已应用方向；遇到尚需 EXIF 旋转的文件拒绝输出，避免删除方向信息后显示错误。
- 每次请求仍检查已发布成员、祖先、来源范围、资源状态和媒体路径；输出继续 no-store，进程内处理结果缓存根据文件内容失效。图片元数据清理不能替代发布授权。
- 不修改 Immich 配置、原图或数据库。旧图重新生成由用户在 Immich 的「任务队列 → 生成缩略图 → 全部」执行。无须重新导入或发布 Gallery 相册。

替代集成文档中 Gallery 自行生成多尺寸展示图片的方案。JPEG 支持 Immich 生成的顺序／渐进静态图片；WebP 参照 [官方 RIFF 容器规范](https://developers.google.com/speed/webp/docs/riff_container)，当前只支持静态衍生图。
