const state = { platforms: [], active: 'steam', chart: '', charts: [], items: [], query: '', limit: 100, page: 1, group: 'all', loading: false };
const $ = (selector) => document.querySelector(selector);
const formatNumber = new Intl.NumberFormat('zh-CN');

function initials(name) {
  const map = { 'Steam': 'S', 'Apple': 'A', '微信小游戏': '微', '抖音小游戏': '抖', '哔哩哔哩': 'B', 'TapTap': 'T', 'Google Play': 'G', 'Meta': 'M', 'TikTok': 'T' };
  return map[name] || name.slice(0, 1);
}

function escapeHtml(value = '') {
  const div = document.createElement('div');
  div.textContent = String(value);
  return div.innerHTML;
}

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 2600);
}

async function request(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error || '请求失败'), { payload });
  return payload;
}

async function init() {
  updateClock();
  setInterval(updateClock, 30000);
  bindEvents();
  try {
    const data = await request('/api/platforms');
    state.platforms = data.platforms;
    $('#stat-platforms').textContent = data.total;
    $('#stat-live').textContent = data.live;
    renderPlatforms();
    renderSources();
    await loadRanking('steam');
  } catch (error) {
    toast(error.message);
  }
}

function bindEvents() {
  $('#group-filter').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-group]');
    if (!button) return;
    state.group = button.dataset.group;
    document.querySelectorAll('#group-filter button').forEach((node) => node.classList.toggle('active', node === button));
    renderPlatforms();
  });
  $('#platform-strip').addEventListener('click', (event) => {
    const card = event.target.closest('[data-platform]');
    if (!card) return;
    const platform = state.platforms.find((item) => item.id === card.dataset.platform);
    if (platform.status !== 'live') {
      state.active = platform.id;
      renderPlatforms();
      renderRestricted(platform);
      return;
    }
    loadRanking(platform.id);
  });
  $('#global-search').addEventListener('input', (event) => { state.query = event.target.value.trim().toLowerCase(); state.page = 1; renderTable(); });
  $('#limit-select').addEventListener('change', (event) => { state.limit = Number(event.target.value); state.page = 1; renderTable(); });
  $('#chart-select').addEventListener('change', (event) => { state.chart = event.target.value; loadRanking(state.active, false, state.chart); });
  $('#refresh-button').addEventListener('click', () => loadRanking(state.active, true, state.chart));
  document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#global-search').focus(); } });
  document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((node) => node.classList.toggle('active', node === button));
    const target = button.dataset.view === 'sources' ? '.sources-section' : button.dataset.view === 'ranking' ? '.ranking-panel' : '.hero';
    document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#crumb-current').textContent = button.textContent.trim();
  }));
}

function updateClock() {
  $('#clock').textContent = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }).format(new Date());
}

function renderPlatforms() {
  const platforms = state.platforms.filter((item) => state.group === 'all' || item.group === state.group);
  $('#platform-strip').innerHTML = platforms.map((platform) => `
    <button class="platform-card ${platform.id === state.active ? 'active' : ''} ${platform.status !== 'live' ? 'restricted' : ''}" data-platform="${platform.id}">
      <div class="pc-top"><span class="pc-logo">${initials(platform.name)}</span><span class="pc-state ${platform.status}"></span></div>
      <h3>${escapeHtml(platform.name)} <small>· ${escapeHtml(platform.region)}</small></h3>
      <p>${platform.status === 'live' ? (platform.coverageLabel || `官方 Top ${platform.coverage}`) : '等待官方授权'}</p>
    </button>`).join('');
}

function renderSources() {
  $('#source-grid').innerHTML = state.platforms.map((platform) => `
    <article class="source-card">
      <div class="source-icon">${initials(platform.name)}</div>
      <div><h3>${escapeHtml(platform.name)} · ${escapeHtml(platform.source)}</h3><p>${escapeHtml(platform.note)}</p><a href="${platform.sourceUrl}" target="_blank" rel="noreferrer">查看官方来源 ↗</a></div>
      <span class="source-status ${platform.status}">${platform.status === 'live' ? '已接入' : '需授权'}</span>
    </article>`).join('');
}

async function loadRanking(id, refresh = false, chart = '') {
  const platform = state.platforms.find((item) => item.id === id);
  if (!platform || platform.status !== 'live' || state.loading) return;
  state.loading = true;
  state.active = id;
  state.chart = chart;
  if (id !== 'wechat') {
    state.charts = [];
    renderChartSelect();
  }
  state.page = 1;
  renderPlatforms();
  renderLoading(platform);
  $('#refresh-button').classList.add('spinning');
  try {
    const chartQuery = chart ? `&chart=${encodeURIComponent(chart)}` : '';
    const data = await request(`/api/rankings?platform=${encodeURIComponent(id)}${refresh ? '&refresh=1' : ''}${chartQuery}`);
    state.items = data.items;
    state.charts = data.charts || [];
    state.chart = data.activeChart?.id || '';
    renderChartSelect();
    $('#stat-records').textContent = data.count;
    $('#ranking-name').textContent = `${data.platform.name} · ${data.activeChart?.name || data.platform.metric}`;
    $('#ranking-meta').textContent = `${data.platform.region} · ${data.activeChart ? `共 ${data.charts.length} 个官方榜单 · 当前公开 ${data.count} 名 · ` : ''}更新于 ${formatTime(data.updatedAt)}${data.cached ? ' · 缓存' : ' · 刚刚同步'}`;
    $('#active-logo').textContent = initials(data.platform.name);
    $('#provenance').innerHTML = `来源：<a href="${data.provenance.sourceUrl}" target="_blank" rel="noreferrer">${escapeHtml(data.provenance.source)} ↗</a> · 官方一手数据 · ${data.stale ? '源暂时异常，展示上次成功数据' : '校验通过'}`;
    renderTable();
    if (refresh) toast(`已同步 ${data.count} 条官方榜单数据`);
  } catch (error) {
    renderError(error.message, error.payload?.detail);
  } finally {
    state.loading = false;
    $('#refresh-button').classList.remove('spinning');
  }
}

