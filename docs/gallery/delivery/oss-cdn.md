# OSS / CDN 接入记录

状态：免费证书自动化、限定云角色、私有回源、图片同步及前台 CDN 签名跳转已上线；真实图片字节、缓存命中、权限、回收及签名自然过期验收通过。2026-09-20。

## 2026-09-20 媒体接入实现与验收

已实现公开媒体枚举、无二次编码的内容散列对象、宿主机 OSS 同步与失败重试、共享引用回收、前台受控 302 和 A 签名。使用现有公开数据库视图，不新增业务表或 owner 凭据。可重建同步状态存储于独立私有目录，前台只读挂载。

本地 Gallery 类型检查、41 项单元测试、8 项证书及 8 项同步测试、构建与 HTTP 冒烟通过。独立 PostgreSQL 的 25 项合成集成测试通过，包含 CDN 就绪状态下的相册/文章下线 404、恢复签发、关闭 CDN 后返回 ECS；Immich schema drift 为 0。

生产实际完成：

- 用户自行配置 CDN A 鉴权主 KEY、有效期 300 秒；密钥存放于本机私有文件和 ECS 配置，没有写入 Git。没有为媒体功能新增 RAM 用户、角色或权限，继续使用已授权角色。
- `/gallery/` 目录边缘缓存 86400 秒，忽略源站不缓存标头；客户端跟随 CDN 缓存策略关闭，浏览器实际响应仍为 `Cache-Control: no-store`。响应过期缓存遵循源站关闭、延长时间为 0 秒。
- 首次由已提交 Git 协调新增只读状态挂载并核对前台健康；应用镜像通过 Gallery CI 部署。宿主机 worker 从 Git 安装，未直接修改服务端仓库源码。
- `gallery-media-sync.timer` 已启用，首次扫描成功上传 2 个对象到 `vision-ke/gallery/v1/`。当前线上一张照片对应 WebP 缩略图 223742 字节、JPEG 预览图 1026023 字节，原图没有上传。
- 真实前台媒体入口分别返回 302，目标主机为 `cdn.ke.ink`；浏览器相片页和看图器图片加载正常，原始尺寸为 1620×1080 与 3240×2160。
- 两个 CDN 对象的 SHA-256 与 Gallery 清理元数据后的输出相同；均观察到 `HIT TCP_MEM_HIT`，大图首访 MISS 后二次 HIT。
- 真实无签名、错误签名、已过期签名均 403，正确签名 200；OSS 匿名读取实际对象 403。ECS 角色对允许目录内的缺失对象返回 404，对目录外探测返回 403。
- 8×8 合成图完成 OSS Put/Get、正常垃圾回收 Delete 和 CDN Refresh 验证；已确认测试对象不存在、日志账本已移除。随后保留 2 个真实展示对象，无失败项。
- 功能提交 `aa86dbb6a` 和真实 SDK 404 包装修复 `4b1d0f77e` 均完成 GitHub CI 检查、镜像发布和自动部署。后续定时扫描对象数 2、上传数 0、失败数 0，没有重复上传。
- ECS 私有初始化备份位于 `/srv/vision/backups/media-initial-20260920/media-sync.tar.gz`，包含媒体同步配置、签名密钥及日志账本，SHA256 校验通过；未写入 Git 或公开目录。
- 记录一条实际返回 200 且命中缓存的签名 URL，保留原 URL 不重新签发；自然经过 354 秒后重放得到 403。CDN 配置有效期为 300 秒，验证结果存于 ECS 私有目录 `expiry-result.json`。缓存命中不能绕过签名失效。
- 最终检查：前后台容器健康，Gallery 前后台、Immich、JVS 公网入口正常；媒体同步、证书续期及元数据隔离服务均 active。

文章插图的完整上传/发布/下线/CDN 302/回退在隔离 HTTP 集成测试中验证；生产没有为了验收创建测试文章。生产真实相册未为测试而下线。下线阻止新签名由上述集成测试验证，旧签名自然到期在真实 CDN 验证。

部署、文件结构、性能边界及回滚详见 [媒体同步维护说明](../../../deployment/gallery/cloud/media/README.md)。

## 已确认的产品边界

