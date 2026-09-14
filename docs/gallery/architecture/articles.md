# 文章数据与媒体设计

状态：依据已确认 ADR 0012 编写的实现设计；2026-09-14。0008 迁移已编写并通过隔离结构检查；本地应用情况见交付记录。

## 表与关系（Gallery schema）

| 表                  | 关键字段与约束                                                                                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `article`           | UUID 主键；`slug` 全站唯一，首次发布后固定；`status` draft/published/offline；`version` 乐观锁；草稿 title、summary、document、cover 引用、display_date、listed；`current_release_id`；created_by/updated_by、created_at/updated_at |
| `article_release`   | UUID 主键；article_id、递增 version 唯一；不可变的 title、summary、document、cover 引用、display_date、listed；published_by/published_at；指针必须属于本文章                                                                              |
| `article_media`     | UUID 主键；服务端生成的 storage_key 唯一；实际 MIME、尺寸、字节数、校验和；仅文件完整归档后插入；uploaded_by/created_at；preview 校验和；不保存任意客户端路径                                                                                     |
| `article_photo_ref` | article_id、可空 release_id、节点标识、共享 photo_id、来源 album_id；封面也算引用；发布时核对来源相册公开成员                                                                                                                 |
| `article_media_ref` | article_id、可空 release_id、节点标识、media_id；封面也算引用；供权限、引用计数和清理使用                                                                                                                                     |
| `article_album_ref` | article_id、可空 release_id、album_id、position；多对多；公开端仅展示当前可公开访问的相册                                                                                                                                     |
| `site` 扩展         | `about_article_id` 可空外键与 `about_article_version` 独立乐观锁；不得将旧 about_document 伪装成文章；未配置时保留旧展示                                                                                                                                                       |

引用表以 release_id 是否为空区分草稿和发布归属，使用部分唯一索引约束节点。草稿替换与 article.version 更新在一个事务，发布复制引用并切换 current_release_id 在一个事务。发布版本内容不可更新；旧版本引用用于审计，不授权匿名媒体。article_release 使用 (article_id, id) 唯一键保证当前版本归属。迁移已与本字典入口同步落地。

## 内容协议

正文采用 `schemaVersion: 1` 加 Tiptap 文档。服务端只接受白名单节点、属性及 mark；限制字节数、层级、节点数量和文本长度。标题只有 H2/H3，页面标题单独保存。图片节点 `galleryImage` 使用 kind/photo 或 upload、ref、来源相册上下文；图注为节点内 inline 内容。文档不含 Immich 路径、API Key、GPS 或任意 src。

公开渲染不加载编辑器，文字转义、链接协议校验、图片经服务端解析授权。标题目录由正文顺序生成稳定锚点，避免用户 HTML ID 注入。样例资源使用单独的虚构 ref 映射，不能接入正式接口。

## 写入与发布

- 后台必须登录并通过现有 Origin 校验；运行角色不接收迁移凭据。
- 自动保存携带 article.version；并发修改返回冲突，不覆盖其它标签页。预览只对认证管理员开放且 no-store。
- 发布验证草稿版本、标题、正文、封面、图片可用性及相册引用，创建不可变版本。纯文字无需封面或照片。
- 正文及关联修改只进入草稿；公开页只读当前已发布版本。显示发表时间与实际发布时间分开。
- 下线关闭文章页和其独立素材入口；被其它当前公开文章引用的同一素材仍可通过那些文章读取。
- 关于采用当前已发布文章，可在文章设置取消“展示在记录列表”；被站点选中的文章下线时事务锁定并检查关联。

## 素材存储

新建 Gallery 独立素材根目录／Compose 卷，不写 Immich 目录。上传验证实际图像、限制尺寸／大小、移除 EXIF/GPS，生成正文和大图版本，拒绝脚本型 SVG 及无法解析的文件。文件先写临时区，校验完成后原子归档，数据库再插入可用素材行；失败可回收，不能产生公开半成品。后台可显式删除无草稿／发布引用的素材；异常残留目录按维护手册在备份并核对后清理，宽限期为 24 小时，当前没有自动清理任务。

存量 Immich 照片维持 1080p/4K 引用与当前清理元数据策略，不重新编码。上传插图是独立管道，不改变该约定。备份必须覆盖 Gallery 数据与素材目录；恢复先在隔离环境检查引用与文件一致性。


## 0008 实际结构补充

article 与 article_release 的正文设置存于 content JSONB，字段为 title、summary、date、document、cover、listed、albums；对应本文描述的独立编辑字段，不把用户资料或 GPS 放入正文。article 的 version 在每次保存／发布／下线后递增；发布版本以 source_version 唯一。首次发布后 slug 固定。created_by、updated_by、published_by 记录操作者。

article_photo_ref.photo_id 指向 gallery.photo.immich_asset_id，另记录明确的 Gallery 来源 album_id；不与 Immich 表建外键。release_id 为空的引用跟随最新草稿，非空则属于不可变历史版本，触发器阻止删除。独立素材只保留去除元数据后的两份 WebP（最大边 1600／3840，不放大），文件准备期间尚无数据库行；异常残留按维护手册检查。

site.about_article_version 与原 site.version 分离；关于选篇不会使站点名称／联系链接表单产生无关版本冲突。public 只读 published_article、published_article_media、published_article_photo、published_article_album、published_about_article 五个视图。所有匿名素材读取都以当前文章发布成员为条件；草稿和历史版本不授权。
