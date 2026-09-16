# 全新 ECS 部署

与已有 HTTPS 入口共用服务器；不导入本地测试库或媒体。`compose.yml` 使用已验证的 Immich v3.2.0 server／PG14／Valkey，机器学习镜像另行填写同版本固定摘要。Gallery 镜像标签采用实际产品提交，禁用设计样例。

1. 将 `compose.env.example` 复制到仓库外的受保护目录，生成独立随机密码。Immich 环境文件设置 DB_HOSTNAME=database、DB_USERNAME=postgres、DB_DATABASE_NAME=immich、DB_PASSWORD、REDIS_HOSTNAME=redis 和 IMMICH_MACHINE_LEARNING_URL=http://immich-machine-learning:3003。Gallery public/admin 各自只接收受限角色 URL、来源衍生图根、共享地图加密密钥；后台在可信单层代理后设置 ADDRESS_HEADER=x-forwarded-for、XFF_DEPTH=1。
2. 创建数据目录与 `vision-edge` 外部网络；将已有代理连接至 edge 网络，并在其 Compose 中持久化网络声明。数据库只接 vision-data 网络；Gallery 只挂载 thumbs 与独立文章素材。文章目录给 node UID 1000 写权限。
3. 构建 Gallery 镜像，启动 database、redis、immich-server、immich-machine-learning。Immich 管理员首次注册应先在本机回环入口完成，再开放公网。
4. 使用临时容器和专用管理环境依次执行 `packages/gallery-db/scripts/database.ts bootstrap`、`migrate`；用 `account.ts create` 创建独立 Gallery 管理员，再用 `initialize-site.ts` 创建空站点，最后显式 `source-enable` 正式 Immich 管理员 UUID。运行容器不传 bootstrap／migrator 凭据。初始密码通过 0600 文件传入，不放在命令参数中。
5. 启动 public/admin，检查 `/health/ready`；未初始化时 503 是预期行为。
6. `render-proxy.py` 根据三个可变 origin 生成 Nginx 虚拟主机；先用 `--http-only` 开放 ACME 路径，签发证书后生成完整配置。对现有模板与生效配置做备份，仅替换 `BEGIN/END GALLERY MANAGED VHOSTS` 标记区块；`nginx -t` 成功后 reload，失败则恢复原文件。已有代理的证书续期任务继续负责新证书。
7. 使用正式域名验收登录、来源校验、照片上传／衍生图／选片／发布、文章媒体、下线撤销和原有项目可用性，最后创建整库、媒体及独立配置备份。异机备份目的地需另外配置，不把同盘备份当作灾难恢复。

根目录入口 `gallery:site:init` 可用于站点初始化。它仅接受已存在的 active 管理员，拒绝覆盖已有站点；这是全新部署工具，不使用绑定本地开发容器的 `initialize-local.ts`。

示例（渲染不修改服务器）：

```sh
python3 deployment/gallery/cloud/render-proxy.py \
  --public-origin https://vision.ke --admin-origin https://admin.vision.ke \
  --immich-origin https://immich.vision.ke --certificate-name vision.ke
```

上线记录与实际验证边界见 `docs/gallery/delivery/cloud-launch.md`。

一致性检查点使用 `sh deployment/gallery/cloud/backup.sh /absolute/compose.env /absolute/new-backup-dir`。脚本只短暂停止本项目原本运行的写入服务，成功或失败均尝试恢复；目标目录必须尚不存在。备份包含凭据，保持私有权限，导出目的地应明确授权。此脚本不自动安排周期，也不把同盘副本当作异机备份。
