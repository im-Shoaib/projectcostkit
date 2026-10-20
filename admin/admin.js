/* ProjectCostKit admin: edits the site folder on this computer with the File System Access API. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var root = null;              // FileSystemDirectoryHandle of the site folder
  var site = null, posts = [], pages = [];
  var current = null, currentIsNew = false, currentPage = null;

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(msg, isError) {
    var t = $('#toast');
    t.textContent = msg; t.className = 'toast' + (isError ? ' error' : ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, isError ? 8000 : 3500);
  }

  /* ---------- remember the folder between visits (IndexedDB) ---------- */
  function idb(mode, fn) {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open('pck-admin', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
        req.onsuccess = function () {
          var tx = req.result.transaction('kv', mode); var st = tx.objectStore('kv');
          var r = fn(st); tx.oncomplete = function () { resolve(r && r.result); }; tx.onerror = function () { resolve(null); };
        };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  /* ---------- file helpers ---------- */
  async function dirAt(path, create) {
    var parts = path.split('/').filter(Boolean), d = root;
    for (var i = 0; i < parts.length; i++) d = await d.getDirectoryHandle(parts[i], { create: !!create });
    return d;
  }
  async function fileHandle(path, create) {
    var parts = path.split('/').filter(Boolean), name = parts.pop();
    var d = await dirAt(parts.join('/'), create);
    return d.getFileHandle(name, { create: !!create });
  }
  async function readText(path) { var h = await fileHandle(path); var f = await h.getFile(); return f.text(); }
  async function exists(path) { try { await fileHandle(path); return true; } catch (e) { return false; } }
  async function writeFile(path, data) {
    if (typeof data === 'string' && await exists(path)) { if (await readText(path) === data) return false; }
    var h = await fileHandle(path, true); var w = await h.createWritable(); await w.write(data); await w.close(); return true;
  }
  async function removeFile(path) {
    var parts = path.split('/').filter(Boolean), name = parts.pop();
    try { var d = await dirAt(parts.join('/')); await d.removeEntry(name); } catch (e) { /* already gone */ }
    // remove empty parent folders
    while (parts.length) {
      try {
        var dd = await dirAt(parts.join('/')); var empty = true;
        for await (var k of dd.keys()) { empty = false; void k; break; }
        if (!empty) break;
        var nm = parts.pop(); var parent = await dirAt(parts.join('/')); await parent.removeEntry(nm);
      } catch (e) { break; }
    }
  }
  async function listJson(path) {
    var out = [];
    try { var d = await dirAt(path); for await (var e of d.values()) if (e.kind === 'file' && /\.json$/.test(e.name)) out.push(e.name); } catch (e) { return []; }
    out.sort();
    var data = [];
    for (var i = 0; i < out.length; i++) {
      try { data.push(JSON.parse(await readText(path + '/' + out[i]))); }
      catch (err) { toast('Could not read ' + path + '/' + out[i] + ': ' + err.message, true); }
    }
    return data;
  }
  function json(o) { return JSON.stringify(o, null, 2) + '\n'; }

  /* ---------- open the folder ---------- */
  async function useFolder(handle) {
    var perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') { toast('Permission to edit the folder was not given.', true); return; }
    root = handle;
    if (!(await exists('content/site.json')) || !(await exists('build.js'))) { toast('That folder does not look like the site. Pick the folder that has build.js and the content folder in it.', true); root = null; return; }
    await idb('readwrite', function (st) { return st.put(handle, 'root'); });
    $('#folder-status').textContent = 'Folder: ' + handle.name;
    $('#intro').hidden = true; $('#tabs').hidden = false; $('#rebuild').disabled = false;
    await loadAll();
    showTab('articles');
  }
  var lastHandle = null;
  async function pick() {
    if (lastHandle) { var h0 = lastHandle; lastHandle = null; try { await useFolder(h0); if (root) return; } catch (e) { /* pick again */ } }
    if (!window.showDirectoryPicker) { $('#unsupported').hidden = false; return; }
    try { var h = await window.showDirectoryPicker({ mode: 'readwrite' }); await useFolder(h); } catch (e) { if (e.name !== 'AbortError') toast(e.message, true); }
  }
  async function loadAll() {
    site = JSON.parse(await readText('content/site.json'));
    posts = await listJson('content/posts');
    pages = await listJson('content/pages');
    renderPostList(); renderPageList(); fillSettings(); fillSelects();
  }

  /* ---------- tabs ---------- */
  function showTab(name) {
    ['articles', 'pages', 'settings', 'editor'].forEach(function (t) { $('#' + t).hidden = t !== name; });
    $$('#tabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tab') === name || (name === 'editor' && b.getAttribute('data-tab') === 'articles'))); });
    window.scrollTo(0, 0);
  }

  /* ---------- articles ---------- */
  function today() { return PCK_BUILDER.localDate(new Date()); }
  function statusOf(p) { if (p.status === 'draft') return 'draft'; if (!p.date || p.date > today()) return 'scheduled'; return 'live'; }
  function catName(slug) { var c = (site.categories || []).filter(function (x) { return x.slug === slug; })[0]; return c ? c.name : slug || ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function renderPostList() {
    var q = ($('#filter').value || '').toLowerCase();
    var list = posts.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || a.slug.localeCompare(b.slug); })
      .filter(function (p) { return !q || (p.title || '').toLowerCase().indexOf(q) > -1; });
    $('#post-list').innerHTML = list.map(function (p) {
      var s = statusOf(p);
      return '<tr data-slug="' + esc(p.slug) + '"><td>' + esc(p.title) + (p.tool ? ' <span class="muted">(calculator)</span>' : '') + '</td><td>' + esc(catName(p.category)) + '</td><td>' + esc(p.date || '') + '</td><td><span class="badge ' + s + '">' + s + '</span></td></tr>';
    }).join('') || '<tr><td colspan="4" class="muted">No articles yet.</td></tr>';
  }
  function fillSelects() {
    $('[name=category]', $('#ed-form')).innerHTML = (site.categories || []).map(function (c) { return '<option value="' + esc(c.slug) + '">' + esc(c.name) + '</option>'; }).join('');
    var ids = window.PCK_CALC ? Object.keys(window.PCK_CALC.CALCS).filter(function (k) { return k !== 'paint-quick'; }) : [];
    $('[name=toolId]', $('#ed-form')).innerHTML = '<option value="">None</option>' + ids.map(function (k) { return '<option value="' + k + '">' + k + ' (' + esc(window.PCK_CALC.CALCS[k].title) + ')</option>'; }).join('');
    $('[name=toolIcon]', $('#ed-form')).innerHTML = Object.keys(PCK_ICONS.paths).map(function (k) { return '<option value="' + k + '">' + k + '</option>'; }).join('');
  }
  function openPost(p, isNew) {
    current = JSON.parse(JSON.stringify(p)); currentIsNew = !!isNew;
    var f = $('#ed-form');
    $('#ed-title').textContent = isNew ? 'New article' : 'Edit article';
    f.title.value = p.title || ''; f.slug.value = p.slug || ''; f.seoTitle.value = p.seoTitle || '';
    f.description.value = p.description || ''; f.category.value = p.category || ((site.categories[0] || {}).slug || '');
    f.date.value = p.date || today(); f.updated.value = p.updated || ''; f.status.value = p.status || 'published';
    f.featured.value = typeof p.featured === 'number' ? p.featured : (p.featured ? 1 : '');
    f.keywords.value = (p.keywords || []).join(', ');
    f.toolId.value = p.tool ? p.tool.id : ''; f.toolName.value = p.tool ? p.tool.name : ''; f.toolShort.value = p.tool ? (p.tool.short || '') : ''; f.toolIcon.value = p.tool ? (p.tool.icon || 'calc') : 'calc';
    f.figure.value = p.figure || ''; f.figureLabel.value = p.figureLabel || '';
    f.coverAlt.value = p.cover ? (p.cover.alt || '') : '';
    f.takeaways.value = (p.takeaways || []).join('\n'); f.related.value = (p.related || []).join(', ');
    f.body.value = p.body || '';
    f.slug.readOnly = !isNew;
    showCover(); updatePreview(); updateCount();
    $('#ed-delete').hidden = !!isNew;
    showTab('editor');
  }
  function collect() {
    var f = $('#ed-form'), p = current;
    p.title = f.title.value.trim(); p.slug = f.slug.value.trim();
    setOpt(p, 'seoTitle', f.seoTitle.value.trim());
    p.description = f.description.value.trim(); p.category = f.category.value; p.date = f.date.value;
    setOpt(p, 'updated', f.updated.value); p.status = f.status.value;
    var fe = f.featured.value.trim(); if (fe === '' || fe === '0') delete p.featured; else p.featured = parseInt(fe, 10);
    var kw = f.keywords.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean); if (kw.length) p.keywords = kw; else delete p.keywords;
    if (f.toolId.value) p.tool = { id: f.toolId.value, name: f.toolName.value.trim() || f.toolId.value, short: f.toolShort.value.trim(), icon: f.toolIcon.value }; else delete p.tool;
    setOpt(p, 'figure', f.figure.value.trim()); setOpt(p, 'figureLabel', f.figureLabel.value.trim());
    if (p.cover) p.cover.alt = f.coverAlt.value.trim();
    var tk = f.takeaways.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); if (tk.length) p.takeaways = tk; else delete p.takeaways;
    var rel = f.related.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean); if (rel.length) p.related = rel; else delete p.related;
    p.body = f.body.value.replace(/\s+$/, '') + '\n';
    return p;
  }
  function setOpt(o, k, v) { if (v) o[k] = v; else delete o[k]; }
  function orderKeys(p) {
    var order = ['title', 'slug', 'description', 'category', 'date', 'updated', 'status', 'featured', 'seoTitle', 'figure', 'figureLabel', 'cover', 'ogImage', 'tool', 'keywords', 'related', 'takeaways', 'body'];
    var o = {}; order.forEach(function (k) { if (p[k] !== undefined) o[k] = p[k]; });
    Object.keys(p).forEach(function (k) { if (!(k in o)) o[k] = p[k]; });
    return o;
  }
  async function savePost() {
    var p = collect();
    if (!p.title || !/^[a-z0-9-]+$/.test(p.slug)) { toast('Add a title and a slug made of lowercase letters, numbers and hyphens.', true); return; }
    if (currentIsNew && posts.some(function (x) { return x.slug === p.slug; })) { toast('Another article already uses the slug "' + p.slug + '".', true); return; }
    if (!p.date) { toast('Pick a date. A future date schedules the article.', true); return; }
    await writeFile('content/posts/' + p.slug + '.json', json(orderKeys(p)));
    var i = posts.findIndex(function (x) { return x.slug === p.slug; });
    if (i > -1) posts[i] = JSON.parse(JSON.stringify(p)); else posts.push(JSON.parse(JSON.stringify(p)));
    currentIsNew = false; $('#ed-form').slug.readOnly = true; $('#ed-delete').hidden = false;
    renderPostList();
    toast('Saved. Click "Rebuild site" to update the pages, then push to GitHub.');
  }
  async function deletePost() {
    if (!current || !window.confirm('Delete "' + current.title + '"? This removes its file from the content folder.')) return;
    await removeFile('content/posts/' + current.slug + '.json');
    posts = posts.filter(function (x) { return x.slug !== current.slug; });
    renderPostList(); showTab('articles'); toast('Deleted. Rebuild the site to remove its page.');
  }
  function newPost() {
    openPost({ title: '', slug: '', description: '', category: (site.categories[0] || {}).slug, date: today(), status: 'draft', body: '## First heading\n\nStart writing here.\n' }, true);
  }
  function updatePreview() {
    var md = $('#ed-form').body.value;
    try { $('#preview').innerHTML = '<h1>' + esc($('#ed-form').title.value) + '</h1>' + marked.parse(md); }
    catch (e) { $('#preview').textContent = 'Preview error: ' + e.message; }
    $$('#preview img').forEach(function (img) { var s = img.getAttribute('src') || ''; if (s.charAt(0) === '/') img.src = '..' + s; });
  }
  function updateCount() {
    var n = $('#ed-form').description.value.trim().length, el = $('[data-count=description]');
    el.textContent = '(' + n + ' characters, aim for 110 to 160)'; el.className = 'count' + (n && (n < 110 || n > 160) ? ' bad' : '');
  }
  async function showCover() {
    var box = $('#cover-preview');
    if (current.cover && current.cover.src600) {
      var src = current.cover.src600.replace(/^\//, '');
      try { var h = await fileHandle(src); var f = await h.getFile(); var url = URL.createObjectURL(f); box.innerHTML = '<img alt="" src="' + url + '">'; return; } catch (e) { /* fall through */ }
    }
    box.textContent = current.cover ? 'Cover file missing' : 'No cover photo. A colored cover with the figure is shown instead.';
  }

  /* ---------- images ---------- */
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function toBlob(c, type, q) { return new Promise(function (res) { c.toBlob(res, type, q); }); }
  function drawCover(img, w, h) {
    var c = canvas(w, h), x = c.getContext('2d');
    var r = Math.max(w / img.width, h / img.height), sw = w / r, sh = h / r;
    x.imageSmoothingQuality = 'high';
    x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
    return c;
  }
  async function uploadCover(file) {
    if (!file) return;
    var slug = $('#ed-form').slug.value.trim();
    if (!slug) { toast('Give the article a slug first.', true); return; }
    var alt = $('#ed-form').coverAlt.value.trim() || window.prompt('Describe what is in the photo (alt text):', '') || '';
    var img;
    try { img = await createImageBitmap(file); } catch (e) { toast('That file could not be read as an image.', true); return; }
    var big = 'assets/img/posts/cover-' + slug + '-1200x675.webp', small = 'assets/img/posts/cover-' + slug + '-600x338.webp', og = 'assets/img/og/cover-' + slug + '.jpg';
    await writeFile(big, await toBlob(drawCover(img, 1200, 675), 'image/webp', 0.82));
    await writeFile(small, await toBlob(drawCover(img, 600, 338), 'image/webp', 0.8));
    await writeFile(og, await toBlob(drawCover(img, 1200, 630), 'image/jpeg', 0.85));
    current.cover = { src: '/' + big, src600: '/' + small, w: 1200, h: 675, alt: alt };
    current.ogImage = '/' + og;
    $('#ed-form').coverAlt.value = alt;
    showCover(); toast('Cover saved in three sizes. Save the article to keep it.');
  }
  function wrapText(ctx, text, maxW) {
    var words = text.split(/\s+/), lines = [], line = '';
    words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line); return lines;
  }
  async function generateOg() {
    var f = $('#ed-form'), slug = f.slug.value.trim();
    if (!slug) { toast('Give the article a slug first.', true); return; }
    try { await document.fonts.load('700 60px Poppins'); await document.fonts.load('600 24px Poppins'); } catch (e) { /* system font fallback */ }
    var cat = (site.categories || []).filter(function (c) { return c.slug === f.category.value; })[0] || { color: '#16324F', name: '' };
    var c = canvas(1200, 630), x = c.getContext('2d');
    x.fillStyle = cat.color; x.fillRect(0, 0, 1200, 630);
    var g = x.createLinearGradient(0, 0, 1200, 630); g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.35)'); x.fillStyle = g; x.fillRect(0, 0, 1200, 630);
    x.strokeStyle = 'rgba(255,255,255,0.07)'; x.lineWidth = 1.5;
    for (var i = 0; i <= 1200; i += 40) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 630); x.stroke(); }
    for (var j = 0; j <= 630; j += 40) { x.beginPath(); x.moveTo(0, j); x.lineTo(1200, j); x.stroke(); }
    x.fillStyle = 'rgba(255,255,255,0.16)'; x.beginPath(); x.roundRect ? x.roundRect(72, 72, 40 + cat.name.length * 14, 44, 22) : x.rect(72, 72, 40 + cat.name.length * 14, 44); x.fill();
    x.fillStyle = '#fff'; x.font = '600 22px Poppins, sans-serif'; x.fillText(cat.name, 92, 102);
    var fig = f.figure.value.trim(), label = f.figureLabel.value.trim();
    var size = 60; x.font = '700 ' + size + 'px Poppins, sans-serif';
    var lines = wrapText(x, f.title.value.trim(), fig ? 680 : 1050);
    if (lines.length > 4) { size = 48; x.font = '700 48px Poppins, sans-serif'; lines = wrapText(x, f.title.value.trim(), fig ? 680 : 1050); }
    lines.slice(0, 5).forEach(function (l, k) { x.fillText(l, 72, 200 + k * size * 1.15); });
    if (fig) {
      x.fillStyle = '#FFC93C'; x.font = '700 96px Poppins, sans-serif'; x.textAlign = 'right'; x.fillText(fig, 1128, 300);
      if (label) { x.fillStyle = '#fff'; x.font = '600 26px Poppins, sans-serif'; x.fillText(label, 1128, 344); }
      x.textAlign = 'left';
    }
    x.fillStyle = '#FFC93C'; x.fillRect(0, 590, 700, 40);
    x.fillStyle = '#2B2100'; for (var t = 0; t <= 700; t += 12) x.fillRect(t, 590, t % 60 === 0 ? 3 : 2, t % 60 === 0 ? 22 : 12);
    x.fillStyle = '#fff'; x.font = '700 28px Poppins, sans-serif'; x.fillText(site.name || '', 72, 548);
    var path = 'assets/img/og/' + slug + '.png';
    await writeFile(path, await toBlob(c, 'image/png'));
    current.ogImage = '/' + path;
    toast('Social image saved as ' + path + '. Save the article to keep it.');
  }

  /* ---------- pages ---------- */
  function renderPageList() {
    $('#page-list').innerHTML = pages.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); }).map(function (p) {
      return '<tr data-page="' + esc(p.slug) + '"><td>' + esc(p.title) + '</td><td>/' + esc(p.slug) + '/</td><td>' + (p.nav ? 'Yes' : 'No') + '</td></tr>';
    }).join('');
  }
  function openPage(p, isNew) {
    currentPage = { data: JSON.parse(JSON.stringify(p)), isNew: isNew };
    var f = $('#page-form'); f.hidden = false;
    f.title.value = p.title || ''; f.slug.value = p.slug || ''; f.slug.readOnly = !isNew;
    f.navLabel.value = p.navLabel || ''; f.nav.value = String(!!p.nav); f.order.value = p.order || '';
    f.description.value = p.description || ''; f.updated.value = p.updated || ''; f.body.value = p.body || '';
    f.scrollIntoView({ behavior: 'smooth' });
  }
  async function savePage() {
    var f = $('#page-form'), p = currentPage.data;
    p.title = f.title.value.trim(); p.slug = f.slug.value.trim();
    if (!p.title || !/^[a-z0-9-]+$/.test(p.slug)) { toast('Add a title and a slug made of lowercase letters, numbers and hyphens.', true); return; }
    if (currentPage.isNew && pages.some(function (x) { return x.slug === p.slug; })) { toast('A page with that slug already exists.', true); return; }
    p.navLabel = f.navLabel.value.trim() || p.title; p.nav = f.nav.value === 'true';
    p.order = f.order.value ? +f.order.value : 99; p.description = f.description.value.trim();
    if (f.updated.value) p.updated = f.updated.value; else delete p.updated;
    p.body = f.body.value.replace(/\s+$/, '') + '\n';
    await writeFile('content/pages/' + p.slug + '.json', json(p));
    var i = pages.findIndex(function (x) { return x.slug === p.slug; }); if (i > -1) pages[i] = p; else pages.push(p);
    currentPage.isNew = false; f.slug.readOnly = true;
    renderPageList(); toast('Page saved. Rebuild the site to publish it.');
  }
  async function deletePage() {
    if (!currentPage || currentPage.isNew) { $('#page-form').hidden = true; return; }
    if (!window.confirm('Delete the page "' + currentPage.data.title + '"?')) return;
    await removeFile('content/pages/' + currentPage.data.slug + '.json');
    pages = pages.filter(function (x) { return x.slug !== currentPage.data.slug; });
    $('#page-form').hidden = true; renderPageList(); toast('Page deleted. Rebuild the site to remove it.');
  }

  /* ---------- settings ---------- */
  function fillSettings() {
    var f = $('#settings-form'), a = site.author || {};
    f.name.value = site.name || ''; f.url.value = site.url || ''; f.tagline.value = site.tagline || ''; f.description.value = site.description || '';
    f.authorName.value = a.name || ''; f.authorEmail.value = a.email || '';
    f.headCode.value = site.headCode || ''; f.bodyCode.value = site.bodyCode || '';
    $('#site-json').value = json(site);
  }
  async function saveSettings() {
    var f = $('#settings-form'), s;
    try { s = JSON.parse($('#site-json').value); } catch (e) { toast('The advanced site.json has an error: ' + e.message, true); return; }
    s.name = f.name.value.trim(); s.url = f.url.value.trim().replace(/\/+$/, ''); s.tagline = f.tagline.value.trim(); s.description = f.description.value.trim();
    s.author = s.author || {}; s.author.name = f.authorName.value.trim(); s.author.email = f.authorEmail.value.trim();
    s.headCode = f.headCode.value; s.bodyCode = f.bodyCode.value;
    if (!/^https?:\/\//.test(s.url)) { toast('The live address must start with https://', true); return; }
    site = s;
    await writeFile('content/site.json', json(s));
    fillSettings(); fillSelects(); toast('Settings saved. Rebuild the site to apply them.');
  }

  /* ---------- rebuild (same builder as build.js) ---------- */
  async function rebuild() {
    var btn = $('#rebuild'); btn.disabled = true; btn.textContent = 'Building...';
    try {
      site = JSON.parse(await readText('content/site.json'));
      posts = await listJson('content/posts'); pages = await listJson('content/pages');
      var css = await readText('assets/css/style.css');
      var out = PCK_BUILDER.build({ site: site, posts: posts, pages: pages, css: css, marked: marked, now: new Date(), icons: PCK_ICONS });
      var prev = [];
      try { prev = JSON.parse(await readText('content/.build.json')).files || []; } catch (e) { prev = []; }
      var keys = Object.keys(out.files).sort(), changed = 0, removed = 0;
      for (var i = 0; i < keys.length; i++) if (await writeFile(keys[i], out.files[keys[i]])) changed++;
      for (var j = 0; j < prev.length; j++) if (out.files[prev[j]] === undefined && await exists(prev[j])) { await removeFile(prev[j]); removed++; }
      await writeFile('content/.build.json', JSON.stringify({ files: keys }, null, 1) + '\n');
      renderPostList();
      toast('Built ' + out.live.length + ' live articles (' + out.skipped.length + ' scheduled or draft). ' + changed + ' files changed, ' + removed + ' removed.' + (out.warnings.length ? '\nWarnings:\n- ' + out.warnings.join('\n- ') : '') + '\nNow commit and push to GitHub to publish.');
    } catch (e) { toast('Build failed: ' + e.message, true); if (window.console) console.error(e); }
    btn.disabled = false; btn.textContent = 'Rebuild site';
  }

  /* ---------- wire up ---------- */
  $('#pick').addEventListener('click', pick); $('#pick2').addEventListener('click', pick);
  $('#rebuild').addEventListener('click', rebuild);
  $$('#tabs button').forEach(function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); }); });
  $('#filter').addEventListener('input', renderPostList);
  $('#post-list').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-slug]'); if (!tr) return; var p = posts.filter(function (x) { return x.slug === tr.getAttribute('data-slug'); })[0]; if (p) openPost(p, false); });
  $('#new-post').addEventListener('click', newPost);
  $('#ed-back').addEventListener('click', function () { showTab('articles'); });
  $('#ed-save').addEventListener('click', savePost);
  $('#ed-delete').addEventListener('click', deletePost);
  $('#ed-form').addEventListener('input', function (e) {
    if (e.target.name === 'body' || e.target.name === 'title') { clearTimeout(window.__pv); window.__pv = setTimeout(updatePreview, 250); }
    if (e.target.name === 'description') updateCount();
    if (e.target.name === 'title' && currentIsNew) $('#ed-form').slug.value = PCK_BUILDER.slugify(e.target.value);
  });
  $('#cover-file').addEventListener('change', function (e) { uploadCover(e.target.files[0]); e.target.value = ''; });
  $('#og-gen').addEventListener('click', generateOg);
  $('#cover-remove').addEventListener('click', function () { delete current.cover; showCover(); toast('Cover removed from this article. Save to keep the change.'); });
  $('#page-list').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-page]'); if (!tr) return; var p = pages.filter(function (x) { return x.slug === tr.getAttribute('data-page'); })[0]; if (p) openPage(p, false); });
  $('#new-page').addEventListener('click', function () { openPage({ title: '', slug: '', nav: false, order: 99, body: '' }, true); });
  $('#page-save').addEventListener('click', savePage);
  $('#page-delete').addEventListener('click', deletePage);
  $('#page-cancel').addEventListener('click', function () { $('#page-form').hidden = true; });
  $('#settings-save').addEventListener('click', saveSettings);
  window.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 's' && !$('#editor').hidden) { e.preventDefault(); savePost(); } });

  if (!window.showDirectoryPicker) $('#unsupported').hidden = false;
  // reconnect to the folder used last time
  idb('readonly', function (st) { return st.get('root'); }).then(function (h) {
    if (!h) return;
    $('#folder-status').textContent = 'Last folder: ' + h.name;
    $('#pick').textContent = 'Reconnect ' + h.name;
    $('#pick2').textContent = 'Reconnect ' + h.name;
    lastHandle = h;
  });
})();
