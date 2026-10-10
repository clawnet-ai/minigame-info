const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, 'public');
const CACHE_TTL = 15 * 60 * 1000;
const cache = new Map();

const platforms = [
  { id: 'steam', name: 'Steam', region: '全球', group: 'global', status: 'live', coverage: 100, metric: '实时在线人数', source: 'Steam Web API', sourceUrl: 'https://steamapi.xpaw.me/#ISteamChartsService/GetGamesByConcurrentPlayers', note: '官方实时在线榜，每 15 分钟缓存一次。' },
  { id: 'apple-us', name: 'Apple', region: '美国', group: 'global', status: 'live', coverage: 100, metric: '免费游戏榜', source: 'Apple iTunes RSS', sourceUrl: 'https://itunes.apple.com/us/rss/topfreeapplications/limit=100/genre=6014/json', note: 'App Store 美国区免费游戏 Top 100。' },
  { id: 'apple-cn', name: 'Apple', region: '中国', group: 'china', status: 'live', coverage: 100, metric: '免费游戏榜', source: 'Apple iTunes RSS', sourceUrl: 'https://itunes.apple.com/cn/rss/topfreeapplications/limit=100/genre=6014/json', note: 'App Store 中国区免费游戏 Top 100。' },
  { id: 'wechat', name: '微信小游戏', region: '中国', group: 'china', status: 'live', coverage: 21, coverageLabel: '21 个官方榜单', metric: '分类与生态榜', source: '微信小游戏官网', sourceUrl: 'https://xiaoyouxi.qq.com/rankcategory.html', note: '腾讯官方公开排行榜，收录 21 个榜单；网页公开每榜前 5 名预览，完整列表需微信客户端凭证。' },
  { id: 'douyin', name: '抖音小游戏', region: '中国', group: 'china', status: 'restricted', coverage: 0, metric: '热玩榜', source: '抖音开放平台', sourceUrl: 'https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/open-ability/ImRankIntroduce', note: '公开文档中的排行榜能力是单款游戏内的玩家及好友榜，并非全平台小游戏生态榜；目前未发现可匿名访问的官方 Top 100 数据源。' },
  { id: 'bilibili', name: '哔哩哔哩', region: '中国', group: 'china', status: 'restricted', coverage: 0, metric: '游戏榜', source: '哔哩哔哩游戏中心', sourceUrl: 'https://game.bilibili.com/', note: '未发现稳定公开官方 Top 100 API，等待商务/开放平台授权。' },
  { id: 'taptap', name: 'TapTap', region: '中国', group: 'china', status: 'live', coverage: 100, coverageLabel: '4 个官方 Top 100', metric: '热门榜', source: 'TapTap 官方榜单', sourceUrl: 'https://www.taptap.cn/top/download', note: 'TapTap 官方公开榜单，收录热门、热玩、预约和新品 4 个榜单，每榜同步前 100 名。' },
  { id: 'google', name: 'Google Play', region: '全球', group: 'global', status: 'restricted', coverage: 0, metric: '热门免费游戏', source: 'Google Play Console', sourceUrl: 'https://play.google.com/console/about/', note: '官方 API 不公开跨应用排行榜；需获授权的数据合作。' },
  { id: 'meta', name: 'Meta', region: '全球', group: 'global', status: 'restricted', coverage: 0, metric: 'Instant Games', source: 'Meta for Developers', sourceUrl: 'https://developers.facebook.com/docs/games/', note: '官方 Graph API 不提供生态 Top 100 公榜。' },
  { id: 'tiktok', name: 'TikTok', region: '全球', group: 'global', status: 'restricted', coverage: 0, metric: 'Mini Games', source: 'TikTok for Developers', sourceUrl: 'https://developers.tiktok.com/', note: '需平台合作权限，当前不以网页热度替代官方排行。' }
];

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function officialFetch(url, options = {}) {
  const controller = new AbortController();
  const { timeout = 20000, ...fetchOptions } = options;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: { 'User-Agent': 'MiniGameRadar/0.1 official-data-collector', ...(fetchOptions.headers || {}) }
    });
    if (!response.ok) throw new Error(`官方接口返回 HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function officialFetchText(url, options = {}) {
  const controller = new AbortController();
  const { timeout = 20000, ...fetchOptions } = options;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 MiniGameRadar/0.1 official-page-collector', ...(fetchOptions.headers || {}) }
    });
    if (!response.ok) throw new Error(`官方页面返回 HTTP ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function cached(key, loader, force = false) {
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_TTL) return { ...hit, cached: true };
  const data = await loader();
  const value = { data, at: Date.now(), cached: false };
  cache.set(key, value);
  return value;
}

