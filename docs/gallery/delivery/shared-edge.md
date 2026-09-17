# 独立 Edge 与自动发布

需求已确认，2026-09-17：本地修改 JVS 后经其 Git 维护线发布；在同级 projects/edge 建立独立入口仓库；服务器代码统一到 /root/work；后续业务各自发布、共同使用 Edge。Git 项目邮箱改为 visiblelight@gmail.com，保留历史提交。

## 已完成的入口迁移

- 本地 Edge 位于 projects/edge，独立私有仓库 visiblelight/edge，服务器代码 /root/work/edge、证书与 ACME 状态 /srv/edge。Compose 项目名 edge。
- 只有 edge-proxy-1 发布宿主 80/443。它分别连接 jvs-edge 和 vision-edge，数据库仍分别在 jvs_default 和 vision-data。JVS 的 nginx-edge 不发布宿主端口，网络别名 jvs-web。
- JVS 通过本地 codex/shared-edge 开发分支、中文提交及 main 快进发布到 77a421c；正式 GitHub Test & Deploy 流水线 35178989982 测试与部署均成功。旧模式保留，生产 .env 设置 DEPLOY_MODE=edge。
- 之前服务器上的两份 JVS 临时改动经逐项核对后撤销，再通过 Git 检出正式提交；服务器受控文件无未提交改动。备份在 /srv/vision/backups/edge-handoff-20260917。
- 首次交接与四域名 HTTPS 检查合计约 42 秒。旧 nginx-plan1 和 certbot 容器停止保留；旧证书卷未删除，以便回退。Edge 使用独立证书副本，不依赖 JVS 数据卷。
- Gallery 代码迁至 /root/work/immich；/srv/vision/repository 暂留兼容符号链接，不是第二份代码。照片、数据库、配置和备份位置均保持不变。

## 发布控制

- Gallery workflow 在 codex/gallery 上先检查、测试和构建，再发布 GHCR 固定摘要镜像；production 环境配置专用 SSH Secrets，GALLERY_DEPLOY_ENABLED 已启用。
- 专用非 root 用户 gallery-deploy，不加入 docker 组。公钥被 restrict 与强制命令限制，仅有 sudo 调用 /usr/local/lib/gallery/deploy.sh 的权限；实际 SSH 执行 id 被拒绝。
- 部署脚本、强制入口由 root 拥有。发布只更新 Gallery public/admin，不升级 Immich、不运行数据库迁移；新增迁移或 Compose 变化要求另行审查。健康失败时尝试恢复前一应用版本，不声称能自动回滚数据。
- Edge 自身 CI 校验配置，入口变更通过独立维护发布及 scripts/apply.sh；业务 CI 不改 Edge。
- Gallery 首次完整 CI 验收为 workflow_dispatch 运行 35179172811，检查、GHCR 镜像构建与生产部署均成功。部署应用提交 ad33eecf96920ef710fe5026cb5d93af236ebab3，镜像摘要 sha256:b533164880797c043319cce6ab1152b106521ff28bea4dd9d9a772534b8383f5；此为本次验收版本，之后实际版本以 /srv/vision/releases/current 为准。

## 验证结果与边界

- JVS 本地后端 117 项测试通过；Gallery doctor/check 通过且 Svelte 零错误零警告；Edge 配置渲染与非法输入测试通过，Compose 和 Shell 检查通过。
- JVS 的正式 CI 完成更新后，Edge 仍为原运行实例，Gallery/Immich 公网正常。尚未通过停止整个数据库栈制造停机来验证隔离。
- Gallery CI 实际仅更新 public/admin；Edge、JVS Web、Immich 和数据库保持原实例/运行时间，六个 vision 服务均健康。更新后再次完成下述公网回归。
- 正常公网 HTTPS 验证 JVS 首页和 mobile、Gallery 五个一级页、后台登录页及 Immich；两套实际登录/API/退出成功，后台拒绝不可信 Origin。
- 独立 Edge 的 Certbot renew --dry-run --no-random-sleep-on-renew 验证通过，覆盖 jvs.ke.ink 及 vision.ke 三域名证书。正式证书没有被测试证书替换。
- 配置失败恢复脚本已提供，未在生产故意破坏配置或数据库执行恢复演练。持续异机备份及 OSS/CDN 不属于本轮。