- 仅同步 Gallery 已公开内容使用的展示图及文章图片，不同步 Immich 原片、家庭私密照片和未发布草稿素材。
- Immich 的 Thumbnail 短边 1080、Preview 短边 2160；Gallery 继续清理图片隐私元数据，不重编码像素。ECS 保留来源图，OSS 保存公开展示副本。
- 公开媒体入口签发 CDN 地址前仍检查发布祖先、当前版本成员、来源范围、资源状态和路径。私有 Bucket 回源授权不能替代访客 URL 鉴权。
- 用户接受撤销后的旧签名地址最多继续有效 5 分钟；停止签发新地址，并异步清理不再被公开内容引用的对象及缓存。已下载的图片无法收回。
- 用户要求使用免费 Let's Encrypt 证书并自动续期；已在说明 HTTPS 请求费区别后确认继续使用阿里云 CDN 现有计费，不购买付费证书。

## 2026-09-20 初次核查（配置前，历史记录）

| 项目 | 实测状态 |
| --- | --- |
| Bucket | `vision-ke`，中国香港，标准存储，同城冗余 |
| OSS 权限 | 私有；概览显示文件不可公共访问 |
| CDN 域名 | `cdn.ke.ink`，正常运行，全球加速，图片小文件 |
| DNS | CNAME 指向 `cdn.ke.ink.w.cdngslb.com`；`ke.ink` 使用阿里云权威 DNS |
| 源站 | `vision-ke.oss-cn-hongkong.aliyuncs.com`；源站端口 80 |
| 回源 HOST | 已开启，使用上述 OSS 源站域名 |
| HTTPS | 未开启；从 ECS 实测 TLS 握手失败 |
| 私有回源 | 控制台明确显示尚未授权，未提交一键授权 |
| URL 鉴权 | 未设置 |
| 缓存规则 | 没有自定义缓存过期规则 |
| ECS 身份 | 香港实例元数据未列出 RAM 角色；未创建或绑定角色 |
| 当前图片 | 当前公开样片的缩略图 1620×1080、大图 3240×2160，符合 3:2 照片的目标短边 |

HTTP 请求 CDN 根路径返回 OSS AccessDenied，不能据此推断实际对象的访问结果；需要配置完成后用真实对象验证。上述记录不代表 OSS/CDN 已接入成功。核查未更改其他 CDN 域名、Bucket、JVS 或现有 Edge 入口。

## 免费证书及自动更新安排

现有 Edge 使用 Certbot webroot 续期，服务于直接解析到 ECS 的站点。`cdn.ke.ink` 已指向 CDN，不能直接套用本机 webroot 流程，也无需让它抢占 ECS 的 80/443。

拟采用 DNS-01 签发仅覆盖 `cdn.ke.ink` 的 Let's Encrypt 证书：自动维护验证 TXT 记录，定期检查有效期，续期成功后通过 CDN API 部署新证书，最后从公网检查实际证书指纹和有效期。部署失败需重试并保留仍有效的旧证书；不能以本地续期成功代替 CDN 部署成功。DNS 验证权限和 CDN 证书更新权限分别限制范围，私钥不进入 Git 或日志。

CDN 返回的收费提示是 HTTPS 请求数计费，并非购买证书。阿里云当前文档说明每月前 500 万次静态 HTTPS 请求免费、超出部分每万次 0.05 元；还需核对账号其他域名用量、实际账单及地域适用规则，不能把它理解为 Gallery 独占额度或永远免费。OSS 容量、请求、回源及 CDN 流量仍按各自规则计费。未经确认不启用新增计费服务或购买证书、资源包。

## 后续实施与验收

已实现并安装 [证书自动化脚本](../../../deployment/gallery/cloud/certificate/README.md)：固定版本 acme.sh、ECS 角色临时凭据、独立 DNS 验证子域、可信证书链及私钥匹配校验、CDN 部署重试与公网指纹验证。8 项单元测试及首轮完整 CI 已通过；真实 DNS 和证书 API 已验收，OSS 对象操作待后续媒体接入时实测。

用户已明确批准验证子域委派、限定范围的角色创建与绑定、CDN 展示目录只读回源。实际完成：