async function mapLimit(items, limit, mapper) {
  const result = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      try { result[index] = await mapper(items[index], index); }
      catch { result[index] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return result;
}

async function loadSteam(force) {
  const rankResult = await officialFetch('https://api.steampowered.com/ISteamChartsService/GetGamesByConcurrentPlayers/v1/');
  const ranks = (rankResult.response?.ranks || []).slice(0, 100);
  const fetchDetail = async ({ appid }) => {
    const payload = await officialFetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=schinese&cc=cn&filters=basic,developers,publishers,genres,release_date,price_overview`, { timeout: 6000 });
    return payload[String(appid)]?.success ? payload[String(appid)].data : null;
  };
  const details = await mapLimit(ranks, 20, fetchDetail);
  const missing = ranks.map((item, index) => ({ item, index })).filter(({ index }) => !details[index]);
  if (missing.length) {
    const retries = await mapLimit(missing, 5, ({ item }) => fetchDetail(item));
    missing.forEach(({ index }, retryIndex) => { if (retries[retryIndex]) details[index] = retries[retryIndex]; });
  }
  return ranks.map((item, index) => {
    const detail = details[index];
    return {
      rank: item.rank,
      id: String(item.appid),
      name: detail?.name || `Steam App ${item.appid}`,
      developer: detail?.developers?.join(' / ') || '—',
      publisher: detail?.publishers?.join(' / ') || '—',
      summary: stripHtml(detail?.short_description || 'Steam 官方实时在线榜游戏。'),
      genres: detail?.genres?.map((genre) => genre.description).slice(0, 3) || [],
      image: detail?.header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${item.appid}/header.jpg`,
      url: `https://store.steampowered.com/app/${item.appid}`,
      metric: item.concurrent_in_game,
      metricLabel: '当前在线',
      secondaryMetric: item.peak_in_game,
      secondaryLabel: '今日峰值',
      releaseDate: detail?.release_date?.date || '—',
      price: detail?.is_free ? '免费' : (detail?.price_overview?.final_formatted || '—')
    };
  });
}

