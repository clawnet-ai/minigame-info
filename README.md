# MiniGame Radar

全球小游戏生态官方数据雷达。当前 MVP 严格区分“公开官方数据”和“需要平台授权的数据”，不会以第三方估算数据冒充官方榜单。

## 已接入

- Steam：官方 `ISteamChartsService` 实时在线 Top 100，并使用 Steam Store 官方接口补充名称、简介、类型、厂商、价格和发行日期。
- Apple 美国区：Apple iTunes RSS 免费游戏 Top 100。
- Apple 中国区：Apple iTunes RSS 免费游戏 Top 100。
- 微信小游戏：腾讯官方排行榜页面，涵盖 PC 小游戏、热度飙升、畅销、人气、畅玩及 16 个品类榜，共 21 个榜单。公开网页提供每榜前 5 名预览；完整榜单接口需要微信客户端凭证。
- TapTap：官方热门、热玩、预约、新品 4 个榜单，每榜分页同步 Top 100，并展示游戏简介、标签、评分和发行日期。

抖音小游戏、哔哩哔哩、Google Play、Meta、TikTok 已纳入数据源矩阵。当前版本尚未验证到可匿名稳定访问的官方完整榜单时，界面明确显示为“无公开榜单”，不生成虚假排行。抖音、TikTok 和 Meta 的最新官方数据接入核验记录见 [官方数据源审计](docs/source-audit.md)。官方公开网页同样被视为可信一手来源，后续会逐个平台增加网页连接器。

## 运行

需要 Node.js 18 或更高版本：

```bash
npm start
```

访问 <http://localhost:4173>。

首次打开 Steam 榜单时，服务端会并发访问 Steam 官方商店接口补充游戏信息，并为慢响应设置超时降级，因此通常等待 6–30 秒；成功后缓存 15 分钟。若部分详情暂不可用，实时排名、App ID、在线数据、官方图片和商店链接仍来自 Steam 官方服务。

## API

- `GET /api/platforms`：平台与官方接入状态。
- `GET /api/rankings?platform=steam`：Steam Top 100。
- `GET /api/rankings?platform=apple-us`：Apple 美国区免费游戏 Top 100。
- `GET /api/rankings?platform=apple-cn`：Apple 中国区免费游戏 Top 100。
- `GET /api/rankings?platform=wechat`：微信小游戏官方榜单及 21 个分类。
- `GET /api/rankings?platform=wechat&chart=chart-4`：指定微信榜单。
- `GET /api/rankings?platform=taptap`：TapTap 官方热门榜 Top 100 及 4 个榜单目录。
- `GET /api/rankings?platform=taptap&chart=pop`：指定 TapTap 热玩榜；还支持 `hot`、`reserve`、`new`。
- 添加 `&refresh=1` 强制刷新官方源。

## 下一步生产化

1. 使用 PostgreSQL 保存每日榜单快照，计算升降榜、连续在榜天数和趋势。
2. 为已取得主体权限的平台添加 OAuth/密钥管理，不在前端存放任何凭据。
3. 通过定时任务每 15–60 分钟同步，并记录原始响应哈希以便审计。
4. 申请微信客户端完整榜单凭证，并继续验证抖音等平台的官方公开页面连接器。
