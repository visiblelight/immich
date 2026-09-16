# 首次云端部署准备

状态：2026-09-16 已完成香港 ECS 全新部署、正式域名 HTTPS 与业务验收；OSS/CDN、持续异机备份及手机真机验收另行推进。

## 已确认范围

- Gallery 前台主域名为 `https://vision.ke`，后台为 `https://admin.vision.ke`，Immich 为 `https://immich.vision.ke`。
- 云端使用全新的数据库、账号和媒体目录，不迁移本地测试照片、相册、文章、账号或密钥。本地环境继续保留。
- 第一阶段使用 ECS 本地存储与 Gallery 媒体接口；OSS 同步和 CDN 分发作为下一阶段独立实现。
- 与另一 Docker Compose 项目共用 ECS。应复用实际部署的反向代理入口，并在核对现有端口、网络和目录后配置域名路由。
- 目标服务器已确认为本机 SSH 别名 `aliyun-ecs` 对应的香港节点。

## 域名配置与变更

域名不是代码常量。正式部署在仓库外的 Compose 参数文件设置：

```dotenv
GALLERY_PUBLIC_ORIGIN=https://vision.ke
GALLERY_ADMIN_ORIGIN=https://admin.vision.ke
```

Compose 将它们传入 public/admin 服务及各自的 `ORIGIN`；反向代理另行配置三个域名及证书。变更时同步修改 DNS、代理、环境配置，重新创建受影响的容器，并验证后台登录、链接生成和公开媒体。普通内容编辑权限不应允许修改可信登录来源，因此这些属于部署配置，而非后台站点文案字段。

备用前台域名建议由代理跳转到主域名，保留路径与查询参数。当前未实现多个前台域名并列作为主站的产品配置；如以后要求多个域名直接浏览，再单独处理链接规范、SEO 与来源校验。不要关闭后台 Origin 校验来接入备用域名。

## 上线前工作

1. 核对并保留现有 `mise.lock` 本地改动，不将其混入部署提交；冻结产品分支的部署提交与镜像版本，`main` 继续作为上游镜像。
2. 重新构建 Gallery 容器，确认包含迁移、全新初始化脚本及文章素材支持；初始化使用一次性管理凭据，常驻服务仅使用各自运行角色。
3. 在确认目标 ECS 后，只读核对已有项目、80/443 入口、磁盘、内存和网络，再制定服务器具体部署文件。
4. 推送产品分支，核对 GitHub 检查；服务器以明确提交和镜像版本部署。Immich 使用已隔离验证的版本，不在此次上线中顺带追踪上游新版本。
5. 初始化云端 Immich 和 Gallery 的正式管理员、站点、来源所有者白名单与最新 Gallery 迁移；配置独立文章素材目录、随机生产密钥和备份。
6. 正式域名验证两套登录、上传生成展示图、选片发布、文章插图、地图、下线撤销及重启恢复。上线验证产生的测试内容与本地测试数据迁移不是一回事。

## 上线前检查发现

- Gallery 镜像原先只复制部署目录中的 TypeScript 配置，遗漏 `database.ts bootstrap` 依赖的 `deployment/gallery/database/bootstrap.sql`。已补充精确的构建允许列表与 COPY；不把运行凭据或本地数据库加入镜像。
- 现有 `mise.lock` 差异是部分 FFmpeg 工具平台锁定条目的删除，不是本次部署所需改动，保持原样。
- 已只读核对目标 ECS：Ubuntu 26.04.1、x86_64、约 7.5 GiB 内存，系统分区约 79 GiB、可用约 69 GiB。现有另一项目通过容器 Nginx 占用 80/443；应复用该入口，不能直接安装模板中的第二个 Caddy 入口。
- 初次检查时主域名解析到另一 IP，两个子域名未配置；用户随后完成 DNS，公共解析和服务器刷新缓存后均指向目标 ECS。
- 本地候选镜像 `gallery:cloud-preflight` 构建成功；容器内验证 bootstrap SQL、10 个 SQL 迁移、两个应用构建、非 root 运行及未包含 `.gallery-local`。只读挂载现有冒烟脚本后，前后台在生产／设计开关两种状态下启动检查通过；无数据库时 readiness 为 503 是预期结果，不表示生产已就绪。
- 上述本机预检只覆盖 arm64；随后在 ECS 独立完成下述 amd64 构建和实际部署。

## 已部署版本与目录

