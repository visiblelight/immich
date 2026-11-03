# 生产发布、维护与恢复

本指南描述当前机制，不是执行生产写入的授权。发布前仍要确认用户已要求发布该具体改动。普通 Gallery 更新不升级 Immich，不重启全站，也不导入本地数据。

## 1. 实际拓扑与私有配置定位

| 项目 | 位置/入口 |
|---|---|
| 前台 / 后台 / Immich | `https://vision.ke` / `https://admin.vision.ke` / `https://immich.vision.ke` |
| 日常维护 SSH | 本机 `~/.ssh/config` 的 `aliyun-ecs`；私钥不在仓库 |
| Gallery / Immich 源码 | `/root/work/immich`；历史 `/srv/vision/repository` 为兼容入口，操作前核对实际指向 |
| 运行项目 | Docker Compose project `vision`，配置 `deployment/gallery/cloud/compose.yml` |
| 数据 | `/srv/vision/data/database`、`library`、`articles`、`model-cache` |
| 私有环境 | `/srv/vision/secrets/compose.env`、`public.env`、`admin.env`、`immich.env`、`migration.env` 等，保持私有权限 |
| 当前/上一应用 | `/srv/vision/releases/current`、`previous`，记录 SHA 与镜像 digest |
| 回环服务 | public `127.0.0.1:3200`，admin `127.0.0.1:3201`，Immich `127.0.0.1:2283` |
| 公共 HTTPS 入口 | 独立私有仓库 `visiblelight/edge`，服务器 `/root/work/edge`，状态与配置 `/srv/edge` |
| 网络 | `vision-data` 隔离数据服务，`vision-edge` 接 Edge；不能公开数据库端口 |
| OSS 同步 | `/etc/gallery/media-sync.json`、`/var/lib/gallery-media`；代码/安装入口 `deployment/gallery/cloud/media/` |
| CDN 证书 | `/etc/gallery/cdn-certificate.json`、`/var/lib/gallery-certificate`；代码 `cloud/certificate/` |
| 拍摄时间维护 | `/opt/gallery-capture/`、`/var/lib/gallery-capture`；代码 `cloud/capture/` |
| 访问统计 | 独立 `gallery-analytics` Compose；`deployment/gallery/cloud/analytics/`，单独数据库/备份 |

`edge-proxy-1` 占主机 80/443，其他项目（如 JVS）共用该入口。不要为 Gallery 把入口配置改进 JVS 仓库，不运行整机 `docker compose down` 或全容器重启。

**凭据职责**：Gallery public/admin/community 用不同受限数据库角色；迁移/owner 凭据只用于维护。DirectMail 使用 RAM 用户 `gallery-mail` 的专用 AccessKey，仅有 `dm:SingleSendMail`；域名 `ke.ink`，发信人 `vision@ke.ink`，显示名“光与远方”。OSS/CDN/证书使用另行配置的 ECS RAM 身份和策略，不复用发信 Key。地图加密密钥、验证码 HMAC secret、CDN 签名密钥、ACME 状态都需私有恢复，不记录实际值。

## 2. 接手时的只读检查

以下命令只读取状态；SSH alias 不存在时先恢复连接配置，不能猜服务器或主机公钥：

```sh
ssh aliyun-ecs 'cat /srv/vision/releases/current'
ssh aliyun-ecs 'docker ps --format "{{.Names}}\t{{.Status}}\t{{.Ports}}"'
ssh aliyun-ecs 'df -h /srv/vision'
ssh aliyun-ecs 'systemctl list-timers --all "gallery-*" --no-pager'
ssh aliyun-ecs 'curl -fsS http://127.0.0.1:3200/health/ready'
ssh aliyun-ecs 'curl -fsS http://127.0.0.1:3201/health/ready'
```

数据库维护连接只读查询 `gallery.schema_migration` 的版本、名称和校验和，不输出配置文件/连接串。日志可能包含用户内容，排查时只取所需错误摘要，不能整份粘进公共文档。

