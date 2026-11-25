// M+ Collection Archives Explorer — architecture-related fonds (45)
// Data: data/archives.json (fonds), data/items.json (6,341 catalogued records)
let ARCHIVES = [], ITEMS = [], byCA = {}, byId = {};
let currentCA = null, sortMode = 'name';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function natKey(no) {
  return no.split('/').map(p => /^\d+$/.test(p) ? p.padStart(6, '0') : p);
}

async function load() {
  const [a, i] = await Promise.all([
    fetch('./data/archives.json?v=1').then(r => r.json()),
    fetch('./data/items.json?v=1').then(r => r.json()),
  ]);
  ARCHIVES = a; ITEMS = i;
  ARCHIVES.forEach(x => byCA[x.ca] = x);
  ITEMS.forEach(x => byId[x.id] = x);
  renderStats(); renderGrid(); route();
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

function showHome() {
  $('#archiveView').classList.remove('active');
  $('#homeView').classList.add('active');
  currentCA = null;
}

function showArchive(ca) {
  const a = byCA[ca];
  if (!a) { showHome(); return; }
  currentCA = ca;
  $('#homeView').classList.remove('active');
  $('#archiveView').classList.add('active');
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
  recs.sort((a, b) => { const ka = natKey(a.no), kb = natKey(b.no);
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) { const d = String(ka[i] ?? '').localeCompare(String(kb[i] ?? '')); if (d) return d; } return 0; });
  return recs;
}

const SERIES_LVLS = ['Fonds', 'Sub-fonds', 'Series', 'Subseries', 'Sub-subseries'];
function renderRecords() {
  const recs = archiveRecords();
  $('#recCount').textContent = recs.length.toLocaleString() + ' records shown';
  $('#recList').innerHTML = recs.length ? recs.map(x => {
    const depth = Math.max(0, x.no.split('/').length - 2);
    const isSeries = SERIES_LVLS.includes(x.lvl);
    return `<div class="rec${isSeries ? ' series-row' : ''}" data-id="${x.id}" style="padding-left:${10 + depth * 22}px">
      <span class="lvl${isSeries ? ' series' : ''}">${esc(x.lvl)}</span>
      <span class="no">${esc(x.no)}</span>
      <span class="ttl">${esc(x.t)}${x.tc ? `<span class="tc2">${esc(x.tc)}</span>` : ''}</span>
      <span class="dt">${esc(x.d)}</span></div>`;
  }).join('') : '<div class="empty">No records match.</div>';
  document.querySelectorAll('#recList .rec').forEach(el =>
    el.addEventListener('click', () => openItem(+el.dataset.id)));
}

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

// Global search across all 45 archives
$('#searchInput').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  const box = $('#searchResults');
  if (q.length < 2) { box.innerHTML = ''; $('#archGrid').style.display = ''; return; }
  const hits = ITEMS.filter(x => (x.t + ' ' + x.tc + ' ' + x.no + ' ' + x.cons.join(' ')).toLowerCase().includes(q)).slice(0, 200);
  $('#archGrid').style.display = 'none';
  box.innerHTML = `<div style="padding:14px 0 6px;font-size:13px;color:var(--text-secondary)">${hits.length} result${hits.length === 1 ? '' : 's'}${hits.length === 200 ? ' (first 200)' : ''} for “${esc(e.target.value.trim())}”</div>` +
    hits.map(x => `<div class="rec" data-id="${x.id}">
      <span class="lvl">${esc(x.lvl)}</span><span class="no">${esc(x.no)}</span>
      <span class="ttl">${esc(x.t)}${x.tc ? `<span class="tc2">${esc(x.tc)}</span>` : ''}<span class="tc2">— ${esc(byCA[x.ca].name)}</span></span>
      <span class="dt">${esc(x.d)}</span></div>`).join('');
  box.querySelectorAll('.rec').forEach(el => el.addEventListener('click', () => openItem(+el.dataset.id)));
});

$('#sortButtons').addEventListener('click', e => {
  const b = e.target.closest('[data-sort]'); if (!b) return;
  sortMode = b.dataset.sort;
  document.querySelectorAll('#sortButtons .filter-btn').forEach(x => x.classList.toggle('active', x === b));
  renderGrid();
});
$('#backLink').addEventListener('click', () => { location.hash = '#/'; });
['archSearch', 'levelFilter', 'catFilter'].forEach(id =>
  $('#' + id).addEventListener('input', () => { if (currentCA) renderRecords(); }));

function route() {
  const m = location.hash.match(/^#\/(CA\d+)$/);
  if (m) showArchive(m[1]); else showHome();
}
window.addEventListener('hashchange', route);
load().catch(err => { $('#statsStrip').innerHTML = '<span>Failed to load data: ' + esc(err.message) + '</span>'; });
