# Gallery 云资源权限草案

状态：用户已确认权限范围；云端角色及三项自定义策略已创建并授权，ECS 实例绑定及 API 实测待完成；2026-09-20。

这些 JSON 不含密钥，不是对全部云资源的授权。资源中的账号通配符沿用阿里云资源 ARN 格式；绑定前可替换为当前账号 ID。Bucket 名和 CDN 域名已固定为本次接入资源。

## CDN 回源

复用已存在的 `AliyunCDNAccessingPrivateOSSRole`，信任主体见 `cdn-origin-trust.json`。为该角色绑定自定义策略 `GalleryCdnOriginRead`，内容见 `cdn-origin-policy.json`：仅允许 `oss:GetObject` 读取 `vision-ke/gallery/*`，不允许列举 Bucket、上传、删除、读取其他目录或 Bucket。已确认另三个 CDN 域名未启用私有回源后，解除原全账号 OSS 只读系统策略。

不点击默认快速授权页面的「确认授权」，其默认系统策略范围大于本方案。若该角色后来已被其他项目创建，不覆盖其策略，应先审查共享影响。角色建立后仅在 `cdn.ke.ink` 开启私有回源。

## ECS 同步

已创建实例角色 `GalleryMediaSyncRole`，信任主体见 `ecs-media-trust.json`，已绑定策略 `GalleryMediaSync` 见 `ecs-media-policy.json`。只允许读取、上传及删除 `vision-ke/gallery/*`，以及刷新 `cdn.ke.ink` 缓存；删除权限用于撤销公开内容后的衍生副本清理，不允许删除 Bucket 或 Immich 原片。

绑定到现有香港 ECS；核查时该实例未绑定角色。使用实例临时凭据，无需创建主账号或 RAM 用户长期 AccessKey。实例角色不是容器身份隔离：能访问 ECS 元数据服务的宿主机进程或容器可能取得相同角色权限，部署时须限制非必要的元数据访问，不能声称这份角色天然只对 Gallery 容器可见。

媒体同步策略不授予 DNS 修改、CDN 配置管理、证书更新或 IAM 管理权限。

## 免费证书自动化

独立的 `ecs-certificate-policy.json` 已以 `GalleryCdnCertificate` 策略绑定到同一实例角色：允许在 `acme-cdn.ke.ink` 查询、增加、删除 DNS 记录，以及为 `cdn.ke.ink` 调用 `SetCdnDomainSSLCertificate`。不允许修改整个 `ke.ink` 的解析或其他 CDN 域名。

阿里云 DNS 的记录管理权限只能细分到域名，不能限制为某一条 TXT。因此先独立托管免费验证子域，再将 `_acme-challenge.cdn.ke.ink` 委派到该子域。脚本另行检查 TXT 名称和值，只删除当前挑战记录；这个应用校验不能替代云端权限边界。

实现及验收步骤见 [证书自动化](../certificate/README.md)。脚本和本地测试已完成，真实签发、续期与 CDN 部署待验收。

## 实施门槛与撤销

- 浏览器创建／绑定云角色属于新增持久访问权限，须就上述范围在提交前取得明确确认。
- JSON 格式检查不是云侧鉴权验收。实际上传及读取一个测试对象、拒绝越界路径和匿名源站访问后，才可记录为已验证。
- 如所选 SDK 需要额外 Action，应明确其目的后增量审查，不扩大为 `oss:*` 或 `Resource: *`。
- 撤销时停用同步任务、解绑 ECS 角色及 CDN 角色策略；保留本地 Immich 文件，前台使用既有 ECS 媒体入口。不会自动删除云资源。