`systemctl` 的 oneshot 服务在执行中可能是 **activating**，不是 inactive。暂停采集或迁移前检查 `ActiveState` / `SubState` 和实际进程/锁；仅用 `is-active --quiet` 可能漏掉运行中的任务。

## 3. 普通应用发布

1. 读取当前交付文档、工作区 diff，确认只包含用户接受的功能，保留无关修改。运行与改动相应的检查；涉及数据库/GPS/媒体/公开资格的修改需要隔离数据库回归和数据保护证据。
2. 检查迁移、Compose 和维护脚本是否变化。**推送产品分支可能自动部署**；有新增迁移或新运行配置时，必须先完成专门的备份、迁移和配置准备，再触发普通发布。不要先 push 再想数据库怎么迁。
3. 用中文标题和详细中文正文提交：说明问题、主要改动、验证结果、兼容性和回退。只暂存本次文件/片段；用户的 mise.lock 或开发覆盖文件不得混入。
4. push 到 `origin codex/gallery`。检查 `.github/workflows/gallery.yml` 的 foundation、image、deploy 全部完成，不以 push 成功代替上线成功。
5. 服务器核对 `/srv/vision/releases/current` 的 SHA/digest、两个 readiness 和代表页面；专项功能做真实受限验证。检查任务恢复、业务关联与 Immich 数据保护，按需下载输出副本验证。
6. 发布完成后再更新交付记录和当前状态。不要在部署尚未完成时抢先推一个新文档提交，部署器会核对远端分支 HEAD，可能拒绝已经落后的候选 SHA。

GitHub CLI 明确指定 fork，避免 gh 自动选择 Immich 上游：

```sh
gh run list -R visiblelight/immich --workflow gallery.yml --limit 5
gh run view RUN_ID -R visiblelight/immich
gh run watch RUN_ID -R visiblelight/immich
```

不要为解决普通发布问题关闭测试、角色校验、Origin 校验或迁移校验和检查。未成功的阶段必须如实说明。

### CI 和服务器发布器做了什么

- 根工具链锁定、Gallery 过滤安装、doctor/check/test/build/smoke 和云证书测试。
- 只有精确产品分支 `codex/gallery` 的合格推送构建发布镜像；PR/其他分支不发布生产。
- 镜像写入 `ghcr.io/visiblelight/gallery`，应用以不可变 digest 部署，不依赖浮动 latest。
- 仓库变量 `GALLERY_DEPLOY_ENABLED=true` 及 production 环境的 `GALLERY_DEPLOY_HOST/USER/KEY/KNOWN_HOSTS` 控制部署。
- 受限 SSH 用户 `gallery-deploy` 不加入 docker 组；强制命令 `/usr/local/sbin/gallery-ci-dispatch` 调用 root 拥有的 `/usr/local/lib/gallery/deploy.sh`，只接受合法 SHA 与固定镜像仓库 digest。不是可复用的通用管理 shell。
- 检查远端分支、镜像 revision、迁移校验和及拓扑；普通流程只更新 public/admin，readiness 失败尝试恢复旧应用。
- **CI 不执行数据库迁移、Immich 升级或任意 Compose 拓扑变更**。受限部署脚本本身的更新也是单独维护动作。

纯 docs 目录修改通常不触发 Gallery workflow；根指令文件是否触发以实际 paths 条件为准，文档交付不能声称重新部署了应用。

## 4. 数据库和维护任务变更

Gallery 迁移只新增下一编号文件，同时更新数据字典；执行过的 SQL 不修改。迁移器检查身份、校验和、顺序，使用 advisory lock 和逐迁移事务。

发布前的专项步骤：检查余量和备份 → 隔离库应用/回归 → 暂停受影响写入任务并确认它已退出 → 用专用 migrator 应用 → 验证结构和受限角色 → 更新相关维护文件 → 恢复此前任务 → 发布兼容应用 → 验证数据和媒体未被改写。不同迁移对在线写入的要求不同，不把此流程当作允许直接修改 production 数据。

