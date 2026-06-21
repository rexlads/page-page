'use strict';

// --- tiny helpers -----------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, { method = 'GET', body, raw } = {}) {
  const opts = { method, headers: {} };
  if (body && !raw) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (raw) {
    opts.body = raw;
  }
  const res = await fetch('/api' + path, opts);
  if (res.status === 401) {
    showLogin();
    throw new Error('Sesi berakhir, silakan login lagi');
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || 'Terjadi kesalahan');
  return data;
}

function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  setTimeout(() => (t.className = 'toast hidden'), 2600);
}

function openModal(html) {
  $('#modalCard').innerHTML = html;
  $('#modal').classList.remove('hidden');
}
function closeModal() {
  $('#modal').classList.add('hidden');
  $('#modalCard').innerHTML = '';
}
$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});

function qrModal(url) {
  const src = '/api/qr?data=' + encodeURIComponent(url);
  openModal(`
    <h3>QR Code</h3>
    <p class="muted" style="word-break:break-all">${esc(url)}</p>
    <div style="text-align:center;margin:14px 0">
      <img src="${src}" alt="QR" style="width:240px;height:240px;border-radius:14px;background:#fff;padding:8px">
    </div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Tutup</button>
      <a class="btn primary" href="${src}" download="qr.png">Download PNG</a>
    </div>`);
}
window.qrModal = qrModal;

let BASE_URL = location.origin;

// Theme presets mirrored from the server (src/routes/public.js).
const PRESETS = {
  midnight: { bg: 'linear-gradient(160deg,#0f172a,#1e293b)', text_color: '#f8fafc', accent: '#6366f1' },
  aurora: { bg: 'linear-gradient(160deg,#0f2027,#203a43,#2c5364)', text_color: '#eafff7', accent: '#2dd4bf' },
  sunset: { bg: 'linear-gradient(160deg,#42275a,#734b6d)', text_color: '#fff5f7', accent: '#fb7185' },
  candy: { bg: 'linear-gradient(160deg,#ff9a9e,#fecfef)', text_color: '#3a2330', accent: '#d946ef' },
  forest: { bg: 'linear-gradient(160deg,#134e5e,#71b280)', text_color: '#f0fff4', accent: '#34d399' },
  mono: { bg: '#0b0b0c', text_color: '#fafafa', accent: '#a3a3a3' },
  light: { bg: 'linear-gradient(160deg,#f8fafc,#e2e8f0)', text_color: '#0f172a', accent: '#6366f1' },
};
const FONTS = ['system', 'Inter', 'Poppins', 'Montserrat', 'Space Grotesk'];

// --- auth -------------------------------------------------------------------
function showLogin() {
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}
function showApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try {
    await api('/auth/login', {
      method: 'POST',
      body: { username: $('#loginUser').value, password: $('#loginPass').value },
    });
    showApp();
    navigate('dashboard');
  } catch (err) {
    $('#loginError').textContent = err.message;
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' });
  showLogin();
});

