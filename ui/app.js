let activeNs = null;
let searchTimer = null;

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function preview(data) {
  return Object.entries(data).slice(0, 3)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length : (typeof v === 'object' && v !== null ? '{…}' : v)}`)
    .join('  ·  ');
}

function renderSidebar(namespaces) {
  const list = document.getElementById('ns-list');
  const total = namespaces.reduce((s, n) => s + n.count, 0);
  document.getElementById('total-count').textContent = total;

  if (!namespaces.length) {
    list.innerHTML = `<div class="ns-empty">No data yet.<br>Use archivist_write to start storing records.</div>`;
    return;
  }
  list.innerHTML = namespaces.map(n => `
    <div class="ns-item${n.namespace === activeNs ? ' active' : ''}" data-ns="${n.namespace}">
      <span class="ns-name">${n.namespace}</span>
      <span class="ns-count">${n.count}</span>
    </div>`).join('');

  list.querySelectorAll('.ns-item').forEach(item => {
    item.addEventListener('click', () => selectNs(item.dataset.ns));
  });
}

function renderRecords(records, metaText) {
  const list = document.getElementById('records-list');
  document.getElementById('toolbar-meta').textContent = metaText ?? '';

  if (!records.length) {
    list.innerHTML = `<div class="empty-state">
      <span class="empty-glyph">✦</span>
      <div class="empty-title">NO RESULTS</div>
      <div class="empty-sub">The search has concluded.<br>The universe contains no matching entries.</div>
    </div>`;
    return;
  }

  list.innerHTML = records.map(r => `
    <div class="record-card" data-id="${r.id}">
      <div class="record-head">
        <span class="record-toggle">▶</span>
        <span class="record-id">${r.id}</span>
        <span class="record-preview">${preview(r.data)}</span>
        <span class="record-date">${r.created_at.slice(0, 10)}</span>
      </div>
      <div class="record-body">
        <pre class="record-json">${JSON.stringify(r.data, null, 2)}</pre>
      </div>
    </div>`).join('');

  list.querySelectorAll('.record-card').forEach(card => {
    card.querySelector('.record-head').addEventListener('click', () => card.classList.toggle('expanded'));
  });
}

async function loadNamespaces() {
  const ns = await apiFetch('/api/namespaces');
  renderSidebar(ns);
  if (ns.length && !activeNs) selectNs(ns[0].namespace);
}

async function selectNs(ns) {
  activeNs = ns;
  document.getElementById('search-input').value = '';
  const all = await apiFetch('/api/namespaces');
  renderSidebar(all);
  await loadRecords(ns);
}

async function loadRecords(ns) {
  const records = await apiFetch(`/api/records?namespace=${encodeURIComponent(ns)}&limit=100`);
  renderRecords(records, `${records.length} ${records.length === 1 ? 'entry' : 'entries'}`);
}

async function runSearch(query) {
  const nsParam = activeNs ? `&namespace=${encodeURIComponent(activeNs)}` : '';
  const records = await apiFetch(`/api/search?q=${encodeURIComponent(query)}${nsParam}`);
  renderRecords(records, `${records.length} result${records.length !== 1 ? 's' : ''}`);
}

document.getElementById('search-input').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  searchTimer = setTimeout(() => {
    if (q) runSearch(q);
    else if (activeNs) loadRecords(activeNs);
  }, 300);
});

loadNamespaces().catch(() => {
  document.getElementById('records-list').innerHTML = `<div class="empty-state">
    <span class="empty-glyph">✦</span>
    <div class="empty-title">CONNECTION ERROR</div>
    <div class="empty-sub">Archivist is not responding.<br>Check that the daemon is running.</div>
  </div>`;
});