时间采集的 `install.sh`、服务文件和 worker 位于源码中，但运行副本在 `/opt/gallery-capture`；普通容器发布不会自动更新所有宿主脚本。OSS/证书同理，修改维护代码时必须核对已安装版本，不能只看 Git。

- `gallery-capture.timer`：约 15 秒调度队列，全量扫描约 10 分钟；只读原片，写 Gallery 证据和队列。失败查看对应 service 状态和 journal。
- `gallery-media-sync.timer`：维护允许清单与 OSS 副本。签名约 300 秒、清单新鲜度约 180 秒、回收有宽限；以当前代码为准。清单/同步账本丢失会影响撤销与回收，须随配置备份。
- `gallery-certificate.timer`：CDN 免费证书签发续期；独立 Edge 入口的证书不等同于此任务。
- `gallery-metadata-guard.service`：限制不应访问云实例凭据的运行身份；不能为调试移除保护。

各任务的安装、锁、路径和恢复详情见 [capture](../../../deployment/gallery/cloud/capture/README.md)、[media](../../../deployment/gallery/cloud/media/README.md)、[certificate](../../../deployment/gallery/cloud/certificate/README.md)、[RAM](../../../deployment/gallery/cloud/ram/README.md)。

## 5. 备份与回退：必须区分四类

| 操作 | 合理边界 |
|---|---|
| 只回退 Gallery 应用 | 使用匹配的旧 SHA/digest/config；兼容新增列可保留，避免回滚整库丢失上线后的用户内容 |
| 撤销某张照片时间校正 | 用 Gallery 可撤销确认/停用机制，不改 Immich EXIF，也不整体恢复数据库 |
| Immich 版本回退 | 恢复匹配源码/镜像、数据库、媒体与配置；不能只把 v3.3.3 镜像改成旧版打开已迁移数据库 |
| 灾难恢复/换服务器 | 完整数据库+角色+全部媒体+文章素材+密钥+任务状态+Edge/域名配置，先隔离验证，再切换入口 |

`/srv/vision/releases/previous` 会随以后发布改变，不是永久指向某个版本。记录本次上线前后的具体 SHA 和备份位置，不依赖模糊的“上一版”。

### 现有备份脚本的局限（2026-11-03 代码审阅）

`deployment/gallery/cloud/backup.sh` 会创建新私有目录，导出数据库，归档 library/articles/配置，另对媒体同步和证书状态加锁，记录镜像和校验和。它只暂停此前运行的 `admin`、`immich-server`、`immich-machine-learning`，结束时尝试恢复这些服务。

**它尚未覆盖后来增加的 public 用户互动写入、capture 时间任务，且不导出全局角色。** 不能直接把“脚本成功”表述成当前所有业务完全停写、可在全新集群恢复的完整证明。需要维护时另行明确停写范围、暂停/等待维护任务、导出角色并记录运行状态，再恢复原先任务；应专门修订脚本和验证后才作为自动例行方案。本次只记录缺口，没有改动脚本或运行备份。

同盘 `/srv/vision/backups` 只是恢复检查点，不是异机灾难恢复。未验证持续异机备份配置，不得声称已具备。旧备份恢复会丢失之后新增业务，恢复前明确范围；备份复活的已退出会话应撤销。

## 6. 不应凭记忆执行的操作

- 不运行忽略目录中历史一次性 `production-*` 脚本来完成新部署：它们可能固定旧 SHA、备份路径、SQL 和时间。
- 不以修复 GPS/时间为由写 Immich asset_exif、重写原片、缩略图、preview 或重建业务照片关联。
- 不把本地开发库、用户注册测试数据或设计样稿导进生产。
- 不在容量紧张时直接清理所有旧镜像、备份或 OSS 对象。先证明仍有可用恢复副本，明确删除范围。
- 不把整机服务重启作为 Gallery 故障的默认解决办法。
