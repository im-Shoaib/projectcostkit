/*
 * ProjectCostKit site builder.
 * Turns content (site.json, posts/*.json, pages/*.json) into every page of the site.
 * UMD: works in the browser (admin dashboard) and in Node (build.js). No dependencies
 * apart from marked (passed in) and the icon set (passed in or global PCK_ICONS).
 *
 * build({ site, posts, pages, css, marked, now, icons }) -> { files: { path: content }, warnings: [] }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PCK_BUILDER = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /* ---------- small helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function stripTags(s) { return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
  function slugify(s) {
    return String(s || '').toLowerCase().replace(/&[a-z]+;/g, '').replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDate(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return esc(iso);
    return MONTHS[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0];
  }
  function fmtDateLong(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return esc(iso);
    return MONTHS_LONG[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0];
  }
  function rfc822(iso) {
    var p = String(iso).split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12, 0, 0));
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[d.getUTCDay()] + ', ' + pad(d.getUTCDate()) + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ' 12:00:00 +0000';
  }
  function minifyCss(css) {
    return String(css || '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{};,>])\s*/g, '$1')
      .replace(/:\s+/g, ':')
      .replace(/;}/g, '}')
      .trim();
  }
  function jsonLd(obj) {
    return '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, '\\u003c') + '</script>';
  }
  function words(md) { return stripTags(String(md || '').replace(/[#*_`>|\-\[\]()!]/g, ' ')).split(/\s+/).filter(Boolean).length; }
  function trimSlash(u) { return String(u || '').replace(/\/+$/, ''); }

  /* ---------- the build ---------- */
  function build(opts) {
    var site = opts.site || {};
    var marked = opts.marked;
    var ICONS = opts.icons || (typeof PCK_ICONS !== 'undefined' ? PCK_ICONS : null); // eslint-disable-line no-undef
    var now = opts.now || new Date();
    var today = localDate(now);
    var year = now.getFullYear();
    var baseUrl = trimSlash(site.url || '');
    var cssRaw = minifyCss(opts.css || '');
    var warnings = [];
    var files = {};

    function icon(name, cls, size) { return ICONS ? ICONS.svg(name, cls, size) : ''; }

    var cats = (site.categories || []).slice();
    var catBySlug = {};
    cats.forEach(function (c) { catBySlug[c.slug] = c; });

    /* --- which posts are live --- */
    var seen = {};
    var live = [];
    var skipped = {};
    (opts.posts || []).forEach(function (p) {
      if (!p || !p.slug) { warnings.push('A post has no slug and was skipped.'); return; }
      if (seen[p.slug]) warnings.push('Duplicate slug: ' + p.slug);
      seen[p.slug] = true;
      if (p.status === 'draft') { skipped[p.slug] = true; return; }
      if (!p.date || p.date > today) { skipped[p.slug] = true; return; }
      if (!p.description) warnings.push('Missing description: ' + p.slug);
      else if (p.description.length < 110 || p.description.length > 160) warnings.push('Description is ' + p.description.length + ' characters (aim for 110-160): ' + p.slug);
      if (p.category && !catBySlug[p.category]) warnings.push('Unknown category "' + p.category + '" in ' + p.slug);
      live.push(p);
    });
    live.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.slug < b.slug ? -1 : 1;
    });
    var liveBySlug = {};
    live.forEach(function (p) { liveBySlug[p.slug] = p; });

    var liveCats = cats.filter(function (c) { return live.some(function (p) { return p.category === c.slug; }); });
    var pages = (opts.pages || []).slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
    var tools = live.filter(function (p) { return p.tool && p.tool.id; });

    /* --- markdown renderer --- */
    var md = null;
    function makeMd(ctx) {
      var M = marked.Marked ? new marked.Marked({ gfm: true, breaks: false }) : null;
      var renderer = {
        heading: function (text, level, raw) {
          var lvl = level === 1 ? 2 : level;
          var id = slugify(stripTags(raw || text)) || 'section';
          var base = id, n = 2;
          while (ctx.ids[id]) id = base + '-' + (n++);
          ctx.ids[id] = true;
          if (lvl === 2) ctx.toc.push({ id: id, text: stripTags(text) });
          return '<h' + lvl + ' id="' + id + '">' + text + '</h' + lvl + '>\n';
        },
        image: function (href, title, text) {
          var m = /-(\d+)x(\d+)\.[a-z0-9]+$/i.exec(href || '');
          var dims = m ? ' width="' + m[1] + '" height="' + m[2] + '"' : '';
          return '<img src="' + esc(href) + '" alt="' + esc(text) + '"' + (title ? ' title="' + esc(title) + '"' : '') + dims + ' loading="lazy" decoding="async">';
        },
        link: function (href, title, text) {
          var ext = /^https?:\/\//i.test(href || '') && (!baseUrl || href.indexOf(baseUrl) !== 0);
          return '<a href="' + esc(href) + '"' + (title ? ' title="' + esc(title) + '"' : '') + (ext ? ' rel="noopener" target="_blank"' : '') + '>' + text + '</a>';
        },
        table: function (header, body) {
          return '<div class="table-wrap"><table><thead>' + header + '</thead><tbody>' + body + '</tbody></table></div>\n';
        }
      };
      if (M) { M.use({ renderer: renderer }); return function (s) { return M.parse(s || ''); }; }
      marked.use({ renderer: renderer });
      return function (s) { return marked.parse(s || ''); };
    }
    function renderMarkdown(src) {
      var ctx = { ids: {}, toc: [] };
      md = makeMd(ctx);
      var html = md(src);
      return { html: html, toc: ctx.toc };
    }

    /* --- link handling: unlink not-live posts, make site links relative --- */
    function relLinks(html, pre) {
      html = html.replace(/<a\b([^>]*?)\bhref="(\/blog\/([a-z0-9-]+)\/?(#[^"]*)?)"([^>]*)>([\s\S]*?)<\/a>/g,
        function (all, a1, href, slug, hash, a2, inner) {
          if (!liveBySlug[slug]) return inner;
          return all;
        });
      html = html.replace(/(\s(?:href|src|srcset|action)=")\/(?!\/)/g, '$1' + pre);
      html = html.replace(/(\ssrcset="[^"]*?,\s*)\/(?!\/)/g, '$1' + pre);
      return html;
    }

    function pathPrefix(path) {
      var depth = path.split('/').filter(Boolean).length;
      return depth ? new Array(depth + 1).join('../') : './';
    }
    function postPath(p) { return 'blog/' + p.slug + '/'; }
    function catPath(c) { return 'category/' + c.slug + '/'; }
    function pagePath(pg) { return pg.slug + '/'; }
    function abs(path) { return baseUrl + '/' + path; }
    function postImage(p) {
      if (p.ogImage) return abs(p.ogImage.replace(/^\//, ''));
      if (p.cover && p.cover.src) return abs(p.cover.src.replace(/^\//, ''));
      return abs(String(site.ogDefault || 'assets/img/og-default.png').replace(/^\//, ''));
    }
    function readMins(p) { return Math.max(1, Math.round(words(p.body) / 220)); }
    function catName(slug) { return catBySlug[slug] ? catBySlug[slug].name : ''; }
    function catColor(slug) { return catBySlug[slug] ? catBySlug[slug].color : '#16324F'; }

    /* --- shared pieces --- */
    function logo(pre) {
      return '<a class="brand" href="' + pre + '" aria-label="' + esc(site.name) + ' home">' +
        '<svg class="brand-mark" width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect x="1" y="1" width="32" height="32" rx="9" fill="var(--navy)"/>' +
        '<path d="M8 23h18" stroke="var(--tape)" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M10 23v-4M14 23v-6M18 23v-4M22 23v-6M26 23v-4" stroke="var(--tape)" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M9 13.5 17 8l8 5.5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '<span class="brand-name">' + esc(site.shortName || site.name) + '</span></a>';
    }

    function header(pre, active) {
      var items = [];
      if (tools.length) items.push({ href: pre + 'tools/', label: 'Calculators', key: 'tools' });
      liveCats.forEach(function (c) { items.push({ href: pre + catPath(c), label: c.navLabel || c.name, key: 'cat:' + c.slug }); });
      pages.filter(function (pg) { return pg.nav; }).forEach(function (pg) { items.push({ href: pre + pagePath(pg), label: pg.navLabel || pg.title, key: 'page:' + pg.slug }); });
      var links = items.map(function (it) {
        return '<li><a href="' + it.href + '"' + (it.key === active ? ' aria-current="page"' : '') + '>' + esc(it.label) + '</a></li>';
      }).join('');
      return '<a class="skip" href="#main">Skip to content</a>' +
        '<header class="site-header"><div class="wrap header-in">' + logo(pre) +
        '<nav class="nav" id="nav" aria-label="Main"><ul>' + links + '</ul></nav>' +
        '<div class="header-tools">' +
        '<button class="icon-btn" type="button" data-search-open aria-label="Search">' + icon('search') + '</button>' +
        '<button class="icon-btn" type="button" data-theme-toggle aria-label="Switch dark mode">' + icon('moon', 'ico ico-moon') + icon('sun', 'ico ico-sun') + '</button>' +
        '<button class="icon-btn menu-btn" type="button" data-menu aria-controls="nav" aria-expanded="false" aria-label="Menu">' + icon('menu', 'ico ico-menu') + icon('close', 'ico ico-close') + '</button>' +
        '</div></div></header>';
    }

    function searchPopup() {
      return '<div class="search-pop" id="search-pop" hidden><div class="search-box" role="dialog" aria-modal="true" aria-label="Search">' +
        '<div class="search-field">' + icon('search') + '<input type="search" id="search-input" placeholder="Search calculators and guides" autocomplete="off" aria-label="Search calculators and guides">' +
        '<button type="button" class="icon-btn" data-search-close aria-label="Close search">' + icon('close') + '</button></div>' +
        '<ul class="search-results" id="search-results" aria-live="polite"></ul></div></div>';
    }

    function newsletter() {
      var n = site.newsletter || {};
      if (!n.action) return '';
      return '<section class="newsletter"><div class="wrap nl-in"><div><h2>' + esc(n.title || 'Get new calculators by email') + '</h2><p>' + esc(n.text || '') + '</p></div>' +
        '<form class="nl-form" action="' + esc(n.action) + '" method="post" target="_blank"><label class="sr" for="nl-email">Email address</label>' +
        '<input id="nl-email" type="email" name="' + esc(n.field || 'email') + '" required placeholder="you@example.com"><button class="btn btn-tape" type="submit">Subscribe</button></form></div></section>';
    }

    function footer(pre) {
      var topicLinks = liveCats.map(function (c) { return '<li><a href="' + pre + catPath(c) + '">' + esc(c.name) + '</a></li>'; }).join('');
      var pageLinks = pages.map(function (pg) { return '<li><a href="' + pre + pagePath(pg) + '">' + esc(pg.navLabel || pg.title) + '</a></li>'; }).join('');
      return newsletter() + '<footer class="site-footer"><div class="wrap footer-grid">' +
        '<div class="footer-brand">' + logo(pre) + '<p>' + esc(site.tagline || '') + '</p></div>' +
        '<div><h2 class="footer-h">Topics</h2><ul>' + (tools.length ? '<li><a href="' + pre + 'tools/">All calculators</a></li>' : '') + topicLinks + '</ul></div>' +
        '<div><h2 class="footer-h">Site</h2><ul>' + pageLinks + '<li><a href="' + pre + 'feed.xml">RSS feed</a></li></ul></div>' +
        '</div><div class="wrap footer-base"><p>' + esc(site.disclaimer || '') + '</p><p>&copy; ' + year + ' ' + esc(site.name) + '</p></div></footer>';
    }

    function layout(o) {
      // o: path, title, description, body, canonical(bool), noindex, ld[], ogImage, ogType, active, calc, robots
      var pre = o.rootRelative ? '/' : pathPrefix(o.path);
      var css = cssRaw.replace(/url\(\/assets\//g, 'url(' + pre + 'assets/');
      var canonical = abs(o.path === 'index.html' ? '' : o.path);
      if (o.path === '') canonical = baseUrl + '/';
      var title = o.title;
      var head = '<!doctype html><html lang="' + esc(site.language || 'en') + '" data-root="' + pre + '"><head>' +
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>' + esc(title) + '</title>' +
        '<meta name="description" content="' + esc(o.description || site.description || '') + '">' +
        (o.noindex ? '<meta name="robots" content="noindex, follow">' : '<meta name="robots" content="index, follow, max-image-preview:large">') +
        (o.noCanonical ? '' : '<link rel="canonical" href="' + esc(canonical) + '">') +
        '<meta property="og:site_name" content="' + esc(site.name) + '">' +
        '<meta property="og:locale" content="' + esc(site.locale || 'en_US') + '">' +
        '<meta property="og:type" content="' + (o.ogType || 'website') + '">' +
        '<meta property="og:title" content="' + esc(o.ogTitle || title) + '">' +
        '<meta property="og:description" content="' + esc(o.description || site.description || '') + '">' +
        '<meta property="og:url" content="' + esc(canonical) + '">' +
        '<meta property="og:image" content="' + esc(o.ogImage || abs(String(site.ogDefault || 'assets/img/og-default.png').replace(/^\//, ''))) + '">' +
        '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">' +
        '<meta name="twitter:card" content="summary_large_image">' +
        '<meta name="twitter:title" content="' + esc(o.ogTitle || title) + '">' +
        '<meta name="twitter:description" content="' + esc(o.description || site.description || '') + '">' +
        '<meta name="twitter:image" content="' + esc(o.ogImage || abs(String(site.ogDefault || 'assets/img/og-default.png').replace(/^\//, ''))) + '">' +
        (o.article ? '<meta property="article:published_time" content="' + o.article.date + '"><meta property="article:modified_time" content="' + (o.article.updated || o.article.date) + '">' : '') +
        '<meta name="theme-color" content="#16324F">' +
        '<link rel="icon" href="' + pre + 'assets/img/favicon.svg" type="image/svg+xml">' +
        '<link rel="icon" href="' + pre + 'assets/img/icon-192.png" sizes="192x192" type="image/png">' +
        '<link rel="apple-touch-icon" href="' + pre + 'assets/img/icon-192.png">' +
        '<link rel="manifest" href="' + pre + 'manifest.webmanifest">' +
        '<link rel="alternate" type="application/rss+xml" title="' + esc(site.name) + '" href="' + pre + 'feed.xml">' +
        '<link rel="preload" href="' + pre + 'assets/fonts/poppins-400.woff2" as="font" type="font/woff2" crossorigin>' +
        '<link rel="preload" href="' + pre + 'assets/fonts/poppins-600.woff2" as="font" type="font/woff2" crossorigin>' +
        (o.preloadImage ? '<link rel="preload" as="image" href="' + o.preloadImage.href + '"' + (o.preloadImage.srcset ? ' imagesrcset="' + o.preloadImage.srcset + '" imagesizes="' + o.preloadImage.sizes + '"' : '') + ' fetchpriority="high">' : '') +
        '<script>(function(){try{var t=localStorage.getItem("theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()</script>' +
        '<style>' + css + '</style>' +
        (o.ld || []).map(jsonLd).join('') +
        (site.headCode || '') +
        '</head>';
      var bodyHtml = '<body class="' + (o.bodyClass || '') + '">' + header(pre, o.active) +
        '<main id="main">' + o.body + '</main>' + footer(pre) + searchPopup() +
        '<script src="' + pre + 'assets/js/main.js" defer></script>' +
        (o.calc ? '<script src="' + pre + 'assets/js/calc.js" defer></script>' : '') +
        (site.bodyCode || '') + '</body></html>';
      var html = head + bodyHtml;
      if (!o.rootRelative) html = relLinks(html, pre);
      else html = html.replace(/(\s(?:href|src)=")\.\.\//g, '$1/');
      return html;
    }

    /* --- components --- */
    function coverFigure(p, pre, opts2) {
      opts2 = opts2 || {};
      if (p.cover && p.cover.src) {
        var c = p.cover;
        var src = pre + c.src.replace(/^\//, '');
        var src600 = c.src600 ? pre + c.src600.replace(/^\//, '') : src;
        return '<img src="' + (opts2.small ? src600 : src) + '" srcset="' + src600 + ' 600w, ' + src + ' 1200w" sizes="' + (opts2.sizes || '(max-width: 760px) 100vw, 760px') + '" width="' + (c.w || 1200) + '" height="' + (c.h || 675) + '" alt="' + esc(c.alt || '') + '"' +
          (opts2.eager ? ' fetchpriority="high" decoding="async"' : ' loading="lazy" decoding="async"') + '>';
      }
      return '<div class="figure-cover" style="--c:' + esc(catColor(p.category)) + '"><span class="fig-num">' + esc(p.figure || (p.tool ? p.tool.name : catName(p.category))) + '</span>' +
        (p.figureLabel ? '<span class="fig-label">' + esc(p.figureLabel) + '</span>' : '') + '</div>';
    }

    function card(p, pre, lead) {
      var href = pre + postPath(p);
      var c = catBySlug[p.category];
      return '<article class="card' + (lead ? ' card-lead' : '') + '" style="--c:' + esc(catColor(p.category)) + '">' +
        '<a class="card-media" href="' + href + '" tabindex="-1" aria-hidden="true">' + coverFigure(p, pre, { small: !lead, sizes: lead ? '(max-width: 900px) 100vw, 620px' : '(max-width: 640px) 100vw, 380px' }) +
        (p.tool ? '<span class="card-badge">' + icon('calc', 'ico', 16) + 'Calculator</span>' : '') + '</a>' +
        '<div class="card-body">' + (c ? '<a class="chip" href="' + pre + catPath(c) + '">' + esc(c.name) + '</a>' : '') +
        '<h3 class="card-title"><a href="' + href + '">' + esc(p.title) + '</a></h3>' +
        '<p class="card-desc">' + esc(p.description || '') + '</p>' +
        '<p class="card-meta"><time datetime="' + (p.updated || p.date) + '">' + fmtDate(p.updated || p.date) + '</time><span>' + readMins(p) + ' min read</span></p>' +
        '</div></article>';
    }

    function toolTile(p, pre) {
      return '<a class="tool-tile" href="' + pre + postPath(p) + '" style="--c:' + esc(catColor(p.category)) + '">' +
        '<span class="tool-ico">' + icon(p.tool.icon || 'calc') + '</span>' +
        '<span class="tool-text"><strong>' + esc(p.tool.name) + '</strong><small>' + esc(p.tool.short || '') + '</small></span></a>';
    }

    function pagination(cur, total, pre, basePath) {
      if (total < 2) return '';
      function href(n) { return pre + (n === 1 ? basePath : basePath + 'page/' + n + '/'); }
      var out = '<nav class="pager" aria-label="Pages">';
      if (cur > 1) out += '<a class="btn btn-ghost" rel="prev" href="' + href(cur - 1) + '">Newer</a>';
      out += '<span class="pager-pos">Page ' + cur + ' of ' + total + '</span>';
      if (cur < total) out += '<a class="btn btn-ghost" rel="next" href="' + href(cur + 1) + '">Older</a>';
      return out + '</nav>';
    }

    function orgLd() {
      return {
        '@type': 'Organization', '@id': baseUrl + '/#org', name: site.name, url: baseUrl + '/',
        logo: { '@type': 'ImageObject', url: abs('assets/img/icon-512.png'), width: 512, height: 512 },
        sameAs: (site.author && site.author.sameAs) || []
      };
    }
    function authorLd() {
      var a = site.author || {};
      if (!a.name || a.name === site.name) return { '@type': 'Organization', name: site.name, url: baseUrl + '/' };
      return { '@type': 'Person', name: a.name, url: abs('about/'), sameAs: a.sameAs || [] };
    }
    function crumbsLd(list) {
      return {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        itemListElement: list.map(function (it, i) { return { '@type': 'ListItem', position: i + 1, name: it.name, item: it.url }; })
      };
    }

    /* --- article pages --- */
    function related(p) {
      var same = live.filter(function (q) { return q.slug !== p.slug && q.category === p.category; });
      var other = live.filter(function (q) { return q.slug !== p.slug && q.category !== p.category; });
      if (p.related && p.related.length) {
        var picked = p.related.map(function (s) { return liveBySlug[s]; }).filter(Boolean);
        same = picked.concat(same.filter(function (q) { return picked.indexOf(q) < 0; }));
      }
      return same.concat(other).slice(0, 3);
    }

    function share(p) {
      var u = encodeURIComponent(abs(postPath(p)));
      var t = encodeURIComponent(p.title);
      return '<div class="share" aria-label="Share this page"><span>Share</span>' +
        '<a href="https://twitter.com/intent/tweet?url=' + u + '&amp;text=' + t + '" rel="noopener" target="_blank">X</a>' +
        '<a href="https://www.facebook.com/sharer/sharer.php?u=' + u + '" rel="noopener" target="_blank">Facebook</a>' +
        '<a href="https://www.linkedin.com/sharing/share-offsite/?url=' + u + '" rel="noopener" target="_blank">LinkedIn</a>' +
        '<a href="https://pinterest.com/pin/create/button/?url=' + u + '&amp;description=' + t + '" rel="noopener" target="_blank">Pinterest</a>' +
        '<a href="mailto:?subject=' + t + '&amp;body=' + u + '">Email</a>' +
        '<button type="button" class="linkish" data-copy-link="' + esc(abs(postPath(p))) + '">Copy link</button></div>';
    }

    function articlePage(p) {
      var path = postPath(p);
      var pre = pathPrefix(path);
      var c = catBySlug[p.category];
      var r = renderMarkdown(p.body || '');
      var mins = readMins(p);
      var crumbs = '<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="' + pre + '">Home</a></li>' +
        (c ? '<li><a href="' + pre + catPath(c) + '">' + esc(c.name) + '</a></li>' : '') + '</ol></nav>';
      var meta = '<div class="post-meta"><span class="by">By <a href="' + pre + 'about/">' + esc((site.author && site.author.name) || site.name) + '</a></span>' +
        (p.updated && p.updated !== p.date ? '<span>Updated <time datetime="' + p.updated + '">' + fmtDate(p.updated) + '</time></span>' : '<span><time datetime="' + p.date + '">' + fmtDate(p.date) + '</time></span>') +
        '<span>' + mins + ' min read</span></div>';
      var hero = '';
      if (p.tool) {
        hero = '<section class="calc-shell" id="calculator" aria-label="' + esc(p.tool.name) + '">' +
          '<div class="calc" data-calc="' + esc(p.tool.id) + '"><template class="calc-ico">' + icon(p.tool.icon || 'calc') + '</template><p class="calc-loading">Loading the ' + esc(p.tool.name.toLowerCase()) + '...</p>' +
          '<noscript><p class="calc-loading">This calculator needs JavaScript. The guide below explains the math step by step, so you can also work it out by hand.</p></noscript></div></section>';
      } else {
        hero = '<figure class="post-cover">' + coverFigure(p, pre, { eager: true }) + '</figure>';
      }
      var takeaways = (p.takeaways && p.takeaways.length) ? '<aside class="takeaways" aria-label="The short version"><h2>The short version</h2><ul>' +
        p.takeaways.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></aside>' : '';
      var toc = r.toc.length > 2 ? '<nav class="toc" aria-label="On this page"><details open><summary>On this page</summary><ol>' +
        r.toc.map(function (t) { return '<li><a href="#' + t.id + '">' + esc(t.text) + '</a></li>'; }).join('') + '</ol></details></nav>' : '';
      var rel = related(p);
      var relHtml = rel.length ? '<section class="keep-reading wrap" aria-labelledby="kr-h"><h2 id="kr-h">Keep reading</h2><div class="grid grid-3">' +
        rel.map(function (q) { return card(q, pre); }).join('') + '</div></section>' : '';
      var body = '<article class="post" style="--c:' + esc(catColor(p.category)) + '">' +
        '<header class="post-head wrap-post">' + crumbs + '<h1>' + esc(p.title) + '</h1>' +
        (p.description ? '<p class="post-lead">' + esc(p.description) + '</p>' : '') + meta + '</header>' +
        '<div class="post-hero wrap-post' + (p.tool ? ' is-calc' : '') + '">' + hero + '</div>' +
        '<div class="post-layout wrap">' +
        '<div class="post-main">' + takeaways + (toc ? '<div class="toc-inline">' + toc + '</div>' : '') +
        '<div class="prose">' + r.html + '</div>' + share(p) + '</div>' +
        (toc ? '<aside class="post-side">' + toc + '</aside>' : '') +
        '</div></article>' + relHtml;
      var img = postImage(p);
      var ld = [
        {
          '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.description || '',
          datePublished: p.date, dateModified: p.updated || p.date, image: [img],
          author: authorLd(), publisher: orgLd(),
          mainEntityOfPage: { '@type': 'WebPage', '@id': abs(path) },
          articleSection: c ? c.name : undefined, wordCount: words(p.body), inLanguage: site.language || 'en'
        },
        crumbsLd([{ name: 'Home', url: baseUrl + '/' }].concat(c ? [{ name: c.name, url: abs(catPath(c)) }] : []).concat([{ name: p.title, url: abs(path) }]))
      ];
      var preload = null;
      if (!p.tool && p.cover && p.cover.src) {
        preload = { href: pre + p.cover.src.replace(/^\//, ''), srcset: pre + (p.cover.src600 || p.cover.src).replace(/^\//, '') + ' 600w, ' + pre + p.cover.src.replace(/^\//, '') + ' 1200w', sizes: '(max-width: 760px) 100vw, 760px' };
      }
      files[path + 'index.html'] = layout({
        path: path, title: p.seoTitle || (p.title + ' | ' + site.name), ogTitle: p.title, description: p.description,
        body: body, ld: ld, ogImage: img, ogType: 'article', article: p, active: 'cat:' + p.category,
        calc: !!p.tool, bodyClass: 'is-post' + (p.tool ? ' has-calc' : ''), preloadImage: preload
      });
    }

    /* --- home --- */
    function homePages() {
      var per = site.perPage || 9;
      var featured = live.filter(function (p) { return p.featured; }).sort(function (a, b) {
        var fa = typeof a.featured === 'number' ? a.featured : 99, fb = typeof b.featured === 'number' ? b.featured : 99;
        return fa - fb;
      });
      var lead = featured[0] || live[0];
      var restFeatured = featured.filter(function (p) { return p !== lead; }).slice(0, 3);
      var total = Math.max(1, Math.ceil(live.length / per));
      for (var n = 1; n <= total; n++) {
        var path = n === 1 ? '' : 'page/' + n + '/';
        var pre = pathPrefix(path);
        var slice = live.slice((n - 1) * per, n * per);
        var body = '';
        if (n === 1) {
          var h = site.hero || {};
          body += '<section class="hero"><div class="wrap hero-in">' +
            '<div class="hero-copy"><h1>' + esc(h.title || site.tagline || site.name) + '</h1><p class="hero-text">' + esc(h.text || site.intro || '') + '</p>' +
            '<button type="button" class="hero-search" data-search-open>' + icon('search') + '<span>' + esc(h.searchLabel || 'Search calculators and guides') + '</span></button>' +
            (h.points ? '<ul class="hero-points">' + h.points.map(function (t) { return '<li>' + icon('check', 'ico', 18) + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
            '</div>' +
            (site.heroCalc ? '<div class="hero-calc"><div class="calc calc-compact" data-calc="' + esc(site.heroCalc) + '"><template class="calc-ico">' + icon('paintcan') + '</template><p class="calc-loading">Loading the quick paint estimate...</p></div></div>' : '') +
            '</div><div class="tape" aria-hidden="true"></div></section>';
          if (tools.length) {
            var popular = (site.popularTools || []).map(function (s) { return liveBySlug[s]; }).filter(function (p) { return p && p.tool; });
            if (popular.length < 6) popular = popular.concat(tools.filter(function (p) { return popular.indexOf(p) < 0; })).slice(0, 9);
            body += '<section class="section wrap" aria-labelledby="tools-h"><div class="section-head"><div><h2 id="tools-h">' + esc(site.toolsTitle || 'Popular calculators') + '</h2><p>' + esc(site.toolsText || '') + '</p></div>' +
              '<a class="btn btn-ghost" href="' + pre + 'tools/">See all ' + tools.length + ' calculators</a></div>' +
              '<div class="tool-grid">' + popular.map(function (p) { return toolTile(p, pre); }).join('') + '</div></section>';
          }
          if (lead) {
            body += '<section class="section wrap" aria-labelledby="start-h"><div class="section-head"><div><h2 id="start-h">Start here</h2><p>' + esc(site.startText || '') + '</p></div></div>' +
              '<div class="lead-grid">' + card(lead, pre, true) + '<div class="lead-side">' + restFeatured.map(function (p) { return card(p, pre); }).join('') + '</div></div></section>';
          }
          body += '<section class="section wrap" aria-labelledby="topics-h"><div class="section-head"><div><h2 id="topics-h">Browse by project</h2></div></div><div class="topic-grid">' +
            liveCats.map(function (c) {
              var count = live.filter(function (p) { return p.category === c.slug; }).length;
              var tcount = tools.filter(function (p) { return p.category === c.slug; }).length;
              return '<a class="topic" href="' + pre + catPath(c) + '" style="--c:' + esc(c.color) + '"><span class="topic-ico">' + icon(c.icon || 'calc') + '</span><strong>' + esc(c.name) + '</strong><small>' + esc(c.short || c.description || '') + '</small>' +
                '<span class="topic-count">' + count + ' guides' + (tcount ? ', ' + tcount + ' calculators' : '') + '</span></a>';
            }).join('') + '</div></section>';
          if (site.promo) {
            var pr = site.promo;
            body += '<section class="promo"><div class="wrap promo-in"><div><h2>' + esc(pr.title) + '</h2><p>' + esc(pr.text) + '</p></div><div class="promo-actions">' +
              (pr.links || []).map(function (l, i) { return '<a class="btn ' + (i === 0 ? 'btn-tape' : 'btn-light') + '" href="' + esc(l.href) + '">' + esc(l.label) + '</a>'; }).join('') + '</div></div></section>';
          }
        }
        var hTag = n === 1 ? 'h2' : 'h1';
        body += '<section class="section wrap" aria-labelledby="latest-h"><div class="section-head"><div><' + hTag + ' id="latest-h">' + (n === 1 ? 'Latest guides' : 'Guides, page ' + n) + '</' + hTag + '></div></div>' +
          '<div class="grid grid-3">' + slice.map(function (p) { return card(p, pre); }).join('') + '</div>' + pagination(n, total, pre, '') + '</section>';
        var ld = n === 1 ? [{
          '@context': 'https://schema.org', '@graph': [
            { '@type': 'WebSite', '@id': baseUrl + '/#site', url: baseUrl + '/', name: site.name, description: site.description, publisher: { '@id': baseUrl + '/#org' }, inLanguage: site.language || 'en' },
            orgLd()
          ]
        }] : [];
        files[path + 'index.html'] = layout({
          path: path, title: n === 1 ? (site.seoTitle || site.name) : ('Guides, page ' + n + ' | ' + site.name),
          description: site.description, body: body, ld: ld, noindex: n > 1, calc: n === 1 && !!site.heroCalc, bodyClass: 'is-home', active: 'home'
        });
      }
    }

    /* --- topic pages --- */
    function categoryPages() {
      liveCats.forEach(function (c) {
        var path = catPath(c);
        var pre = pathPrefix(path);
        var list = live.filter(function (p) { return p.category === c.slug; });
        var ctools = list.filter(function (p) { return p.tool; });
        var guides = list.filter(function (p) { return !p.tool; });
        var body = '<section class="page-head" style="--c:' + esc(c.color) + '"><div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="' + pre + '">Home</a></li></ol></nav>' +
          '<div class="page-head-row"><span class="topic-ico big">' + icon(c.icon || 'calc') + '</span><div><h1>' + esc(c.title || c.name) + '</h1><p>' + esc(c.description || '') + '</p></div></div></div></section>';
        if (ctools.length) body += '<section class="section wrap" aria-labelledby="ct-h"><div class="section-head"><div><h2 id="ct-h">Calculators</h2></div></div><div class="tool-grid">' + ctools.map(function (p) { return toolTile(p, pre); }).join('') + '</div></section>';
        body += '<section class="section wrap" aria-labelledby="ca-h"><div class="section-head"><div><h2 id="ca-h">All ' + esc(c.name.toLowerCase()) + ' guides</h2></div></div><div class="grid grid-3">' + list.map(function (p) { return card(p, pre); }).join('') + '</div></section>';
        void guides;
        var ld = [{
          '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.title || c.name, description: c.description, url: abs(path),
          mainEntity: { '@type': 'ItemList', itemListElement: list.map(function (p, i) { return { '@type': 'ListItem', position: i + 1, url: abs(postPath(p)), name: p.title }; }) }
        }, crumbsLd([{ name: 'Home', url: baseUrl + '/' }, { name: c.name, url: abs(path) }])];
        files[path + 'index.html'] = layout({ path: path, title: (c.seoTitle || c.title || c.name) + ' | ' + site.name, description: c.description, body: body, ld: ld, active: 'cat:' + c.slug, bodyClass: 'is-topic' });
      });
    }

    /* --- all calculators --- */
    function toolsPage() {
      if (!tools.length) return;
      var path = 'tools/';
      var pre = pathPrefix(path);
      var t = site.toolsPage || {};
      var body = '<section class="page-head"><div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="' + pre + '">Home</a></li></ol></nav>' +
        '<div class="page-head-row"><span class="topic-ico big">' + icon('calc') + '</span><div><h1>' + esc(t.title || 'All calculators') + '</h1><p>' + esc(t.text || '') + '</p></div></div></div></section>';
      liveCats.forEach(function (c) {
        var ct = tools.filter(function (p) { return p.category === c.slug; });
        if (!ct.length) return;
        body += '<section class="section wrap" aria-labelledby="t-' + c.slug + '"><div class="section-head"><div><h2 id="t-' + c.slug + '">' + esc(c.name) + '</h2></div><a class="btn btn-ghost" href="' + pre + catPath(c) + '">' + esc(c.name) + ' guides</a></div>' +
          '<div class="tool-grid">' + ct.map(function (p) { return toolTile(p, pre); }).join('') + '</div></section>';
      });
      var ld = [{
        '@context': 'https://schema.org', '@type': 'CollectionPage', name: t.title || 'All calculators', url: abs(path),
        mainEntity: { '@type': 'ItemList', itemListElement: tools.map(function (p, i) { return { '@type': 'ListItem', position: i + 1, url: abs(postPath(p)), name: p.tool.name }; }) }
      }, crumbsLd([{ name: 'Home', url: baseUrl + '/' }, { name: t.title || 'All calculators', url: abs(path) }])];
      files[path + 'index.html'] = layout({ path: path, title: (t.seoTitle || 'All calculators') + ' | ' + site.name, description: t.description || site.description, body: body, ld: ld, active: 'tools', bodyClass: 'is-tools' });
    }

    /* --- plain pages --- */
    function tokens(s) {
      return String(s || '')
        .replace(/\{\{siteName\}\}/g, site.name || '')
        .replace(/\{\{siteUrl\}\}/g, baseUrl)
        .replace(/\{\{email\}\}/g, (site.author && site.author.email) || '')
        .replace(/\{\{author\}\}/g, (site.author && site.author.name) || site.name || '')
        .replace(/\{\{year\}\}/g, String(year));
    }
    function plainPages() {
      pages.forEach(function (pg) {
        var path = pagePath(pg);
        var pre = pathPrefix(path);
        var r = renderMarkdown(tokens(pg.body));
        var body = '<section class="page-head"><div class="wrap-narrow"><nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="' + pre + '">Home</a></li></ol></nav><h1>' + esc(pg.title) + '</h1>' +
          (pg.description ? '<p class="post-lead">' + esc(pg.description) + '</p>' : '') +
          (pg.updated ? '<p class="post-meta"><span>Last updated <time datetime="' + pg.updated + '">' + fmtDateLong(pg.updated) + '</time></span></p>' : '') + '</div></section>' +
          '<div class="wrap-narrow page-body"><div class="prose">' + r.html + '</div></div>';
        var type = pg.slug === 'about' ? 'AboutPage' : pg.slug === 'contact' ? 'ContactPage' : 'WebPage';
        var ld = [{ '@context': 'https://schema.org', '@type': type, name: pg.title, description: pg.description || '', url: abs(path), publisher: orgLd() },
          crumbsLd([{ name: 'Home', url: baseUrl + '/' }, { name: pg.title, url: abs(path) }])];
        files[path + 'index.html'] = layout({ path: path, title: (pg.seoTitle || pg.title) + ' | ' + site.name, description: pg.description, body: body, ld: ld, active: 'page:' + pg.slug, bodyClass: 'is-page' });
      });
    }

    /* --- 404 --- */
    function notFound() {
      var pre = '/';
      var body = '<section class="page-head"><div class="wrap-narrow"><h1>That page is not here</h1><p class="post-lead">The link may be old or mistyped. Try a search, or pick one of the newest guides below.</p>' +
        '<p><button type="button" class="btn btn-tape" data-search-open>Search the site</button> <a class="btn btn-ghost" href="/">Go to the home page</a></p></div></section>' +
        '<section class="section wrap"><div class="grid grid-3">' + live.slice(0, 3).map(function (p) { return card(p, pre); }).join('') + '</div></section>';
      files['404.html'] = layout({ path: '404.html', rootRelative: true, noCanonical: true, title: 'Page not found | ' + site.name, description: site.description, body: body, noindex: true, bodyClass: 'is-404' });
    }

    /* --- feeds and machine files --- */
    function machineFiles() {
      var urls = [{ loc: baseUrl + '/', lastmod: live[0] ? (live[0].updated || live[0].date) : today }];
      if (tools.length) urls.push({ loc: abs('tools/'), lastmod: tools.map(function (p) { return p.updated || p.date; }).sort().pop() });
      live.forEach(function (p) { urls.push({ loc: abs(postPath(p)), lastmod: p.updated || p.date }); });
      liveCats.forEach(function (c) {
        var l = live.filter(function (p) { return p.category === c.slug; }).map(function (p) { return p.updated || p.date; }).sort().pop();
        urls.push({ loc: abs(catPath(c)), lastmod: l });
      });
      pages.forEach(function (pg) { urls.push({ loc: abs(pagePath(pg)), lastmod: pg.updated || undefined }); });
      files['sitemap.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.map(function (u) { return '  <url><loc>' + esc(u.loc) + '</loc>' + (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '') + '</url>'; }).join('\n') + '\n</urlset>\n';

      files['feed.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>' +
        '<title>' + esc(site.name) + '</title><link>' + esc(baseUrl + '/') + '</link><description>' + esc(site.description || '') + '</description><language>' + esc(site.language || 'en') + '</language>' +
        '<atom:link href="' + esc(abs('feed.xml')) + '" rel="self" type="application/rss+xml"/>' +
        live.slice(0, 20).map(function (p) {
          return '<item><title>' + esc(p.title) + '</title><link>' + esc(abs(postPath(p))) + '</link><guid isPermaLink="true">' + esc(abs(postPath(p))) + '</guid><pubDate>' + rfc822(p.date) + '</pubDate><description>' + esc(p.description || '') + '</description>' +
            (catName(p.category) ? '<category>' + esc(catName(p.category)) + '</category>' : '') + '</item>';
        }).join('') + '</channel></rss>\n';

      files['robots.txt'] = 'User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /content/\n\nSitemap: ' + abs('sitemap.xml') + '\n';

      files['manifest.webmanifest'] = JSON.stringify({
        name: site.name, short_name: site.shortName || site.name, start_url: './', display: 'standalone',
        background_color: '#F6F8FA', theme_color: '#16324F', description: site.description || '',
        icons: [{ src: 'assets/img/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'assets/img/icon-512.png', sizes: '512x512', type: 'image/png' }]
      }, null, 2) + '\n';

      files['search.json'] = JSON.stringify(live.map(function (p) {
        return { t: p.title, d: p.description || '', c: catName(p.category), u: postPath(p), k: (p.keywords || []).join(' ') + (p.tool ? ' calculator ' + p.tool.name : ''), x: p.tool ? 1 : 0 };
      })) + '\n';
    }

    /* run everything */
    live.forEach(articlePage);
    homePages();
    categoryPages();
    toolsPage();
    plainPages();
    notFound();
    machineFiles();

    return { files: files, warnings: warnings, live: live.map(function (p) { return p.slug; }), skipped: Object.keys(skipped) };
  }

  return { build: build, slugify: slugify, localDate: localDate };
});
