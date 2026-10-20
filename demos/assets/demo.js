/* Shared behaviour for the ProjectCostKit contractor demo sites. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // Mobile menu
  $$('[data-nav-toggle]').forEach(function (btn) {
    var nav = document.getElementById(btn.getAttribute('aria-controls'));
    if (!nav) return;
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('is-open', !open);
    });
    $$('a', nav).forEach(function (a) {
      a.addEventListener('click', function () { btn.setAttribute('aria-expanded', 'false'); nav.classList.remove('is-open'); });
    });
  });

  // Demo forms: nothing is sent, the visitor sees what would happen on a real site
  $$('form[data-demo-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var box = $('.form-done', form) || $('.form-done', form.parentNode);
      if (box) {
        box.hidden = false;
        box.focus && box.focus();
      }
      form.classList.add('is-sent');
    });
  });

  // Before / after slider
  $$('[data-ba]').forEach(function (wrap) {
    var range = $('input[type=range]', wrap), after = $('.ba-after', wrap), handle = $('.ba-handle', wrap);
    function set(v) { after.style.clipPath = 'inset(0 0 0 ' + v + '%)'; handle.style.left = v + '%'; }
    range.addEventListener('input', function () { set(range.value); });
    set(range.value);
  });

  // Tabs
  $$('[data-tabs]').forEach(function (box) {
    var tabs = $$('[role=tab]', box);
    function show(t) {
      tabs.forEach(function (x) {
        var on = x === t;
        x.setAttribute('aria-selected', String(on));
        x.tabIndex = on ? 0 : -1;
        document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
      });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(t); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        var n = tabs[(i + d + tabs.length) % tabs.length]; n.focus(); show(n);
      });
    });
  });

  // Filter buttons for galleries
  $$('[data-filter]').forEach(function (bar) {
    var grid = document.getElementById(bar.getAttribute('data-filter'));
    $$('button', bar).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('button', bar).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        var f = b.getAttribute('data-value');
        $$('[data-cat]', grid).forEach(function (it) { it.hidden = f !== 'all' && it.getAttribute('data-cat') !== f; });
      });
    });
  });

  // Booking days (plumbing demo): next five days from today
  $$('[data-days]').forEach(function (box) {
    var names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var html = '';
    for (var i = 0; i < 5; i++) {
      var d = new Date(); d.setDate(d.getDate() + i);
      var label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : names[d.getDay()];
      html += '<label class="chip"><input type="radio" name="day" value="' + d.toDateString() + '"' + (i === 0 ? ' checked' : '') + '><span><b>' + label + '</b>' + months[d.getMonth()] + ' ' + d.getDate() + '</span></label>';
    }
    box.innerHTML = html;
  });

  // Remodel budget estimator
  $$('[data-estimator]').forEach(function (box) {
    var base = { kitchen: [26000, 42000, 9], bath: [12000, 21000, 5], basement: [30000, 52000, 10] };
    var size = { small: .75, medium: 1, large: 1.4 };
    var finish = { standard: .8, mid: 1, high: 1.6 };
    var out = $('[data-est-out]', box), weeks = $('[data-est-weeks]', box);
    function money(n) { return '$' + (Math.round(n / 500) * 500).toLocaleString('en-US'); }
    function calc() {
      var t = $('[name=type]:checked', box).value, s = $('[name=size]:checked', box).value, f = $('[name=finish]:checked', box).value;
      var m = size[s] * finish[f], b = base[t];
      out.textContent = money(b[0] * m) + ' to ' + money(b[1] * m);
      weeks.textContent = Math.round(b[2] * (0.7 + size[s] * .3) * (f === 'high' ? 1.25 : 1)) + ' to ' + Math.round(b[2] * (0.7 + size[s] * .3) * (f === 'high' ? 1.25 : 1) + 3) + ' weeks on site';
    }
    box.addEventListener('change', calc);
    calc();
  });

  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
