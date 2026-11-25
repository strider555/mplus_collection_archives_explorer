// M+ Collection Archives Explorer — architecture-related fonds (45)
// Data: data/archives.json (fonds), data/items.json (6,341 records), data/graph.json (tag graph)
// Data source: M+ Collection data — github.com/mplusmuseum/collection-data
let ARCHIVES = [], ITEMS = [], GRAPH = null, byCA = {}, byId = {};
let currentCA = null, sortMode = 'name';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TAG_COLORS = { area: '#e6a817', category: '#2bb3a3', decade: '#8fca9f', nationality: '#4fa8d5', medium: '#e5537a' };

function natKey(no) {
  return no.split('/').map(p => /^\d+$/.test(p) ? p.padStart(6, '0') : p);
}
function cmpNo(a, b) {
  const ka = natKey(a.no), kb = natKey(b.no);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) { const d = String(ka[i] ?? '').localeCompare(String(kb[i] ?? '')); if (d) return d; }
  return 0;
}
function decadeOf(x) {
  const y = parseInt(x.by);
  return (y >= 1500 && y <= 2029) ? (Math.floor(y / 10) * 10) + 's' : null;
}

async function load() {
  const [a, i, g] = await Promise.all([
    fetch('./data/archives.json?v=1').then(r => r.json()),
    fetch('./data/items.json?v=2').then(r => r.json()),
    fetch('./data/graph.json?v=1').then(r => r.json()),
  ]);
  ARCHIVES = a; ITEMS = i; GRAPH = g;
  ARCHIVES.forEach(x => byCA[x.ca] = x);
  ITEMS.forEach(x => byId[x.id] = x);
  renderStats(); renderGrid(); renderSidebar(); initGraph(); route();
}

function renderStats() {
  const archItems = ITEMS.filter(x => x.cat.some(c => c.includes('Architect'))).length;
  const years = ITEMS.map(x => parseInt(x.by)).filter(y => y >= 1500 && y <= 2100);
  $('#statsStrip').innerHTML =
    `<span><b>${ARCHIVES.length}</b> archives</span>` +
    `<span><b>${ITEMS.length.toLocaleString()}</b> catalogued records</span>` +
    `<span><b>${archItems.toLocaleString()}</b> architectural-category records</span>` +
    `<span><b>${Math.min(...years)}–${Math.max(...years)}</b> date span</span>` +
    `<span>Data source: <a class="ext" href="https://github.com/mplusmuseum/collection-data" target="_blank" rel="noopener">M+ Collection data — github.com/mplusmuseum/collection-data</a></span>`;
}

/* ---------- archive cards ---------- */
function sortedArchives() {
  const arr = [...ARCHIVES];
  if (sortMode === 'count') arr.sort((a, b) => b.count - a.count);
  else if (sortMode === 'arch') arr.sort((a, b) => b.archcat - a.archcat);
  else arr.sort((a, b) => a.name.localeCompare(b.name));
  return arr;
}
function renderGrid() {
  $('#archGrid').innerHTML = sortedArchives().map(a => {
    const pct = a.count ? Math.round(100 * a.archcat / a.count) : 0;
    const cats = a.topCats.map(([c, n]) => `${esc(c)} (${n})`).join(' · ');
    return `<div class="arch-card" data-ca="${esc(a.ca)}">
      <h3>${esc(a.name)}</h3>
      <div class="tc">${esc(a.nameTC)}</div>
      <div class="meta"><span>${esc(a.ca)}</span><span>${a.count.toLocaleString()} records</span><span>${a.archcat.toLocaleString()} architectural (${pct}%)</span></div>
      <div class="arch-bar"><div style="width:${pct}%"></div></div>
      <div class="cats">${esc(cats)}</div>
    </div>`;
  }).join('');
  document.querySelectorAll('.arch-card').forEach(el =>
    el.addEventListener('click', () => { location.hash = '#/' + el.dataset.ca; }));
}