// --- navigation -------------------------------------------------------------
const views = {};
function navigate(name) {
  $$('.sidebar nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === name));
  (views[name] || views.dashboard)();
}
$$('.sidebar nav a').forEach((a) => a.addEventListener('click', () => navigate(a.dataset.view)));

// ===========================================================================
// DASHBOARD
// ===========================================================================
views.dashboard = async () => {
  const v = $('#view');
  v.innerHTML = `<h2>Dashboard</h2><p class="sub">Ringkasan akun kamu</p><div class="cards" id="stats"></div>`;
  try {
    const s = await api('/stats');
    const cards = [
      ['Biolink Pages', s.pages],
      ['Total Tombol', s.buttons],
      ['Short Links', s.links],
      ['Total Views', s.page_views],
      ['Klik Tombol', s.button_clicks],
      ['Klik Short Link', s.link_clicks],
    ];
    $('#stats').innerHTML = cards
      .map(([lbl, num]) => `<div class="card stat"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`)
      .join('');
  } catch (e) {
    toast(e.message, true);
  }
};

// ===========================================================================
// PAGES (biolinks)
// ===========================================================================
views.pages = async () => {
  const v = $('#view');
  v.innerHTML = `
    <div class="row-between"><h2>Biolink Pages</h2>
      <button class="btn primary" id="newPage">+ Page Baru</button></div>
    <p class="sub">Halaman bio-link dengan banyak tombol yang bisa dikustomisasi.</p>
    <div class="list" id="pageList"></div>`;
  $('#newPage').addEventListener('click', () => pageModal());

  const pages = await api('/pages');
  $('#pageList').innerHTML =
    pages
      .map(
        (p) => `
    <div class="item">
      <div class="meta">
        <div class="title">${esc(p.title || p.slug)}
          ${p.published ? '' : '<span class="tag">draft</span>'}
          <span class="tag">${p.buttons_count} tombol</span>
          <span class="tag">${p.views} views</span>
        </div>
        <div class="desc">${BASE_URL}/${esc(p.slug)}</div>
      </div>
      <div class="actions">
        <a class="btn sm ghost" href="/${esc(p.slug)}" target="_blank">Lihat</a>
        <button class="btn sm" data-edit="${p.id}">Edit Tombol</button>
        <button class="btn sm ghost" data-settings="${p.id}">Setelan</button>
        <button class="btn sm ghost" data-qr="${esc(p.slug)}">QR</button>
        <button class="btn sm danger" data-del="${p.id}">Hapus</button>
      </div>
    </div>`
      )
      .join('') || '<p class="muted">Belum ada page. Buat satu untuk mulai.</p>';

  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => editButtons(+b.dataset.edit)));
  $$('[data-settings]').forEach((b) => b.addEventListener('click', () => pageModal(+b.dataset.settings)));
  $$('[data-qr]').forEach((b) => b.addEventListener('click', () => qrModal(`${BASE_URL}/${b.dataset.qr}`)));
  $$('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Hapus page ini beserta semua tombolnya?')) return;
      await api('/pages/' + b.dataset.del, { method: 'DELETE' });
      toast('Page dihapus');
      views.pages();
    })
  );
};