function renderLoading(platform) {
  $('#ranking-name').textContent = `${platform.name} · ${platform.metric}`;
  $('#ranking-meta').textContent = '正在连接官方数据源并补充游戏信息…';
  $('#active-logo').textContent = initials(platform.name);
  $('#ranking-body').innerHTML = '<tr><td colspan="6"><div class="loading"><span></span><p>正在同步官方 Top 100，首次加载可能需要片刻</p></div></td></tr>';
  $('#pagination').innerHTML = '';
}

function renderRestricted(platform) {
  state.items = [];
  state.charts = [];
  state.chart = '';
  renderChartSelect();
  $('#ranking-name').textContent = `${platform.name} · 官方接入待授权`;
  $('#ranking-meta').textContent = `${platform.region} · ${platform.source}`;
  $('#active-logo').textContent = initials(platform.name);
  $('#ranking-body').innerHTML = `<tr><td colspan="6"><div class="empty"><b>不展示未经授权的“伪官方榜单”</b><p>${escapeHtml(platform.note)}</p><a class="external" style="margin:16px auto;width:120px" href="${platform.sourceUrl}" target="_blank" rel="noreferrer">官方接入说明 ↗</a></div></td></tr>`;
  $('#provenance').textContent = `状态：需通过 ${platform.source} 获得官方授权`;
  $('#pagination').innerHTML = '';
}

function renderChartSelect() {
  const select = $('#chart-select');
  select.hidden = !state.charts.length;
  if (!state.charts.length) {
    select.innerHTML = '';
    return;
  }
  select.innerHTML = state.charts.map((chart) => `<option value="${chart.id}" ${chart.id === state.chart ? 'selected' : ''}>${escapeHtml(chart.name)} · ${chart.count}名</option>`).join('');
}

function renderError(message, detail = '') {
  $('#ranking-body').innerHTML = `<tr><td colspan="6"><div class="empty"><b>${escapeHtml(message)}</b><p>${escapeHtml(detail || '请检查网络连接，稍后点击右上角刷新。')}</p></div></td></tr>`;
}

function renderTable() {
  const query = state.query;
  const filtered = state.items.filter((item) => !query || [item.name, item.developer, item.publisher, ...(item.genres || [])].join(' ').toLowerCase().includes(query));
  const capped = filtered.slice(0, state.limit);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(capped.length / pageSize));
  state.page = Math.min(state.page, pageCount);
  const visible = capped.slice((state.page - 1) * pageSize, state.page * pageSize);
  if (!visible.length) {
    $('#ranking-body').innerHTML = '<tr><td colspan="6"><div class="empty"><b>没有匹配的游戏</b><p>试试搜索其他名称、厂商或游戏类型。</p></div></td></tr>';
  } else {
    $('#ranking-body').innerHTML = visible.map((item) => `
      <tr>
        <td><span class="rank ${item.rank <= 3 ? 'top' : ''}">${String(item.rank).padStart(2, '0')}</span></td>
        <td><div class="game-cell"><img src="${escapeHtml(item.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><div><b title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</b><small title="${escapeHtml(item.summary)}">${escapeHtml(item.summary)}</small></div></div></td>
        <td><div class="tags">${(item.genres?.length ? item.genres : ['游戏']).map((genre) => `<span class="tag">${escapeHtml(genre)}</span>`).join('')}</div></td>
        <td><div class="publisher"><b title="${escapeHtml(item.developer)}">${escapeHtml(item.developer)}</b><small>${escapeHtml(item.releaseDate || '—')} · ${escapeHtml(item.price || '—')}</small></div></td>
        <td><div class="metric"><b>${item.metricLabel.includes('排名') ? `#${item.metric}` : formatNumber.format(item.metric || 0)}</b><small>${escapeHtml(item.metricLabel)}${item.secondaryMetric ? ` · 峰值 ${formatNumber.format(item.secondaryMetric)}` : ''}</small></div></td>
        <td><a class="external" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer" title="查看官方页面">↗</a></td>
      </tr>`).join('');
  }
  renderPagination(pageCount);
}

function renderPagination(pageCount) {
  const pages = [];
  for (let page = 1; page <= pageCount; page++) {
    if (pageCount <= 7 || page <= 3 || page > pageCount - 2 || Math.abs(page - state.page) <= 1) pages.push(page);
  }
  const unique = [...new Set(pages)];
  let last = 0;
  $('#pagination').innerHTML = unique.map((page) => {
    const gap = page - last > 1 ? '<span>…</span>' : '';
    last = page;
    return `${gap}<button class="${page === state.page ? 'active' : ''}" data-page="${page}">${page}</button>`;
  }).join('');
  $('#pagination').querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { state.page = Number(button.dataset.page); renderTable(); document.querySelector('.ranking-panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
}

function formatTime(iso) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }).format(new Date(iso));
}

init();