function stripHtml(value) {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

function pickLabel(node, fallback = '') {
  return node && typeof node === 'object' && 'label' in node ? node.label : fallback;
}

async function loadApple(country) {
  const countryCode = country === 'cn' ? 'cn' : 'us';
  const url = `https://itunes.apple.com/${countryCode}/rss/topfreeapplications/limit=100/genre=6014/json`;
  const payload = await officialFetch(url);
  const entries = payload.feed?.entry || [];
  return entries.slice(0, 100).map((entry, index) => {
    const images = entry['im:image'] || [];
    const category = entry.category?.attributes?.label || 'Games';
    return {
      rank: index + 1,
      id: entry.id?.attributes?.['im:id'] || pickLabel(entry.id),
      name: pickLabel(entry['im:name'], '未知游戏'),
      developer: pickLabel(entry['im:artist'], '—'),
      publisher: pickLabel(entry.rights, pickLabel(entry['im:artist'], '—')),
      summary: pickLabel(entry.summary, `${category} · App Store 免费游戏榜`),
      genres: [category],
      image: images.at(-1)?.label || '',
      url: entry.link?.attributes?.href || pickLabel(entry.id),
      metric: index + 1,
      metricLabel: '免费榜排名',
      secondaryMetric: null,
      secondaryLabel: '',
      releaseDate: entry['im:releaseDate']?.attributes?.label || pickLabel(entry['im:releaseDate'], '—'),
      price: pickLabel(entry['im:price'], '免费')
    };
  });
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadWechat() {
  const sourceUrl = 'https://xiaoyouxi.qq.com/rankcategory.html';
  const html = await officialFetchText(sourceUrl);
  const appStart = html.indexOf('<div id="app">');
  if (appStart < 0) throw new Error('微信官方榜单页面结构发生变化');
  const cardBlocks = html.slice(appStart).split(/<li[^>]+class="rank-list-page__list__item">/).slice(1);
  const charts = cardBlocks.map((card, chartIndex) => {
    const title = decodeHtml(card.match(/class="rank-cate-card__content__title__text"[^>]*>([^<]+)/)?.[1]);
    if (!title) return null;
    const starts = [...card.matchAll(/<div[^>]*class="pure-game-item pure-game-item-theme-2 game-list__item"[^>]*>/g)];
    const items = starts.map((match, itemIndex) => {
      const segment = card.slice(match.index, starts[itemIndex + 1]?.index ?? card.length);
      const id = decodeHtml(segment.match(/id="([^"]+)"/)?.[1]);
      const rank = Number(segment.match(/pure-game-item__content__title__rank-index[^>]*>\s*<span[^>]*>(\d+)/)?.[1] || itemIndex + 1);
      const name = decodeHtml(segment.match(/pure-game-item__content__title__name"[^>]*>([^<]+)/)?.[1] || '未知小游戏');
      const image = decodeHtml(segment.match(/data-src="([^"]+)"/)?.[1]);
      const genres = [...segment.matchAll(/class="game-tag-list__item"[^>]*>([^<]+)/g)].map((value) => decodeHtml(value[1])).filter(Boolean);
      const features = [...segment.matchAll(/class="game-feature-desc__text"[^>]*[^>]*>([^<]+)/g)].map((value) => decodeHtml(value[1])).filter(Boolean);
      return {
        rank, id, name,
        developer: '微信小游戏',
        publisher: '—',
        summary: features.join(' · ') || `${title}官方上榜游戏`,
        genres: genres.length ? genres : [title.replace(/榜.*$/, '') || '小游戏'],
        image,
        url: `${sourceUrl}#${id}`,
        metric: rank,
        metricLabel: `${title}排名`,
        secondaryMetric: null,
        secondaryLabel: '',
        releaseDate: '—',
        price: '即点即玩'
      };
    }).filter((item) => item.id && item.name);
    return { id: `chart-${chartIndex + 1}`, name: title, count: items.length, items };
  }).filter((chart) => chart && chart.items.length);
  if (!charts.length) throw new Error('未从微信官方页面读取到榜单');
  return charts;
}

const TAPTAP_CHARTS = [
  { id: 'hot', path: 'download' },
  { id: 'pop', path: 'played' },
  { id: 'reserve', path: 'reserve' },
  { id: 'new', path: 'new' }
];

const TAPTAP_X_UA = 'V=1&PN=WebApp&LANG=zh_CN&VN_CODE=100000000&LOC=CN&PLT=PC&DS=Android&UID=00000000-0000-4000-8000-000000000000&DT=PC';

async function loadTaptapChart(chart) {
  const pages = await Promise.all(Array.from({ length: 10 }, async (_, page) => {
    const params = new URLSearchParams({
      type_name: chart.id,
      limit: '10',
      from: String(page * 10),
      platform: 'android'
    });
    const payload = await officialFetch(`https://www.taptap.cn/webapiv2/app-top/v2/hits?${params}`, {
      headers: { 'X-UA': TAPTAP_X_UA, Referer: `https://www.taptap.cn/top/${chart.path}` }
    });
    if (!payload.success || !Array.isArray(payload.data?.list)) throw new Error(`TapTap ${chart.id} 榜单响应异常`);
    return payload.data;
  }));
  const metadata = pages[0];
  const apps = pages.flatMap((page) => page.list).slice(0, 100);
  return {
    id: chart.id,
    name: metadata.title || chart.id,
    description: metadata.description || '',
    sourceUrl: `https://www.taptap.cn/top/${chart.path}`,
    count: apps.length,
    items: apps.map((entry, index) => {
      const app = entry.app || {};
      const rating = Number(app.stat?.rating?.score);
      return {
        rank: index + 1,
        id: String(app.id || entry.identification || index + 1),
        name: app.title || '未知游戏',
        developer: '厂商未在榜单公开',
        publisher: '厂商未在榜单公开',
        summary: stripHtml(app.description?.text || app.rec_text || `${metadata.title || 'TapTap'}上榜游戏`),
        genres: (app.tags || []).map((tag) => tag.value).filter(Boolean).slice(0, 3),
        image: app.icon?.url || app.icon?.original_url || '',
        url: `https://www.taptap.cn/app/${app.id}`,
        metric: index + 1,
        metricLabel: `${metadata.title || '榜单'}排名`,
        secondaryMetric: null,
        secondaryLabel: '',
        releaseDate: app.released_time ? new Date(app.released_time * 1000).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—',
        price: Number.isFinite(rating) && rating > 0 ? `评分 ${rating.toFixed(1)}` : '—'
      };
    })
  };
}

async function loadTaptap() {
  const charts = await Promise.all(TAPTAP_CHARTS.map(loadTaptapChart));
  if (charts.some((chart) => chart.count < 100)) throw new Error('TapTap 官方榜单未返回完整 Top 100');
  return charts;
}

async function rankings(req, res, url) {
  const id = url.searchParams.get('platform') || 'steam';
  const force = url.searchParams.get('refresh') === '1';
  const platform = platforms.find((item) => item.id === id);
  if (!platform) return json(res, 404, { error: '未知平台' });
  if (platform.status !== 'live') {
    return json(res, 403, { error: '该平台暂无公开官方 Top 100 接口', platform });
  }
  try {
    const loader = id === 'steam'
      ? () => loadSteam(force)
      : id === 'wechat'
        ? loadWechat
        : id === 'taptap'
          ? loadTaptap
          : () => loadApple(id.endsWith('-cn') ? 'cn' : 'us');
    const result = await cached(id, loader, force);
    const charts = ['wechat', 'taptap'].includes(id) ? result.data : null;
    const requestedChart = url.searchParams.get('chart');
    const activeChart = charts ? (charts.find((chart) => chart.id === requestedChart) || charts.find((chart) => chart.name.includes('人气')) || charts[0]) : null;
    const items = activeChart ? activeChart.items : result.data;
    json(res, 200, {
      platform,
      items,
      count: items.length,
      charts: charts?.map(({ id: chartId, name, count, description, sourceUrl }) => ({ id: chartId, name, count, description, sourceUrl })) || [],
      activeChart: activeChart ? { id: activeChart.id, name: activeChart.name, description: activeChart.description, sourceUrl: activeChart.sourceUrl } : null,
      updatedAt: new Date(result.at).toISOString(),
      cached: result.cached,
      provenance: { official: true, source: platform.source, sourceUrl: activeChart?.sourceUrl || platform.sourceUrl }
    });
  } catch (error) {
    const previous = cache.get(id);
    if (previous) {
      const fallbackData = ['wechat', 'taptap'].includes(id) ? previous.data[0]?.items || [] : previous.data;
      return json(res, 200, { platform, items: fallbackData, count: fallbackData.length, updatedAt: new Date(previous.at).toISOString(), cached: true, stale: true, warning: error.message, provenance: { official: true, source: platform.source, sourceUrl: platform.sourceUrl } });
    }
    json(res, 502, { error: '官方数据源暂时不可用', detail: error.message, platform });
  }
}

function serveStatic(req, res, url) {
  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'Forbidden' });
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/health') return json(res, 200, { ok: true, now: new Date().toISOString() });
  if (url.pathname === '/api/platforms') return json(res, 200, { platforms, live: platforms.filter((item) => item.status === 'live').length, total: platforms.length });
  if (url.pathname === '/api/rankings') return rankings(req, res, url);
  serveStatic(req, res, url);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`MiniGame Radar 已启动：http://localhost:${PORT}`);
});