async function pageModal(id) {
  let p = { slug: '', title: '', description: '', avatar: '', theme: {}, published: 1 };
  if (id) p = await api('/pages/' + id);
  let theme = {};
  try {
    theme = typeof p.theme === 'string' ? JSON.parse(p.theme || '{}') : p.theme || {};
  } catch (_) {}

  openModal(`
    <h3>${id ? 'Setelan Page' : 'Page Baru'}</h3>
    <label>Slug (alamat URL)</label>
    <input id="f_slug" value="${esc(p.slug)}" placeholder="namaku">
    <div class="hint">URL: ${BASE_URL}/<b id="slugPrev">${esc(p.slug || 'namaku')}</b></div>
    <label>Judul</label>
    <input id="f_title" value="${esc(p.title)}" placeholder="Nama / Brand">
    <label>Bio / Deskripsi</label>
    <textarea id="f_desc" placeholder="Deskripsi singkat">${esc(p.description)}</textarea>
    <label>Avatar (URL gambar)</label>
    <div class="color-row">
      <input id="f_avatar" value="${esc(p.avatar)}" placeholder="/uploads/... atau https://...">
      <input type="file" id="f_avatarFile" accept="image/*" style="width:auto">
    </div>
    <label>Tema (preset)</label>
    <div class="swatches" id="swatches">
      ${Object.entries(PRESETS)
        .map(
          ([k, v]) =>
            `<button type="button" class="swatch" data-preset="${k}" title="${k}" style="background:${v.bg}"><span>${k}</span></button>`
        )
        .join('')}
    </div>
    <div class="grid2">
      <div><label>Warna Background (CSS)</label>
        <input id="f_bg" value="${esc(theme.bg || PRESETS.midnight.bg)}"></div>
      <div><label>Warna Teks</label>
        <input id="f_textcolor" value="${esc(theme.text_color || '#f8fafc')}"></div>
    </div>
    <div class="grid2">
      <div><label>Warna Aksen</label>
        <div class="color-row"><input type="color" id="f_accent" value="${esc(theme.accent || '#6366f1')}"><input id="f_accent_t" value="${esc(theme.accent || '#6366f1')}"></div>
      </div>
      <div><label>Font</label>
        <select id="f_font">${FONTS.map((f) => `<option ${(theme.font || 'system') === f ? 'selected' : ''}>${f}</option>`).join('')}</select>
      </div>
    </div>
    <div class="grid2">
      <label style="margin:8px 0"><input type="checkbox" id="f_glass" ${theme.glass !== false ? 'checked' : ''} style="width:auto"> Efek kaca (glass) pada tombol</label>
      <label style="margin:8px 0"><input type="checkbox" id="f_animate" ${theme.animate !== false ? 'checked' : ''} style="width:auto"> Animasi masuk tombol</label>
    </div>
    <label><input type="checkbox" id="f_pub" ${p.published ? 'checked' : ''} style="width:auto"> Published (aktif untuk publik)</label>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Batal</button>
      <button class="btn primary" id="savePage">Simpan</button>
    </div>`);

  $('#f_slug').addEventListener('input', (e) => ($('#slugPrev').textContent = e.target.value || 'namaku'));

  // theme preset swatches
  $$('#swatches .swatch').forEach((sw) =>
    sw.addEventListener('click', () => {
      const t = PRESETS[sw.dataset.preset];
      $('#f_bg').value = t.bg;
      $('#f_textcolor').value = t.text_color;
      $('#f_accent').value = t.accent;
      $('#f_accent_t').value = t.accent;
      $('#f_bg').dataset.preset = sw.dataset.preset;
      $$('#swatches .swatch').forEach((x) => x.classList.toggle('active', x === sw));
    })
  );
  $('#f_accent').addEventListener('input', () => ($('#f_accent_t').value = $('#f_accent').value));
  $('#f_accent_t').addEventListener('input', () => {
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test($('#f_accent_t').value)) $('#f_accent').value = $('#f_accent_t').value;
  });

  $('#f_avatarFile').addEventListener('change', async (e) => {
    const url = await uploadFile(e.target.files[0]);
    if (url) {
      $('#f_avatar').value = url;
      toast('Gambar diupload');
    }
  });

  $('#savePage').addEventListener('click', async () => {
    const payload = {
      slug: $('#f_slug').value.trim(),
      title: $('#f_title').value,
      description: $('#f_desc').value,
      avatar: $('#f_avatar').value.trim(),
      published: $('#f_pub').checked,
      theme: {
        preset: $('#f_bg').dataset.preset || theme.preset || '',
        bg: $('#f_bg').value,
        text_color: $('#f_textcolor').value,
        accent: $('#f_accent_t').value || $('#f_accent').value,
        font: $('#f_font').value,
        glass: $('#f_glass').checked,
        animate: $('#f_animate').checked,
      },
    };
    try {
      if (id) await api('/pages/' + id, { method: 'PUT', body: payload });
      else await api('/pages', { method: 'POST', body: payload });
      closeModal();
      toast('Tersimpan');
      views.pages();
    } catch (e) {
      toast(e.message, true);
    }
  });
}

async function uploadFile(file) {
  if (!file) return null;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const r = await api('/upload', { method: 'POST', raw: fd });
    return r.url;
  } catch (e) {
    toast(e.message, true);
    return null;
  }
}