/* ---------- sidebar (Tag Types) ---------- */
function renderSidebar() {
  const catCount = {}, decCount = {};
  ITEMS.forEach(x => { x.cat.forEach(c => catCount[c] = (catCount[c] || 0) + 1); const d = decadeOf(x); if (d) decCount[d] = (decCount[d] || 0) + 1; });
  const row = (label, n, attr) => `<div class="side-item" ${attr}><span>${esc(label)}</span><span class="n">${n.toLocaleString()}</span></div>`;
  $('#sidePanel').innerHTML =
    `<div class="side-title">Tag Types</div>` +
    `<div class="side-sec"><span class="dot" style="background:#9aa0aa"></span>M+ Collection Archives<span class="side-count">${ARCHIVES.length}</span></div>` +
    `<div class="side-list">` + [...ARCHIVES].sort((a, b) => a.name.localeCompare(b.name)).map(a => row(a.name, a.count, `data-ca="${esc(a.ca)}"`)).join('') + `</div>` +
    `<div class="side-sec"><span class="dot" style="background:${TAG_COLORS.category}"></span>Categories<span class="side-count">${Object.keys(catCount).length}</span></div>` +
    `<div class="side-list">` + Object.entries(catCount).sort((a, b) => b[1] - a[1]).map(([c, n]) => row(c, n, `data-tag="category/${encodeURIComponent(c)}"`)).join('') + `</div>` +
    `<div class="side-sec"><span class="dot" style="background:${TAG_COLORS.decade}"></span>Decades<span class="side-count">${Object.keys(decCount).length}</span></div>` +
    `<div class="side-list">` + Object.entries(decCount).sort().map(([c, n]) => row(c, n, `data-tag="decade/${encodeURIComponent(c)}"`)).join('') + `</div>`;
  $('#sidePanel').querySelectorAll('[data-ca]').forEach(el => el.addEventListener('click', () => { location.hash = '#/' + el.dataset.ca; }));
  $('#sidePanel').querySelectorAll('[data-tag]').forEach(el => el.addEventListener('click', () => { location.hash = '#/tag/' + el.dataset.tag; }));
}