- 创建免费 DNS 子域 `acme-cdn.ke.ink`，完成所有权校验，添加 `_acme-challenge.cdn.ke.ink CNAME _acme-challenge.acme-cdn.ke.ink`。公网查询确认别名生效，子域 NS 为 `ns1.alidns.com`、`ns2.alidns.com`。
- 创建 `GalleryMediaSyncRole`（仅信任 ECS），绑定 `GalleryMediaSync` 和 `GalleryCdnCertificate` 两项自定义策略，隔离验收后已绑定香港 ECS 实例。
- 核查此前已存在的 CDN 默认角色，移除其全账号 OSS 只读系统策略，改为 `GalleryCdnOriginRead`，仅可读取目标展示目录。变更前已确认账号内另外三个 CDN 域名的私有回源开关均关闭，未改动它们的配置。
- `cdn.ke.ink` 私有回源已开启，使用同账号 STS，不创建 RAM 用户或长期 AccessKey。
- 服务器现有应用容器均为非特权桥接网络；独立 nftables 元数据隔离服务已启用。宿主机 IMDSv2 返回 200，Gallery/JVS 容器探测失败且拒绝计数增加；四个站点仍可访问，没有修改 JVS 源码或 Edge 入口。
- Let's Encrypt staging 与正式 DNS-01 签发均成功，TXT 自动添加及清理已验证。正式证书已自动上传 CDN，ECS 与本机均可完成可信 TLS 握手；公网指纹为 `6eaa0186410579e0f1c350e42291f213bfe5edba49902240c3ec6486a1cd8321`，有效期至 `2026-12-19T08:47:50Z`。
- `gallery-certificate.timer` 已启用，每日两次检查；`gallery-certificate.service` 实际执行续期检查和公网校验返回 `Result=success / ExecMainStatus=0`。这不等于已经历下一次到期换证，仍须持续运维。
- 证书状态独立存于 `/var/lib/gallery-certificate`，专用 Unix 用户权限为 0700；不会放宽 `/srv/vision` 的 root 私有权限。首份私有证书备份在 ECS `/srv/vision/backups/certificate-initial-20260920`，归档与校验和通过，未复制私钥至本机或 Git。云备份脚本已加入后续证书状态归档。

1. 已完成：免费证书签发、自动部署、可信 TLS 及定时任务首轮验收。HTTPS 请求计费此前已确认，未购买付费证书。
2. 已完成：CDN 展示目录只读角色、限定范围 ECS 同步角色和元数据隔离。不使用主账号或 RAM 用户长期 AccessKey；对象访问权限待媒体接入实测。
3. 已完成：300 秒 A 签名鉴权、边缘缓存与浏览器 no-store 分离，过期缓存延长关闭。
4. 已完成：公开内容同步、散列对象名、日志账本、失败重试、共享引用回收及受控签发。
5. 已完成：未同步成功及同步清单过期时回退 ECS 授权入口；后台私有选片与草稿预览保持原认证要求。
6. 已完成真实签名正反向、源站匿名拒绝、缓存 HIT、字节一致和自然过期 URL 拒绝检查。
7. 已实现并测试：关闭 CDN 读取恢复 ECS 授权入口，不删除 Immich 本地图像。签名配置与账本加入私有备份。

回源、同步及证书更新的具体权限见 [RAM 权限说明](../../../deployment/gallery/cloud/ram/README.md)。证书 DNS 验证采用独立子域委派，避免给 ECS 整个 `ke.ink` 的解析管理权限。运维仍需关注同步失败、服务器时钟、证书续期和私有备份；未新增邮件或短信告警。

## 官方依据

- [私有 OSS 回源及授权范围](https://help.aliyun.com/zh/cdn/user-guide/grant-alibaba-cloud-cdn-access-permissions-on-private-oss-buckets)
- [URL 鉴权与缓存参数处理](https://help.aliyun.com/zh/cdn/user-guide/configure-url-signing)
- [静态 HTTPS 请求计费](https://help.aliyun.com/zh/cdn/product-overview/billing-of-https-requests-for-static-content)
- [acme.sh 阿里云 CDN 部署钩子](https://github.com/acmesh-official/acme.sh/blob/master/deploy/ali_cdn.sh)（流程参考；本项目使用官方阿里云 SDK 适配 ECS 临时凭据）
