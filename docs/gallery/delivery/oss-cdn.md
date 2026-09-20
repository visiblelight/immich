# OSS / CDN 接入记录

状态：资源核查已完成第一轮；Gallery 同步与 CDN 读取尚未实现，尚未切换生产图片。2026-09-20。

## 已确认的产品边界

- 仅同步 Gallery 已公开内容使用的展示图及文章图片，不同步 Immich 原片、家庭私密照片和未发布草稿素材。
- Immich 的 Thumbnail 短边 1080、Preview 短边 2160；Gallery 继续清理图片隐私元数据，不重编码像素。ECS 保留来源图，OSS 保存公开展示副本。
- 公开媒体入口签发 CDN 地址前仍检查发布祖先、当前版本成员、来源范围、资源状态和路径。私有 Bucket 回源授权不能替代访客 URL 鉴权。
- 用户接受撤销后的旧签名地址最多继续有效 5 分钟；停止签发新地址，并异步清理不再被公开内容引用的对象及缓存。已下载的图片无法收回。
- 用户要求使用免费 Let's Encrypt 证书并自动续期；已在说明 HTTPS 请求费区别后确认继续使用阿里云 CDN 现有计费，不购买付费证书。

## 2026-09-20 实际核查

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

本地已实现 [证书自动化脚本](../../../deployment/gallery/cloud/certificate/README.md)：固定版本 acme.sh、ECS 角色临时凭据、独立 DNS 验证子域、可信证书链及私钥匹配校验、CDN 部署重试与公网指纹验证。8 项单元测试已通过，CI 已配置对应测试步骤；尚未在服务器安装、签发或启用定时任务，也未验收真实云侧鉴权。

用户已明确批准验证子域委派、限定范围的角色创建与绑定、CDN 展示目录只读回源。实际完成：

- 创建免费 DNS 子域 `acme-cdn.ke.ink`，完成所有权校验，添加 `_acme-challenge.cdn.ke.ink CNAME _acme-challenge.acme-cdn.ke.ink`。公网查询确认别名生效，子域 NS 为 `ns1.alidns.com`、`ns2.alidns.com`。
- 创建 `GalleryMediaSyncRole`（仅信任 ECS），绑定 `GalleryMediaSync` 和 `GalleryCdnCertificate` 两项自定义策略，尚未绑定 ECS 实例。
- 核查此前已存在的 CDN 默认角色，移除其全账号 OSS 只读系统策略，改为 `GalleryCdnOriginRead`，仅可读取目标展示目录。变更前已确认账号内另外三个 CDN 域名的私有回源开关均关闭，未改动它们的配置。
- `cdn.ke.ink` 私有回源已开启，使用同账号 STS，不创建 RAM 用户或长期 AccessKey。
- 服务器只读核查：现有应用容器均为非特权桥接网络；准备了独立 nftables 元数据隔离服务，尚未安装启用。

1. HTTPS 计费已确认；完成证书自动化方案，先完成免费证书签发与 CDN 部署，再验证 TLS。
2. 建立只允许 CDN 读取目标 Bucket 展示目录的角色；避免默认一键授权的全账号 OSS 只读范围。ECS 同步角色仅允许目标目录的必要对象操作，不使用主账号 AccessKey。
3. 配置 300 秒 URL 签名鉴权。边缘节点缓存时间和 URL 授权时长分开设置；不能让浏览器缓存、过期内容策略或失败降级绕过撤销边界。
4. 实现发布内容同步、内容版本对象名、失败重试、失效清理及受控 CDN 地址签发。多相册复用照片时，仅在所有公开引用撤销后回收。
5. 未同步成功时继续走既有 ECS 授权媒体入口；后台私有选片与草稿预览保持认证要求。
6. 验证有效签名成功、无签名/篡改/过期签名拒绝、源站匿名拒绝、缓存命中、图片像素不变及撤销后的 5 分钟边界；再通过项目 CI 发布。
7. 回滚关闭 CDN 读取并恢复 ECS 授权入口；不删除 Immich 本地图像。云权限、证书任务及缓存清理分别记录实际实施结果。

回源、同步及证书更新的具体权限见 [RAM 权限说明](../../../deployment/gallery/cloud/ram/README.md)。证书 DNS 验证采用独立子域委派，避免给 ECS 整个 `ke.ink` 的解析管理权限；权限策略已创建，实际对象访问及证书 API 尚待验收。

## 官方依据

- [私有 OSS 回源及授权范围](https://help.aliyun.com/zh/cdn/user-guide/grant-alibaba-cloud-cdn-access-permissions-on-private-oss-buckets)
- [URL 鉴权与缓存参数处理](https://help.aliyun.com/zh/cdn/user-guide/configure-url-signing)
- [静态 HTTPS 请求计费](https://help.aliyun.com/zh/cdn/product-overview/billing-of-https-requests-for-static-content)
- [acme.sh 阿里云 CDN 部署钩子](https://github.com/acmesh-official/acme.sh/blob/master/deploy/ali_cdn.sh)（流程参考；本项目使用官方阿里云 SDK 适配 ECS 临时凭据）
