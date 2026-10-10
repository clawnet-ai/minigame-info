# 官方数据源审计

更新时间：2026-10-10

本项目只把平台公开的一手统一排名标记为“官方榜单”。客户端内的个性化推荐、单款游戏内的玩家排行、广告热度和第三方估算都不能替代平台生态 Top 100。

## 抖音小游戏

已确认的官方能力：

- [游戏推荐组件能力介绍](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/open-ability/Gamerecommend) 明确说明抖音小游戏中心会按品类、专题聚合展示游戏。
- 推荐组件可在单款小游戏内拉起其他游戏，开发者只能优先配置同主体游戏，不足部分由平台推荐填充。
- [游戏排行榜功能](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/open-ability/ImRankIntroduce) 排的是单款游戏内玩家成绩及好友关系榜，不是跨游戏生态排行。

接入结论：官方网页和开放平台目前没有提供可匿名访问的小游戏中心目录、热玩榜或全平台 Top 100 接口。推荐组件返回顺序还会受当前游戏、主体配置及平台策略影响，不能当成统一排名。

可行路径：向抖音开放平台申请明确允许跨游戏生态分析的数据合作或官方数据文件。取得书面许可前，不抓取客户端私有接口。

## TikTok Mini Games

已确认的官方能力：

- [Mini Games Introduction](https://developers.tiktok.com/docs/en/mini-games-overview) 确认用户可从搜索、最近玩过、短视频挂载、社交分享和 Minis Center 进入小游戏。
- Minis Center 使用推广位及基于用户游戏行为的个性化推荐，不是统一公开排名。
- [Mini Games Analytics](https://developers.tiktok.com/docs/en/mini-game-analytics) 只展示开发者自己应用的用户、性能、推广和变现指标。
- [Research API](https://developers.tiktok.com/products/research-api/) 提供公开账号和内容研究数据，但没有 Mini Games 游戏目录或生态排名数据。

接入结论：当前没有公开的 Mini Games Top 100、统一目录 API 或可导出的 Minis Center 排名。TikTok 网页端也没有对应的公开小游戏中心页面。

可行路径：通过 TikTok Mini Games 商务合作申请跨游戏目录或聚合指标；普通开发者账号只能读取自有游戏数据。

## Meta Instant Games

已确认的官方能力：

- [Discovery](https://developers.facebook.com/documentation/games/acquire/discovery) 说明 Gaming Tab 包含 Popular Games、New Games、Trending 和 Recommended for You 等发现区域。
- 推荐与搜索顺序受用户行为、相关性、热度等信号影响，并非固定公共榜单。
- [Gaming Insights](https://developers.facebook.com/documentation/games/tools/gaming-insights) 需要目标应用的管理员或开发者权限，只能查看所管理游戏的指标。
- [Leaderboards](https://developers.facebook.com/documentation/games/retain/leaderboards) 是单款游戏内的玩家积分榜，不是 Instant Games 生态榜。
- Facebook `robots.txt` 明确禁止未经书面许可的自动化数据收集，因此本项目不会抓取 Gaming Tab 私有请求。

接入结论：Meta 没有提供 Instant Games 全平台 Top 100 的公开 Graph API 或匿名导出。客户端发现区域即使出现 Popular、Trending，也不应在未获许可时自动采集。

可行路径：加入 [Approved Partner Program](https://developers.facebook.com/documentation/games/launch/approved-partner-program)，并向 Meta 申请生态级数据权限或书面采集许可。

## 未作为排行榜接入的相关官方数据

- 巨量算数、TikTok Creative Center：属于内容、关键词或广告创意趋势，不是小游戏平台排名。
- TikTok Research API：可研究公开视频与账号，但不含小游戏目录。
- Meta Gaming Insights：只覆盖有管理权限的自有游戏。

这些来源可在后续作为“内容传播/广告趋势”独立模块接入，但不会混入游戏 Top 100。
