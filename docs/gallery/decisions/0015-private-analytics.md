# ADR 0015：私有访问统计

状态：2026-09-21 用户已确认；实际交付见 delivery/analytics.md。

- 使用免费、MIT 许可的 Umami 开源自托管版本，不使用 Umami Cloud 付费订阅。
- 统计仅供站长查看，不在前台显示阅读量；将来的公开计数另行确定规则。
- 独立 Compose、独立 PostgreSQL 和账号，由独立 Edge 转发；Gallery/Immich 数据库不变。
- 前台同域 `/analytics/script.js` 和 `/analytics/api/send` 精确代理到 Umami，其余统计管理接口不通过前台暴露。私有后台 `stats.vision.ke` 使用独立登录。
- 只统计成功的公开内容页面；筛选、排序、同页翻页不重复计 PV。相片页弹层改变以 photo_view 事件单独统计，照片专属页面仍有其页面访问记录。国家详情以 country_view 事件统计。
- 不采集查询字符串、片段、登录信息、签名链接、详细 GPS。外部来源仅记录 origin。尊重 DNT，提供当前浏览器退出统计入口。
- 不启用会话录像、热力图、用户身份识别或公开分享报表；统计失败不阻碍浏览。
- 不承诺大陆与境外全部网络可达或精确独立人数，广告拦截、DNT、线路失败会影响统计。