/* ---------- tag graph (canvas, precomputed static layout) ---------- */
let graphNodes = [], graphLinks = [];
function labelLines(label) {
  if (label.length <= 16) return [label];
  const words = label.split(' ');
  if (words.length === 1) return [label];
  let best = null, bestDiff = 1e9;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const d = Math.abs(a.length - b.length);
    if (d < bestDiff) { bestDiff = d; best = [a, b]; }
  }
  return best;
}
function initGraph() {
  if (!GRAPH) return;
  const wrap = $('#graphWrap'), canvas = $('#graphCanvas');
  const maxC = Math.max(...GRAPH.nodes.map(n => n.count));
  graphNodes = GRAPH.nodes.map(n => {
    const lines = labelLines(n.label);
    return { ...n, lines, half: Math.max(...lines.map(l => l.length)) * 3.3 + 10, r: Math.max(8, 10 + 30 * Math.sqrt(n.count / maxC)), x: 0, y: 0, vx: 0, vy: 0 };
  });
  const byIdG = {}; graphNodes.forEach(n => byIdG[n.id] = n);
  graphLinks = GRAPH.links.map(l => ({ a: byIdG[l.a], b: byIdG[l.b], w: l.w })).filter(l => l.a && l.b);
  let W = wrap.clientWidth, H = wrap.clientHeight;
  graphNodes.forEach((n, i) => {
    const ang = i / graphNodes.length * Math.PI * 2, rad = Math.min(W, H) * 0.30 * (0.45 + 0.55 * ((i * 29) % 7) / 6);
    n.x = W / 2 + Math.cos(ang) * rad; n.y = H / 2 + Math.sin(ang) * rad;
  });
  function clamp(p) {
    const mx = Math.max(p.r + 6, p.half);
    p.x = Math.max(mx, Math.min(W - mx, p.x));
    p.y = Math.max(p.r + 6, Math.min(H - p.r - 58, p.y));
  }
  function step() {
    const n = graphNodes;
    for (let i = 0; i < n.length; i++) for (let j = i + 1; j < n.length; j++) {
      const a = n[i], b = n[j];
      let dx = a.x - b.x, dy = a.y - b.y; let d2 = dx * dx + dy * dy || 1;
      const f = Math.min(0.9, 3400 / d2); dx *= f; dy *= f;
      a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
      const d = Math.sqrt(d2), min = a.r + b.r + 28;
      if (d < min && d > 0.01) { const push = (min - d) / d * 0.25; const ox = (a.x - b.x) * push, oy = (a.y - b.y) * push; a.x += ox; a.y += oy; b.x -= ox; b.y -= oy; }
    }
    graphLinks.forEach(l => {
      const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y; const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const rest = l.a.r + l.b.r + 55 + 130 / Math.sqrt(l.w);
      const f = (d - rest) / d * 0.02 * Math.min(4, Math.sqrt(l.w));
      l.a.vx += dx * f; l.a.vy += dy * f; l.b.vx -= dx * f; l.b.vy -= dy * f;
    });
    n.forEach(p => {
      p.vx += (W / 2 - p.x) * 0.002; p.vy += (H / 2 - p.y) * 0.002;
      p.x += p.vx; p.y += p.vy; p.vx *= 0.8; p.vy *= 0.8; clamp(p);
    });
  }
  for (let k = 0; k < 700; k++) step();
  graphNodes.forEach(p => { p.vx = p.vy = 0; });

  let hover = null, drag = null, downAt = null;
  function neighbours(p) { const s = new Set(); graphLinks.forEach(l => { if (l.a === p) s.add(l.b); if (l.b === p) s.add(l.a); }); return s; }
  function draw() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const nb = hover ? neighbours(hover) : null;
    graphLinks.forEach(l => {
      const hot = hover && (l.a === hover || l.b === hover);
      ctx.strokeStyle = hot ? 'rgba(230,168,23,0.55)' : 'rgba(150,160,180,0.13)';
      ctx.lineWidth = hot ? 1.4 : 1; ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
    });
    graphNodes.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = TAG_COLORS[p.type] || '#999';
      ctx.globalAlpha = hover && hover !== p && !nb.has(p) ? 0.3 : 0.92;
      ctx.fill(); ctx.globalAlpha = 1;
      if (hover === p) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke(); }
      ctx.textAlign = 'center'; ctx.font = '10.5px Inter, sans-serif';
      const lines = p.lines;
      lines.forEach((ln, i) => {
        const y = p.y + p.r + 13 + i * 12;
        ctx.strokeStyle = 'rgba(8,8,12,0.85)'; ctx.lineWidth = 3; ctx.strokeText(ln, p.x, y);
        ctx.fillStyle = '#e8eaf0'; ctx.fillText(ln, p.x, y);
      });
      const cy = p.y + p.r + 13 + lines.length * 12;
      ctx.font = '10px Inter, sans-serif';
      ctx.strokeStyle = 'rgba(8,8,12,0.85)'; ctx.lineWidth = 3; ctx.strokeText(p.count.toLocaleString(), p.x, cy);
      ctx.fillStyle = '#a7adb8'; ctx.fillText(p.count.toLocaleString(), p.x, cy);
    });
  }
  draw();
  function pos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function pick(p) {
    const hits = graphNodes.filter(n => (n.x - p.x) ** 2 + (n.y - p.y) ** 2 <= (n.r + 3) ** 2);
    return hits.length ? hits.reduce((m, n) => n.r < m.r ? n : m) : null;
  }
  canvas.addEventListener('pointerdown', e => { const p = pos(e); drag = pick(p); downAt = { ...p, node: drag }; if (drag) canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    const p = pos(e);
    if (drag) { drag.x = p.x; drag.y = p.y; clamp(drag); for (let k = 0; k < 3; k++) step(); draw(); }
    else { const h = pick(p); if (h !== hover) { hover = h; canvas.style.cursor = hover ? 'pointer' : 'grab'; draw(); } }
  });
  canvas.addEventListener('pointerup', e => {
    const p = pos(e);
    if (downAt && downAt.node && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 5) {
      const n = downAt.node; location.hash = '#/tag/' + n.type + '/' + encodeURIComponent(n.label);
    }
    drag = null; downAt = null;
  });
  window.addEventListener('resize', () => { W = wrap.clientWidth; H = wrap.clientHeight; graphNodes.forEach(clamp); draw(); });
}

/* ---------- views ---------- */
function showView(id) {
  ['homeView', 'archiveView', 'tagView'].forEach(v => $('#' + v).classList.toggle('active', v === id));
}
function showHome() { currentCA = null; showView('homeView'); }

