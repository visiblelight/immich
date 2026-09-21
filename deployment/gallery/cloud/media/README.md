# Gallery 公开图片 OSS / CDN

此目录维护宿主机同步服务。图片来源依然是 Immich 衍生图或 Gallery 文章素材，云副本可重建，不更改业务表，不新增数据库权限。

## 链路与撤销边界

- 每轮通过 `docker compose exec public` 使用前台的只读数据库角色，从 `published_media` / `published_article_media` / `published_article_photo_media` 枚举候选。逐项复用既有读图函数检查当前发布、祖先、来源范围、资源状态及可信路径。文章引用的 Gallery 照片使用文章专用媒体入口，逐项校验当前文章引用与来源相册；隐藏作品不会因此获得相册媒体访问权限。
- Immich Thumbnail / Preview 清理隐私元数据，保留压缩像素、ICC 和尺寸；不读原片、不重新压缩。文章上传图使用既有已处理的 WebP。仅内存管道传送展示字节，不另落一份暂存图片。
- SHA-256 内容对象名 `gallery/v1/<digest>.jpg|webp`，跨相册与相同字节复用。仅在对象缺失/内容元数据不匹配时上传；每轮 HEAD 检查已同步对象。
- 前台继续请求自身 `/media/...`。每次仍进行既有数据库与文件授权，读取并校验图像，确认相同内容已同步后才 302 到 CDN。省下的是 ECS 对访客的图片流量，不是所有本地磁盘读取。未同步、配置关闭、清单损坏或超过 180 秒未检查，自动返回原有受控 ECS 图片。
- CDN A 鉴权有效期 **300 秒**，签名时间取自授权检查开始之前；超过 30 秒的慢请求回退 ECS，不能重新开始签名计时。跳转不可缓存，CDN 图片响应必须 `Cache-Control: no-store`；边缘缓存另行强制设置，鉴权对缓存命中依然执行。
- 同步任务检查无签名、错误签名、过期签名均 403，正确签名 200，且浏览器 no-store，才发布可用清单。下线后停止签发新地址；旧地址最多继续 300 秒，已下载图片无法收回。
- 全部公开引用消失后从可用清单移除；超过 10 分钟的回收宽限后删除 OSS 副本并刷新 CDN。任何枚举/读图失败都暂停垃圾回收；上传/刷新失败保留日志账本待下轮重试，缺少完整结束标记绝不执行回收。删除权限只用于可重建云副本。

## 安装与配置

从已提交 Git 的本目录运行 `sudo sh install.sh`。安装固定 SDK 虚拟环境、脚本与 systemd 单元，不自动启用任务。宿主机需 Python venv、Docker Compose 及已启用的 `gallery-metadata-guard.service`。

- `/etc/gallery/media-sync.json`：Bucket、区域、内网 OSS HTTPS endpoint、CDN origin、ECS 角色名称，模板见 config.example.json。
- `/var/lib/gallery-media/public/config.json`：`{"enabled":true,"origin":"https://cdn.example.com","signingKey":"<32–128位随机字母数字>"}`。root:1000、0640，不进入 Git。主 KEY 必须与 CDN 控制台一致。
- `/var/lib/gallery-media/public/ready.json`：原子替换的可重建就绪清单；前台容器只读挂载此目录，后台容器不挂载。
- `/var/lib/gallery-media/ledger.json`：先写日志再上传，追踪本任务曾同步的对象；不依赖 Bucket 列举权限，不删除未知对象。
- `/var/lib/gallery-media/status.json`：最近扫描时间、对象数、上传/删除/失败数；不含私钥或临时凭据。
- `systemctl enable --now gallery-media-sync.timer`，上一轮结束后约 60 秒再运行。单次超时 30 分钟，内存上限 768 MB、CPU 50%。大图库扫描超过清单新鲜期时会安全回退 ECS；后续可按实测规模优化增量扫描。
- `systemctl start gallery-media-sync.service` 手动运行；`journalctl -u gallery-media-sync.service` 查看非敏感汇总。无独立邮件/SMS 通知。

服务因需要调用 Docker Exec 由 root 调度固定命令，应用容器无法读取实例元数据。SDK 仅使用指定 ECS RAM 角色的 IMDSv2 临时凭据；不创建用户、长期 AK、数据库 owner 连接或公共 Bucket。

CDN 配置：URL A 鉴权 300 秒；`/gallery/` 边缘强制缓存 1 天（忽略源站 no-store），对浏览器继续保留 no-store；禁止过期内容兜底。首次切换须实测有效/无效签名、源站匿名拒绝、字节哈希、HIT 与响应头。

首次 Compose 增加只读目录属于协调部署，原 CI 安全门应拒绝自动更改拓扑；人工验收挂载后继续沿用正常 CI，不绕过检查。随后无需业务迁移。

## 回滚和备份

将 public/config.json 的 enabled 原子改为 false，即时停止签发 CDN URL；停止 timer，前台回到 ECS。保留 URL 鉴权、私有 Bucket 和对象，不删除 Immich 来源图。旧签名 5 分钟后失效。密钥轮换须协调 CDN 主备 KEY 与本文件。

云备份脚本在独占同步锁后备份配置、签名密钥和 ledger，归档属于私有备份。不能只备份 ready 清单然后删除 ledger；后者负责追踪可回收对象。