// ===========================================================================
// BUTTON EDITOR (per page) — includes the cloaking controls
// ===========================================================================
async function editButtons(pageId) {
  const page = await api('/pages/' + pageId);
  const v = $('#view');
  v.innerHTML = `
    <div class="row-between">
      <h2>Tombol · ${esc(page.title || page.slug)}</h2>
      <div>
        <button class="btn ghost" id="back">← Kembali</button>
        <button class="btn primary" id="addBtn">+ Tambah Tombol</button>
      </div>
    </div>
    <p class="sub">Atur tombol, tampilan, <b>cloaking per negara</b>, dan <b>jadwal</b>. Seret untuk mengubah urutan.</p>
    <div class="editor-layout">
      <div id="btnList" class="editor-col"></div>
      <div class="preview-col">
        <div class="phone"><iframe id="previewFrame" title="preview" src="/${encodeURIComponent(page.slug)}"></iframe></div>
        <button class="btn ghost sm" id="refreshPrev">🔄 Refresh preview</button>
        <div class="hint" style="text-align:center">Preview live halaman publikmu</div>
      </div>
    </div>`;
  $('#back').addEventListener('click', () => navigate('pages'));
  $('#refreshPrev').addEventListener('click', () => {
    const f = $('#previewFrame');
    f.src = f.src;
  });
  $('#addBtn').addEventListener('click', async () => {
    await api(`/pages/${pageId}/buttons`, { method: 'POST', body: { label: 'Tombol baru', url: 'https://' } });
    editButtons(pageId);
  });

  renderButtonList(page);
}

function renderButtonList(page) {
  const list = $('#btnList');
  if (!page.buttons.length) {
    list.innerHTML = '<p class="muted">Belum ada tombol. Klik "Tambah Tombol".</p>';
    return;
  }
  list.innerHTML = page.buttons.map((b) => buttonEditorHtml(b)).join('');

  page.buttons.forEach((b) => bindButtonEditor(b, page.id));
  enableDragReorder(list, page.id);
}