const SERIES_LVLS = ['Fonds', 'Sub-fonds', 'Series', 'Subseries', 'Sub-subseries'];
function recRow(x, showArch) {
  const isSeries = SERIES_LVLS.includes(x.lvl);
  return `<div class="rec${isSeries ? ' series-row' : ''}" data-id="${x.id}">
    <span class="lvl${isSeries ? ' series' : ''}">${esc(x.lvl)}</span>
    <span class="no">${esc(x.no)}</span>
    <span class="ttl">${esc(x.t)}${x.tc ? `<span class="tc2">${esc(x.tc)}</span>` : ''}${showArch ? `<span class="tc2">— ${esc(byCA[x.ca].name)}</span>` : ''}</span>
    <span class="dt">${esc(x.d)}</span></div>`;
}
function bindRows(scope) {
  scope.querySelectorAll('.rec').forEach(el => el.addEventListener('click', () => openItem(+el.dataset.id)));
}

function showArchive(ca) {
  const a = byCA[ca];
  if (!a) { showHome(); return; }
  currentCA = ca; showView('archiveView');
  const pct = a.count ? Math.round(100 * a.archcat / a.count) : 0;
  $('#archHead').innerHTML =
    `<h2>${esc(a.name)}</h2><div class="tc">${esc(a.nameTC)}</div>` +
    `<div class="meta"><span>${esc(a.ca)}</span><span>${a.count.toLocaleString()} records</span>` +
    `<span>${a.archcat.toLocaleString()} architectural-category (${pct}%)</span>` +
    `<span><a class="ext" href="${esc(a.url)}" target="_blank" rel="noopener">View on M+ website ↗</a></span></div>`;
  const cats = new Set();
  ITEMS.filter(x => x.ca === ca).forEach(x => x.cat.forEach(c => cats.add(c)));
  $('#catFilter').innerHTML = '<option value="">All categories</option>' +
    [...cats].sort().map(c => `<option>${esc(c)}</option>`).join('');
  $('#archSearch').value = ''; $('#levelFilter').value = ''; $('#catFilter').value = '';
  renderRecords();
  window.scrollTo(0, 0);
}
function archiveRecords() {
  const q = $('#archSearch').value.trim().toLowerCase();
  const lvl = $('#levelFilter').value, cat = $('#catFilter').value;
  let recs = ITEMS.filter(x => x.ca === currentCA && x.lvl !== 'Fonds');
  if (lvl) recs = recs.filter(x => x.lvl === lvl || (lvl === 'Series' && x.lvl === 'Sub-fonds'));
  if (cat) recs = recs.filter(x => x.cat.includes(cat));
  if (q) recs = recs.filter(x => (x.t + ' ' + x.tc + ' ' + x.no + ' ' + x.cons.join(' ')).toLowerCase().includes(q));
  recs.sort(cmpNo);
  return recs;
}
function renderRecords() {
  const recs = archiveRecords();
  $('#recCount').textContent = recs.length.toLocaleString() + ' records shown';
  $('#recList').innerHTML = recs.length ? recs.map(x => {
    const depth = Math.max(0, x.no.split('/').length - 2);
    const row = recRow(x, false);
    return row.replace('class="rec', `style="padding-left:${10 + depth * 22}px" class="rec`);
  }).join('') : '<div class="empty">No records match.</div>';
  bindRows($('#recList'));
}

/* ---------- tag view ---------- */
function recordHasTag(x, type, label) {
  if (type === 'area') return x.area === label;
  if (type === 'category') return x.cat.includes(label);
  if (type === 'decade') return decadeOf(x) === label;
  if (type === 'nationality') return (x.nat || []).includes(label);
  if (type === 'medium') return x.med === label;
  return false;
}
function showTag(type, label) {
  currentCA = null; showView('tagView');
  const recs = ITEMS.filter(x => recordHasTag(x, type, label))
    .sort((a, b) => byCA[a.ca].name.localeCompare(byCA[b.ca].name) || cmpNo(a, b));
  const CAP = 600;
  $('#tagHead').innerHTML =
    `<h2><span class="chip" style="border-color:${TAG_COLORS[type]};color:${TAG_COLORS[type]}">${esc(type)}</span> ${esc(label)}</h2>` +
    `<div class="meta"><span>${recs.length.toLocaleString()} records across the 45 archives</span>${recs.length > CAP ? `<span>showing first ${CAP}</span>` : ''}</div>`;
  $('#tagList').innerHTML = recs.length ? recs.slice(0, CAP).map(x => recRow(x, true)).join('') : '<div class="empty">No records.</div>';
  bindRows($('#tagList'));
  window.scrollTo(0, 0);
}

