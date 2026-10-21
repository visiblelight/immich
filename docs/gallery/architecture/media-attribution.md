# 图片署名配置数据字典

迁移 `0014_media_attribution.sql` 仅新增 Gallery 独立单行配置表，无 Immich DDL 或数据写入。

| 字段 | 类型／约束 | 用途 |
|---|---|---|
| id | integer，主键且等于 1 | 唯一全站配置 |
| enabled | boolean，默认 false | 输出署名开关，迁移不自动开启 |
| creator | text，最多 200 字符 | 创作者 |
| homepage | text，最多 1000 字符 | HTTP(S) 个人主页，无账号密码 |
| copyright | text，最多 500 字符 | 可选版权说明 |
| version | integer，正数，默认 1 | 乐观并发版本，不参与图片字节生成 |
| updated_at | timestamptz | 修改时间，不写入图片 |

管理员只能 SELECT/UPDATE，无 INSERT/DELETE；公开运行角色只可 SELECT。通过后台身份与来源检查、管理员状态校验、版本对比后事务更新，同时记录 `media-attribution.save` 审计事件。文本校验拒绝控制字符及非法 XML 字符；XMP 转义文本。

配置没有到照片、相册或文章的外键，不更新其版本。旧应用忽略该表即可运行；回滚不删除表或历史设置。后续重启旧迁移程序前须使用包含 0014 的迁移集合校验历史，不运行缺失该历史文件的旧迁移命令。