function buttonEditorHtml(b) {
  const cloakTag =
    b.cloak_mode !== 'off'
      ? `<span class="tag cloak">🌍 ${b.cloak_mode === 'allow' ? 'Hanya' : 'Blokir'}: ${esc(b.cloak_countries || '-')}</span>`
      : '';
  return `
  <div class="btn-editor" draggable="true" data-id="${b.id}">
    <div class="head">
      <strong>☰ ${esc(b.label || '(tanpa nama)')}</strong>
      <div>
        ${b.enabled ? '<span class="tag ok">aktif</span>' : '<span class="tag">nonaktif</span>'}
        ${cloakTag}
        <span class="tag">${b.clicks} klik</span>
      </div>
    </div>
    <div class="grid2" style="margin-top:10px">
      <div><label>Teks Tombol</label><input data-f="label" value="${esc(b.label)}"></div>
      <div><label>URL Tujuan</label><input data-f="url" value="${esc(b.url)}"></div>
    </div>
    <div class="grid2">
      <div><label>Ikon (emoji opsional)</label><input data-f="icon" value="${esc(b.icon)}" placeholder="🔥"></div>
      <div><label>Gaya</label>
        <select data-f="style">
          ${['filled', 'outline', 'soft', 'pill'].map((s) => `<option ${b.style === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="grid2">
      <div><label>Warna Tombol</label>
        <div class="color-row"><input type="color" data-f="bg_color" value="${esc(b.bg_color)}"><input data-f="bg_color_t" value="${esc(b.bg_color)}"></div>
      </div>
      <div><label>Warna Teks</label>
        <div class="color-row"><input type="color" data-f="text_color" value="${esc(b.text_color)}"><input data-f="text_color_t" value="${esc(b.text_color)}"></div>
      </div>
    </div>

    <label>🌍 Cloaking (sembunyikan dari negara tertentu)</label>
    <div class="grid2">
      <div>
        <select data-f="cloak_mode">
          <option value="off" ${b.cloak_mode === 'off' ? 'selected' : ''}>Nonaktif (tampil ke semua)</option>
          <option value="allow" ${b.cloak_mode === 'allow' ? 'selected' : ''}>Hanya tampil ke negara berikut</option>
          <option value="block" ${b.cloak_mode === 'block' ? 'selected' : ''}>Sembunyikan dari negara berikut</option>
        </select>
      </div>
      <div><input data-f="cloak_countries" value="${esc(b.cloak_countries)}" placeholder="ID, US, SG"></div>
    </div>
    <div class="hint">Pakai kode negara ISO (2 huruf), pisahkan dengan koma. Contoh: <b>ID, MY, SG</b></div>

    <label>⏰ Jadwal tampil (opsional)</label>
    <div class="grid2">
      <div><span class="hint">Mulai tampil</span><input type="datetime-local" data-f="start_at" value="${esc(b.start_at || '')}"></div>
      <div><span class="hint">Berhenti tampil</span><input type="datetime-local" data-f="end_at" value="${esc(b.end_at || '')}"></div>
    </div>

    <div class="modal-actions" style="margin-top:14px">
      <label style="margin:0"><input type="checkbox" data-f="enabled" ${b.enabled ? 'checked' : ''} style="width:auto"> Aktif</label>
      <button class="btn danger sm" data-delbtn="${b.id}">Hapus</button>
      <button class="btn primary sm" data-savebtn="${b.id}">Simpan</button>
    </div>
  </div>`;
}

function bindButtonEditor(b, pageId) {
  const root = $(`.btn-editor[data-id="${b.id}"]`);
  // keep color picker + text field in sync
  ['bg_color', 'text_color'].forEach((f) => {
    const picker = root.querySelector(`[data-f="${f}"]`);
    const text = root.querySelector(`[data-f="${f}_t"]`);
    picker.addEventListener('input', () => (text.value = picker.value));
    text.addEventListener('input', () => {
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text.value)) picker.value = text.value;
    });
  });

  root.querySelector(`[data-savebtn="${b.id}"]`).addEventListener('click', async () => {
    const g = (f) => root.querySelector(`[data-f="${f}"]`);
    const payload = {
      label: g('label').value,
      url: g('url').value,
      icon: g('icon').value,
      style: g('style').value,
      bg_color: g('bg_color_t').value || g('bg_color').value,
      text_color: g('text_color_t').value || g('text_color').value,
      enabled: g('enabled').checked,
      cloak_mode: g('cloak_mode').value,
      cloak_countries: g('cloak_countries').value,
      start_at: g('start_at').value,
      end_at: g('end_at').value,
    };
    try {
      await api('/buttons/' + b.id, { method: 'PUT', body: payload });
      toast('Tombol disimpan');
      editButtons(pageId);
    } catch (e) {
      toast(e.message, true);
    }
  });

  root.querySelector(`[data-delbtn="${b.id}"]`).addEventListener('click', async () => {
    if (!confirm('Hapus tombol ini?')) return;
    await api('/buttons/' + b.id, { method: 'DELETE' });
    editButtons(pageId);
  });
}

function enableDragReorder(list, pageId) {
  let dragEl = null;
  list.addEventListener('dragstart', (e) => {
    dragEl = e.target.closest('.btn-editor');
    if (dragEl) dragEl.style.opacity = '0.4';
  });
  list.addEventListener('dragend', async () => {
    if (!dragEl) return;
    dragEl.style.opacity = '';
    dragEl = null;
    const order = $$('.btn-editor', list).map((el) => +el.dataset.id);
    await api('/buttons/reorder', { method: 'POST', body: { order } });
  });
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const after = getDragAfter(list, e.clientY);
    if (!dragEl) return;
    if (after == null) list.appendChild(dragEl);
    else list.insertBefore(dragEl, after);
  });
}
function getDragAfter(list, y) {
  const els = $$('.btn-editor:not([style*="opacity"])', list);
  return els.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    },
    { offset: -Infinity, element: null }
  ).element;
}

// ===========================================================================
// SHORT LINKS
// ===========================================================================
views.links = async () => {
  const v = $('#view');
  v.innerHTML = `
    <div class="row-between"><h2>Link Shortener</h2>
      <button class="btn primary" id="newLink">+ Short Link</button></div>
    <p class="sub">Persingkat URL apa pun. Mendukung cloaking per negara juga.</p>
    <div class="list" id="linkList"></div>`;
  $('#newLink').addEventListener('click', () => linkModal());

  const links = await api('/links');
  $('#linkList').innerHTML =
    links
      .map(
        (l) => `
    <div class="item">
      <div class="meta">
        <div class="title">${BASE_URL}/${esc(l.code)}
          ${l.enabled ? '' : '<span class="tag">off</span>'}
          ${l.cloak_mode !== 'off' ? `<span class="tag cloak">🌍 ${l.cloak_mode}</span>` : ''}
          <span class="tag">${l.clicks} klik</span>
        </div>
        <div class="desc">→ ${esc(l.target_url)}</div>
      </div>
      <div class="actions">
        <button class="btn sm ghost" data-copy="${esc(l.code)}">Salin</button>
        <button class="btn sm ghost" data-qr="${esc(l.code)}">QR</button>
        <button class="btn sm" data-edit="${l.id}">Edit</button>
        <button class="btn sm danger" data-del="${l.id}">Hapus</button>
      </div>
    </div>`
      )
      .join('') || '<p class="muted">Belum ada short link.</p>';

  $$('[data-copy]').forEach((b) =>
    b.addEventListener('click', () => {
      navigator.clipboard.writeText(`${BASE_URL}/${b.dataset.copy}`);
      toast('Tersalin ke clipboard');
    })
  );
  $$('[data-qr]').forEach((b) => b.addEventListener('click', () => qrModal(`${BASE_URL}/${b.dataset.qr}`)));
  $$('[data-edit]').forEach((b) => b.addEventListener('click', () => linkModal(+b.dataset.edit, links)));
  $$('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('Hapus short link ini?')) return;
      await api('/links/' + b.dataset.del, { method: 'DELETE' });
      views.links();
    })
  );
};

function linkModal(id, links) {
  const l = id ? links.find((x) => x.id === id) : { code: '', target_url: 'https://', title: '', cloak_mode: 'off', cloak_countries: '', cloak_fallback: '', enabled: 1 };
  openModal(`
    <h3>${id ? 'Edit Short Link' : 'Short Link Baru'}</h3>
    <label>Kode (kosongkan untuk acak)</label>
    <input id="l_code" value="${esc(l.code)}" ${id ? 'disabled' : ''} placeholder="promo">
    <label>URL Tujuan</label>
    <input id="l_url" value="${esc(l.target_url)}" placeholder="https://...">
    <label>Judul (opsional, untuk catatanmu)</label>
    <input id="l_title" value="${esc(l.title)}">
    <label>🌍 Cloaking</label>
    <div class="grid2">
      <select id="l_mode">
        <option value="off" ${l.cloak_mode === 'off' ? 'selected' : ''}>Nonaktif</option>
        <option value="allow" ${l.cloak_mode === 'allow' ? 'selected' : ''}>Hanya negara berikut</option>
        <option value="block" ${l.cloak_mode === 'block' ? 'selected' : ''}>Blokir negara berikut</option>
      </select>
      <input id="l_countries" value="${esc(l.cloak_countries)}" placeholder="ID, US">
    </div>
    <label>URL pengalihan untuk pengunjung yang diblokir (opsional)</label>
    <input id="l_fallback" value="${esc(l.cloak_fallback || '')}" placeholder="https://...">
    ${id ? `<label><input type="checkbox" id="l_enabled" ${l.enabled ? 'checked' : ''} style="width:auto"> Aktif</label>` : ''}
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Batal</button>
      <button class="btn primary" id="saveLink">Simpan</button>
    </div>`);

  $('#saveLink').addEventListener('click', async () => {
    const payload = {
      target_url: $('#l_url').value.trim(),
      title: $('#l_title').value,
      cloak_mode: $('#l_mode').value,
      cloak_countries: $('#l_countries').value,
      cloak_fallback: $('#l_fallback').value.trim(),
    };
    try {
      if (id) {
        payload.enabled = $('#l_enabled').checked;
        await api('/links/' + id, { method: 'PUT', body: payload });
      } else {
        payload.code = $('#l_code').value.trim();
        await api('/links', { method: 'POST', body: payload });
      }
      closeModal();
      toast('Tersimpan');
      views.links();
    } catch (e) {
      toast(e.message, true);
    }
  });
}

// ===========================================================================
// ANALYTICS
// ===========================================================================
const FLAGS = {}; // optional emoji flags; fall back to code
function flag(cc) {
  if (!cc || cc.length !== 2 || cc === 'XX') return '🏳️';
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

views.analytics = async () => {
  const v = $('#view');
  v.innerHTML = `
    <div class="row-between"><h2>Analytics</h2>
      <select id="range" style="width:auto">
        <option value="7">7 hari</option>
        <option value="30" selected>30 hari</option>
        <option value="90">90 hari</option>
        <option value="365">1 tahun</option>
      </select>
    </div>
    <p class="sub">Statistik kunjungan & klik, termasuk rincian per negara.</p>
    <div id="aBody"><p class="muted">Memuat...</p></div>`;

  const load = async () => {
    const days = $('#range').value;
    const a = await api('/analytics?days=' + days);
    const types = Object.fromEntries(a.byType.map((t) => [t.type, t.n]));
    const maxC = Math.max(1, ...a.byCountry.map((c) => c.n));
    const maxD = Math.max(1, ...a.daily.map((d) => Math.max(d.views, d.clicks)));

    const countryRows =
      a.byCountry
        .map(
          (c) => `
        <div class="bar-row">
          <div class="bar-label">${flag(c.country)} ${esc(c.country)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(c.n / maxC) * 100}%"></div></div>
          <div class="bar-val">${c.n}</div>
        </div>`
        )
        .join('') || '<p class="muted">Belum ada data.</p>';

    const dailyBars =
      a.daily
        .map(
          (d) => `
        <div class="spark" title="${d.day}: ${d.views} views, ${d.clicks} klik">
          <div class="spark-bar v" style="height:${(d.views / maxD) * 100}%"></div>
          <div class="spark-bar c" style="height:${(d.clicks / maxD) * 100}%"></div>
        </div>`
        )
        .join('') || '<p class="muted">Belum ada data.</p>';

    const topList = (arr, key, label) =>
      arr.length
        ? arr.map((x) => `<div class="mini"><span>${esc(x[label] || x[key])}</span><b>${x.clicks ?? x.views}</b></div>`).join('')
        : '<p class="muted">—</p>';

    $('#aBody').innerHTML = `
      <div class="cards">
        <div class="card stat"><div class="num">${types.page_view || 0}</div><div class="lbl">Page Views</div></div>
        <div class="card stat"><div class="num">${types.button_click || 0}</div><div class="lbl">Klik Tombol</div></div>
        <div class="card stat"><div class="num">${types.short_click || 0}</div><div class="lbl">Klik Short Link</div></div>
        <div class="card stat"><div class="num">${a.blocked || 0}</div><div class="lbl">Diblokir (cloaking)</div></div>
      </div>

      <div class="card" style="margin-top:16px">
        <h3>Aktivitas harian</h3>
        <div class="legend"><span class="dot v"></span> views <span class="dot c"></span> klik</div>
        <div class="sparkline">${dailyBars}</div>
      </div>

      <div class="grid2" style="margin-top:16px">
        <div class="card">
          <h3>🌍 Per Negara</h3>
          <div class="bars">${countryRows}</div>
        </div>
        <div>
          <div class="card"><h3>Top Pages</h3>${topList(a.topPages, 'slug', 'title')}</div>
          <div class="card" style="margin-top:12px"><h3>Top Short Links</h3>${topList(a.topLinks, 'code', 'title')}</div>
          <div class="card" style="margin-top:12px"><h3>Top Tombol</h3>${topList(a.topButtons, 'label', 'label')}</div>
        </div>
      </div>`;
  };

  $('#range').addEventListener('change', load);
  try {
    await load();
  } catch (e) {
    toast(e.message, true);
  }
};

// ===========================================================================
// BACKUP (export / import)
// ===========================================================================
views.backup = async () => {
  const v = $('#view');
  v.innerHTML = `
    <h2>Export / Import</h2>
    <p class="sub">Cadangkan atau pindahkan SELURUH domain (database + semua file upload) dalam satu file .zip. Tidak bergantung pada GitHub.</p>
    <div class="cards">
      <div class="card">
        <h3>⬇️ Export</h3>
        <p class="muted">Unduh seluruh data: database SQLite + folder uploads + manifest, dalam satu .zip.</p>
        <button class="btn primary" id="doExport">Download Backup (.zip)</button>
      </div>
      <div class="card">
        <h3>⬆️ Import</h3>
        <p class="muted"><b>Peringatan:</b> ini menimpa SEMUA data saat ini dengan isi backup.</p>
        <input type="file" id="importFile" accept=".zip" style="margin-bottom:10px">
        <button class="btn danger" id="doImport">Restore dari Backup</button>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <h3>Via terminal (otomatis / cron)</h3>
      <p class="muted">Export: <code>npm run export</code> &nbsp;·&nbsp; Import: <code>node scripts/import.js backups/namafile.zip</code></p>
    </div>`;

  $('#doExport').addEventListener('click', () => {
    window.location.href = '/api/backup/export';
    toast('Membuat backup...');
  });

  $('#doImport').addEventListener('click', async () => {
    const file = $('#importFile').files[0];
    if (!file) return toast('Pilih file .zip dulu', true);
    if (!confirm('Yakin restore? Semua data saat ini akan DITIMPA.')) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api('/backup/import', { method: 'POST', raw: fd });
      toast('Restore berhasil!');
      console.log('Restored:', r.restored);
      setTimeout(() => navigate('dashboard'), 800);
    } catch (e) {
      toast(e.message, true);
    }
  });
};

// ===========================================================================
// SETTINGS
// ===========================================================================
views.settings = async () => {
  const s = await api('/settings');
  const v = $('#view');
  v.innerHTML = `
    <h2>Pengaturan</h2><p class="sub">Konfigurasi situs dan keamanan akun.</p>
    <div class="card" style="max-width:520px">
      <label>Judul Situs</label>
      <input id="s_title" value="${esc(s.site_title)}">
      <button class="btn primary" id="saveSite" style="margin-top:12px">Simpan</button>
    </div>
    <div class="card" style="max-width:520px;margin-top:16px">
      <h3>Ganti Password</h3>
      <label>Password Saat Ini</label><input type="password" id="p_cur">
      <label>Password Baru</label><input type="password" id="p_new">
      <button class="btn primary" id="savePass" style="margin-top:12px">Ubah Password</button>
    </div>`;

  $('#saveSite').addEventListener('click', async () => {
    await api('/settings', { method: 'PUT', body: { site_title: $('#s_title').value } });
    toast('Tersimpan');
  });
  $('#savePass').addEventListener('click', async () => {
    try {
      await api('/settings/password', { method: 'POST', body: { current: $('#p_cur').value, next: $('#p_new').value } });
      toast('Password diubah');
      $('#p_cur').value = $('#p_new').value = '';
    } catch (e) {
      toast(e.message, true);
    }
  });
};

// expose for inline onclick
window.closeModal = closeModal;

// --- boot -------------------------------------------------------------------
(async () => {
  try {
    const s = await fetch('/api/settings');
    if (s.ok) {
      const data = await s.json();
      if (data.base_url) BASE_URL = data.base_url;
      showApp();
      navigate('dashboard');
    } else {
      showLogin();
    }
  } catch (_) {
    showLogin();
  }
})();