/* ---------- item modal ---------- */
function openItem(id) {
  const x = byId[id]; if (!x) return;
  const a = byCA[x.ca];
  const row = (k, v) => v ? `<div class="row"><b>${k}:</b> ${v}</div>` : '';
  $('#itemModal').innerHTML = `<span class="close" id="modalClose">✕</span>
    <h3>${esc(x.t)}</h3>
    ${x.tc ? `<div class="row" style="font-size:15px">${esc(x.tc)}</div>` : ''}
    ${row('Reference', esc(x.no) + ' · ' + esc(x.lvl))}
    ${row('Archive', `<a class="ext" href="#/${esc(x.ca)}" id="modalArchLink">${esc(a.name)}</a> (${esc(x.ca)})`)}
    ${row('Date', esc(x.d))}
    ${row('Creator', x.cons.map(esc).join('; '))}
    ${row('Category', x.cat.map(c => `<span class="chip">${esc(c)}</span>`).join(''))}
    ${row('Area', esc(x.area))}
    ${row('Medium', esc(x.med))}
    ${row('Credit line', esc(x.cred))}
    <div class="row"><a class="ext" href="${esc(a.url)}" target="_blank" rel="noopener">Archive page on M+ website ↗</a></div>`;
  $('#modalBack').classList.add('open'); $('#itemModal').classList.add('open');
  $('#modalClose').addEventListener('click', closeItem);
  const link = $('#modalArchLink');
  if (link) link.addEventListener('click', closeItem);
}
function closeItem() { $('#modalBack').classList.remove('open'); $('#itemModal').classList.remove('open'); }
$('#modalBack').addEventListener('click', closeItem);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeItem(); });

/* ---------- global search ---------- */
$('#searchInput').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  const box = $('#searchResults');
  const searching = q.length >= 2;
  $('#archGrid').style.display = searching ? 'none' : '';
  $('#homeFlex').style.display = searching ? 'none' : '';
  if (!searching) { box.innerHTML = ''; return; }
  const hits = ITEMS.filter(x => (x.t + ' ' + x.tc + ' ' + x.no + ' ' + x.cons.join(' ')).toLowerCase().includes(q)).slice(0, 200);
  box.innerHTML = `<div style="padding:14px 0 6px;font-size:13px;color:var(--text-secondary)">${hits.length} result${hits.length === 1 ? '' : 's'}${hits.length === 200 ? ' (first 200)' : ''} for “${esc(e.target.value.trim())}”</div>` +
    hits.map(x => recRow(x, true)).join('');
  bindRows(box);
});

$('#sortButtons').addEventListener('click', e => {
  const b = e.target.closest('[data-sort]'); if (!b) return;
  sortMode = b.dataset.sort;
  document.querySelectorAll('#sortButtons .filter-btn').forEach(x => x.classList.toggle('active', x === b));
  renderGrid();
});
document.querySelectorAll('[data-home]').forEach(el => el.addEventListener('click', () => { location.hash = '#/'; }));
['archSearch', 'levelFilter', 'catFilter'].forEach(id =>
  $('#' + id).addEventListener('input', () => { if (currentCA) renderRecords(); }));

function route() {
  const tag = location.hash.match(/^#\/tag\/(\w+)\/(.+)$/);
  if (tag) { showTag(tag[1], decodeURIComponent(tag[2])); return; }
  const m = location.hash.match(/^#\/(CA\d+)$/);
  if (m) showArchive(m[1]); else showHome();
}
window.addEventListener('hashchange', route);
load().catch(err => { $('#statsStrip').innerHTML = '<span>Failed to load data: ' + esc(err.message) + '</span>'; });
