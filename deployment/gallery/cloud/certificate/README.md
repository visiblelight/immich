# 免费 CDN 证书自动化

实现状态：脚本及本地测试完成，云端安装、签发、续期和公网部署尚未验收。

证书明确使用 Let's Encrypt，acme.sh 固定版本 3.1.5 / `d5fc938d80e266dba3239f54cf4665432f17c00b`。不购买阿里云付费证书或托管续期。阿里云 HTTPS 请求数、DNS/OSS/CDN 资源自身仍按其计费规则执行。

## 权限与 DNS

1. 在免费版阿里云 DNS 单独管理 `acme-cdn.ke.ink`。主、子域均在阿里云时按照控制台和官方子域管理流程完成托管，不盲目手填其他子域的 NS。
2. 添加 `_acme-challenge.cdn.ke.ink CNAME _acme-challenge.acme-cdn.ke.ink`。仅用于证书验证，不改变 `cdn.ke.ink` 的 CDN CNAME。
3. ECS 的 `GalleryMediaSyncRole` 绑定 `../ram/ecs-certificate-policy.json`。DNS 权限限定到验证子域，证书更新限定到 CDN 域名，不授予整个 `ke.ink` 或 IAM 权限。
4. 脚本使用官方 Credentials SDK 的 `ecs_ram_role`，强制 IMDSv2，不接受长期 AccessKey 回退。临时凭据仅在 SDK 内使用，不打印。
5. 实例角色对能访问元数据的进程可见。生产绑定前须启用并验证下述元数据隔离。证书任务在宿主机由无登录权限的专用 Unix 用户运行，不授予它 sudo 或 Docker 权限。

## 实例角色隔离

`gallery-metadata-guard.service` 在独立 nftables 表中拒绝转发到 `100.100.100.200` 的请求，防止桥接网络容器取得宿主机角色凭据。它不修改 Docker NAT 表、不影响正常公网请求，也不限制宿主机的证书任务。启用后成为 Docker 的启动前置依赖；规则独立于 Docker 链，在 Docker 重启期间仍保留。证书与未来媒体同步任务在宿主机执行，不向网页应用容器分发云凭据。

启用前检查现有容器没有宿主网络、特权模式及元数据业务依赖；这些隔离不能防止宿主机 root 或特权容器主动绕过。当前生产容器均为非特权桥接网络，尚未启用规则。部署需先执行 `nft -c -f /opt/gallery-certificate/metadata-guard.nft`（首次安装时表不存在），再执行 `systemctl enable --now gallery-metadata-guard.service`。之后验证宿主机 IMDSv2 可用、应用容器访问被拒绝，以及各站点正常，最后才绑定实例角色。

安装脚本只放置文件，不自动启用规则。回退隔离前应先解绑实例角色并等待旧临时凭据失效，再禁用服务及删除它自己的 `inet gallery_metadata_guard` 表；禁止清空整机 nftables 规则。新增依赖元数据的项目应单独评审身份方案，不能直接放开所有容器。

## 安装与首次签发

从已提交并推送的服务器 Git checkout 执行：

```sh
sh deployment/gallery/cloud/certificate/install.sh
# 按上节启用并验证元数据隔离，再绑定 ECS 角色。
# 检查 /etc/gallery/cdn-certificate.json，配置只含域名、角色名、目录和账户邮箱。
runuser -u gallery-certificate -- /opt/gallery-certificate/run.sh issue-staging
runuser -u gallery-certificate -- /opt/gallery-certificate/run.sh issue
systemctl enable --now gallery-certificate.timer
```

首次注册 ACME 账户需要域名所有者同意 Let's Encrypt 条款。staging 使用单独的状态目录，永不上传到生产 CDN；正式上传前使用系统根证书校验证书链、准确域名、私钥匹配和剩余有效期，拒绝测试证书及即将过期的证书。

`install.sh` 只安装，不签发、不授予云权限、不启用计时器、不修改 Edge 或 JVS。若服务器缺少 Python venv 支持，先通过操作系统官方软件源安装对应 Python venv 包；不能改动系统 Python。Python 依赖明确从官方 PyPI 安装，避免服务器预设镜像缺少锁定版本。状态使用独立的 `/var/lib/gallery-certificate`，不要求专用用户访问仅 root 可读的 `/srv/vision`。

## 自动运行及故障处理

- systemd 每日两次检查续期，增加随机延迟；使用 `flock` 避免并行签发。
- 每次检查都会重试 CDN 部署，即使当天没有生成新证书，也能恢复此前部署失败。
- 只有公网 TLS 验证成功且指纹匹配才更新 `/var/lib/gallery-certificate/status.json`。该文件不包含私钥或凭据。
- SDK 错误仅输出错误类型及安全的错误码，不输出可能含请求签名或私钥的完整异常。
- 部署失败时不主动关闭 HTTPS 或删除现有 CDN 证书。阿里云配置提交后仍需等待边缘节点传播；单个公网探测点通过不等于全球节点验收完成。
- `systemctl status gallery-certificate.service` 与 journal 显示执行失败。尚未接入站外通知渠道，不能宣称已具备邮件/短信告警；需持续监测任务失败和公网证书有效期。

手动重试部署（不重新签发）：

```sh
runuser -u gallery-certificate -- /opt/gallery-certificate/run.sh sync
```

停止自动运行：`systemctl disable --now gallery-certificate.timer`。已在 CDN 生效的证书不会因此立即失效，但到期前必须恢复续期。配置及证书状态目录应纳入私有备份，不写入仓库。

## 测试

使用 Python 3.11+ 私有 venv 安装 `requirements.lock` 后：

```sh
GALLERY_CERT_PYTHON=/path/to/venv/bin/python sh deployment/gallery/scripts/pnpm.sh gallery:test:cloud
```

本地单元测试覆盖域名与密钥校验、拒绝不可信链、保留其他 TXT 记录、CDN 部署重试、失败不写成功状态。完整验收还需真实角色、DNS-01 staging 签发、生产签发、CDN 公网证书和定时任务运行。
