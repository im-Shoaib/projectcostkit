/* ProjectCostKit: menu, search, dark mode, copy link. No dependencies. */
(function () {
  'use strict';
  var doc = document.documentElement;
  var root = doc.getAttribute('data-root') || './';

  /* ---- mobile menu ---- */
  var menuBtn = document.querySelector('[data-menu]');
  var nav = document.getElementById('nav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) { nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.focus(); }
    });
  }

  /* ---- dark mode ---- */
  function currentTheme() {
    var t = doc.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  var themeBtn = document.querySelector('[data-theme-toggle]');
  if (themeBtn) {
    var label = function () { themeBtn.setAttribute('aria-label', currentTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'); };
    label();
    themeBtn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      doc.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { /* storage blocked */ }
      label();
    });
  }

  /* ---- search ---- */
  var pop = document.getElementById('search-pop');
  var input = document.getElementById('search-input');
  var list = document.getElementById('search-results');
  var index = null, loading = false, lastFocus = null;

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function load() {
    if (index || loading) return;
    loading = true;
    fetch(root + 'search.json').then(function (r) { return r.json(); }).then(function (data) {
      index = data; loading = false; render();
    }).catch(function () { loading = false; list.innerHTML = '<li class="search-empty">Search could not load. Check your connection and try again.</li>'; });
  }
  function score(item, terms) {
    var t = item.t.toLowerCase(), d = (item.d + ' ' + item.k + ' ' + item.c).toLowerCase(), s = 0;
    for (var i = 0; i < terms.length; i++) {
      var w = terms[i];
      if (t.indexOf(w) > -1) s += 3; else if (d.indexOf(w) > -1) s += 1; else return 0;
    }
    return s + (item.x ? 0.5 : 0);
  }
  function render() {
    if (!list) return;
    var q = (input.value || '').trim().toLowerCase();
    if (!index) { list.innerHTML = '<li class="search-empty">Loading...</li>'; return; }
    var items;
    if (!q) {
      items = index.filter(function (i) { return i.x; }).slice(0, 8);
    } else {
      var terms = q.split(/\s+/).filter(Boolean);
      items = index.map(function (i) { return { i: i, s: score(i, terms) }; })
        .filter(function (o) { return o.s > 0; })
        .sort(function (a, b) { return b.s - a.s; })
        .slice(0, 10).map(function (o) { return o.i; });
    }
    if (!items.length) { list.innerHTML = '<li class="search-empty">Nothing matches "' + escapeHtml(q) + '". Try a material, like paint, tile or concrete.</li>'; return; }
    list.innerHTML = items.map(function (i) {
      return '<li><a href="' + root + i.u + '"><strong>' + escapeHtml(i.t) + (i.x ? '<span class="tag">Calculator</span>' : '') + '</strong><small>' + escapeHtml(i.c) + '</small></a></li>';
    }).join('');
  }
  function openSearch() {
    if (!pop) return;
    lastFocus = document.activeElement;
    pop.hidden = false;
    document.body.style.overflow = 'hidden';
    input.value = '';
    input.focus();
    load();
    render();
  }
  function closeSearch() {
    if (!pop || pop.hidden) return;
    pop.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest && t.closest('[data-search-open]')) { e.preventDefault(); openSearch(); }
    else if (t.closest && t.closest('[data-search-close]')) closeSearch();
    else if (t === pop) closeSearch();
  });
  if (input) {
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { var a = list.querySelector('a'); if (a) { e.preventDefault(); a.focus(); } }
      if (e.key === 'Enter') { var f = list.querySelector('a'); if (f) window.location.href = f.href; }
    });
  }
  if (list) {
    list.addEventListener('keydown', function (e) {
      var links = Array.prototype.slice.call(list.querySelectorAll('a'));
      var i = links.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && i < links.length - 1) { e.preventDefault(); links[i + 1].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) links[i - 1].focus(); else input.focus(); }
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSearch();
    if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && pop && pop.hidden) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      e.preventDefault(); openSearch();
    }
  });

  /* ---- copy link ---- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-copy-link]');
    if (!b) return;
    var url = b.getAttribute('data-copy-link');
    var done = function () { var old = b.textContent; b.textContent = 'Link copied'; setTimeout(function () { b.textContent = old; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link:', url); });
    else window.prompt('Copy this link:', url);
  });

  /* ---- highlight the section you are reading in the table of contents ---- */
  var tocLinks = document.querySelectorAll('.post-side .toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    tocLinks.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          tocLinks.forEach(function (a) { a.classList.remove('active'); });
          var a = map[en.target.id]; if (a) a.classList.add('active');
        }
      });
    }, { rootMargin: '-80px 0px -70% 0px' });
    Object.keys(map).forEach(function (id) { var h = document.getElementById(id); if (h) obs.observe(h); });
  }
})();