- 应用版本：`d43e36153`，镜像 `gallery:d43e36153`，在 ECS 原生 amd64 构建。镜像摘要 `sha256:115884a68ab8fe4c8f8e5b6f6a36e1f755a7f577e10c0fcc9280b5f8cf244a48`。该提交及前一提交的 GitHub Gallery 检查均成功。
- Immich server、PG14 与 Valkey 使用 cloud Compose 固定摘要；机器学习为 v3.2.0 固定摘要 `sha256:f8b2869891c861a58dde969d86e7ea8a186e6059a55886632ee3249e51fb574a`。未升级其它项目的数据库或服务。
- 仓库位于 `/srv/vision/repository`；数据位于 `/srv/vision/data`；独立配置在 `/srv/vision/secrets`（私有目录，文件 0600），不进入 Git。Compose 项目名 `vision`，内部数据网络 `vision-data`，共用代理网络 `vision-edge`。
- 复用原项目的 `jvs-nginx-plan1-1`。其 Compose 持久化了额外网络，Nginx 模板与生效配置追加有标记的 Gallery 虚拟主机；修改前分别备份至 `/srv/vision/backups/proxy-20260916T034302Z`、`proxy-20260916T040954Z`。每次修改经过 `nginx -t` 后 reload，未重建原项目容器。
- 三域名共用新签发的证书，初始到期时间 2026-12-15；接入原有 Certbot 续期和 Nginx 每 12 小时证书重载机制。未进行一次新的 ACME 续期演练。
- 独立管理员与来源白名单已初始化，Gallery 0001–0010 全部应用。初始凭据单独交付，不记入文档。Immich 首次浏览器登录仍显示用户引导，可由用户选择个人偏好。
- Immich 已通过官方配置 API 设置 thumbnail size=1080、preview size=3840 和正式外部域名。Gallery 保持引用衍生图，无原片公开路径。

## 本次验收

- ECS 内最终镜像前后台启动冒烟通过，随后六个 vision 容器均健康；数据库不对宿主发布端口，Gallery 只读挂载 thumbs，文章目录单独授权 node 用户写入。
- 新站点初始化工具成功创建空站点，再执行时拒绝覆盖；后台独立登录、Secure／HttpOnly／SameSite=Strict Cookie、不可信 Origin 拒绝均通过。
- 使用本次新生成的合成 JPEG 验证：Immich 上传、衍生图生成、Gallery 选片、草稿保存、相册发布、照片直达页、公开图片去除 EXIF、下线后媒体返回 404。
- 使用新上传文章素材验证：富文本文章发布、公开插图读取及文章下线后插图返回 404。未使用本地开发数据。
- 验收产物按记录的固定 UUID 清理，核对正式库 Immich Asset、Gallery Album／Photo／Article／Article Media 均为 0。文章发布引用保护阻止普通删除，因此仅由迁移角色在同一事务中暂时关闭对应触发器、删除指定合成记录、恢复触发器；提交后再次确认三个保护触发器启用。未修改 Immich 数据表，测试 Asset 通过官方删除 API 清理。
- 公网 Chromium 验证五个前台页面、后台登录及空相册、Immich 实际登录表单；无页面脚本错误。新 DNS 曾有缓存延迟及本机短暂 TLS 连接失败；对照直连及后续正常浏览器重试通过。未修改本机代理配置。原有项目 HTTPS 保持 200。
- 公网截图在本机忽略目录 `.gallery-local/cloud-launch/`；业务验收结果在服务器 `/srv/vision/verification/`，不提交真实账号或 UUID 清单。

## 备份与后续

- 使用 `deployment/gallery/cloud/backup.sh` 对新项目短暂停写，生成 `/srv/vision/backups/initial-20260916`，随后恢复全部原本运行的写入服务。包含整库 dump、媒体、私有配置、代码提交及镜像清单；SHA-256 全部校验通过。此为服务器同盘检查点，不等同于异机灾难恢复。
- 用户明确授权后，已将初始化备份复制到本机项目私有目录 `.gallery-local/backups/cloud-initial-20260916`，目录 0700、文件 0600；数据库、媒体、配置、提交与镜像清单的 SHA-256 全部匹配。该目录被 Git 忽略，不进入提交。这是一次性的异机副本；定时备份、持续异机保存和实际云端恢复演练仍待安排。
- 系统分区实际约 79 GiB，本次安装后剩余约 62 GiB；完整导入约 60 GB 原片前需重新安排容量，给衍生图、数据库、文章与备份留出空间。
- OSS/CDN、Google／高德真实 Key、真机移动备份和大图库性能属于后续阶段，不能由本次验收替代。
