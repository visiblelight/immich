# 前台用户与互动数据字典

对应 ADR 0023，迁移 `0015_community.sql`。这些表均位于 Gallery schema；不关联或修改 Immich 用户、媒体和表结构。

| 表 | 字段与约束 | 用途 |
|---|---|---|
| community_settings | id 固定 1；registration、comments、likes、show_comments、show_likes；updated_at | 五个独立开关，迁移后全部关闭 |
| member | UUID id；规范化唯一 email；1–40 字 display_name；唯一 avatar 与 avatar_fingerprint；disabled、trusted；created_at、updated_at | 前台访客，展示名称不要求唯一；头像种子不依赖邮箱 |
| member_session | SHA-256 token_hash 主键；member_id；created_at、expires_at、revoked_at | 180 天滑动续期；浏览器保存 HttpOnly、SameSite=Lax Cookie；HTTPS 下 Secure |
| member_challenge | UUID id；email、purpose、member_id、name；session_hash、proof_hash、code_hash；attempts；created_at、expires_at、delivered、consumed_at | 6 位随机码，HMAC-SHA256 保存；有效期 10 分钟、最多 5 次、60 秒重发间隔；旧／新邮箱验证绑定同一会话 |
| community_comment | UUID id；member_id；kind、target_id；1–1000 字 body；status；reply；moderated_by；created_at、updated_at | pending/published/hidden/deleted；纯文字；新用户审核通过后 trusted；软删除清空正文及回复 |
| community_like | member_id、kind、target_id 联合主键；created_at | 每用户每对象一个赞，可取消 |

kind 为 album/photo/article。相册及文章使用稳定实体 ID，照片在服务端校验公开入口后转换为统一 Immich asset ID，因此同一照片跨相册共用互动。target_id 不建立跨 schema 外键，不作为公开访问凭据。

读取及写入互动均检查当前公开视图。照片额外检查两种衍生媒体路径、文件存在性及 symlink 边界。文章和相册下线后，其互动入口一同关闭；仍有其他公开相册引用的同一照片在其有效入口继续共享互动。评论公开 DTO 不包含邮箱。

索引覆盖目标时间排序、待审核状态、用户、会话到期、验证码重发查询。新增数据可随 Gallery 数据库一起备份；恢复时应同时撤销 `gallery.member_session`，防止备份复活已退出的会话。

## 权限与配置

- `gallery_public` 保持原有只读权限，不授予互动表访问。
- 新增 `gallery_community`：仅公开内容视图 SELECT 和互动数据表读写，不拥有 schema，无其他角色成员资格；不能读取后台账号、修改相册文章或读取 Immich 原始表。
- `gallery_admin` 仅获得管理所需的成员、会话、评论、设置读写和点赞计数读取。
- 迁移可先执行、功能保持关闭；然后用单次数据库管理连接执行 `deployment/gallery/database/community-role.sql` 并设置独立随机密码。运行进程只接收专用连接，不接收 owner/migrator 凭据。
- 前台环境增加 `GALLERY_COMMUNITY_DATABASE_URL`、至少 32 字符的 `GALLERY_MEMBER_CODE_SECRET`、`GALLERY_MAIL_ACCESS_KEY_ID`、`GALLERY_MAIL_ACCESS_KEY_SECRET`、`GALLERY_MAIL_FROM=vision@ke.ink`、`GALLERY_MAIL_ALIAS=光与远方`。密钥文件只允许本机用户读取并忽略于 Git。
- DirectMail 仅授权 `dm:SingleSendMail`，使用杭州触发邮件 API；[官方 RAM 文档](https://www.alibabacloud.com/help/en/direct-mail/api-dm-2015-11-23-ram)规定该操作使用 Resource=*，无产品级条件键，不能限定为某个发信地址；应用固定使用已配置的 vision@ke.ink。代码和日志不输出验证码或 AccessKey。测试通过注入内存发信器进行，不提供固定验证码或绕过真实验证的 HTTP 接口。

## 回退

生产部署需要另行确认。关闭五个开关或撤掉前台专用连接可停止入口；回退应用时保留新增表和互动数据，无须回滚或修改已有相册、照片组、文章关联。未配置互动连接时旧公共页面正常工作。专项防机器人系统依用户要求延期。
