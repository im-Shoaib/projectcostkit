/* Line icons (24x24, stroke). Shared by the builder (tool tiles) and the admin. UMD. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PCK_ICONS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var I = {
    roller: '<rect x="3" y="3" width="15" height="6" rx="1.5"/><path d="M18 6h2.5v5H11v3"/><rect x="9.5" y="14" width="3" height="7" rx="1"/>',
    paintcan: '<path d="M5 9h14v10.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5z"/><path d="M4 9h16V7.5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1z"/><path d="M5.5 6.5C6.5 2.5 17.5 2.5 18.5 6.5"/><path d="M14 9v3.2a1.2 1.2 0 0 0 2.4 0V9"/><path d="M8.5 15h4"/>',
    house: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    housecost: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M12 11v6M14 12.2c-.5-.6-1.2-.9-2-.9-1.1 0-2 .6-2 1.4 0 1.9 4 1 4 2.9 0 .8-.9 1.4-2 1.4-.8 0-1.6-.3-2-.9"/>',
    primer: '<path d="M6 9h12v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M5 9h14"/><path d="M12 2.5s-2.5 2.6-2.5 4a2.5 2.5 0 0 0 5 0c0-1.4-2.5-4-2.5-4z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    room: '<path d="M3 20V5l6-2v17"/><path d="M9 4h12v16H3"/><path d="M13 9h4v5h-4z"/>',
    floor: '<path d="M3 4h18v16H3z"/><path d="M3 9.3h18M3 14.6h18"/><path d="M10 4v5.3M15 9.3v5.3M8 14.6V20"/>',
    tile: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
    grout: '<path d="M4 15 15 4l5 5L9 20H4z"/><path d="m12 7 5 5"/><path d="M4 20h16"/>',
    baseboard: '<path d="M3 4v16h18"/><path d="M3 15h18"/><path d="M3 12.5h14a2 2 0 0 1 2 2"/>',
    compare: '<path d="M12 3v18M7 21h10"/><path d="M5 7h14"/><path d="m5 7-3 7h6zM19 7l-3 7h6z"/>',
    scissors: '<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M8.5 8.5 20 18M8.5 15.5 20 6"/>',
    mulch: '<path d="M2 20h20"/><path d="M4 20c1-4 4-7 8-7s7 3 8 7"/><path d="M12 13V7"/><path d="M12 9c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4zM12 8c0-2.5 1.5-4 4-4 0 2.5-1.5 4-4 4z"/>',
    gravel: '<path d="M2 20h20"/><ellipse cx="7" cy="16.5" rx="4" ry="3"/><ellipse cx="15.5" cy="17" rx="4.5" ry="2.8"/><ellipse cx="11.5" cy="11.5" rx="3.5" ry="2.6"/>',
    fence: '<path d="M5 21V6l2-3 2 3v15M15 21V6l2-3 2 3v15"/><path d="M3 9h18M3 16h18"/>',
    deck: '<path d="M3 9h18v4H3z"/><path d="M5 13v8M19 13v8M12 13v8"/><path d="M3 9l3-4h12l3 4"/>',
    boards: '<rect x="3" y="4" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/>',
    pavers: '<path d="M3 4h18v16H3z"/><path d="M3 9.3h18M3 14.6h18M9 4v5.3M15 4v5.3M6 9.3v5.3M12 9.3v5.3M18 9.3v5.3M9 14.6V20M15 14.6V20"/>',
    concrete: '<path d="M4 8h16l-1.5 12h-13z"/><path d="M8 8V5h8v3"/><path d="M8 13h8M9 16.5h6"/>',
    post: '<path d="M10 2h4v12h-4z"/><path d="M3 14h18"/><path d="M7 14v6h10v-6"/>',
    drywall: '<path d="M4 3h16v18H4z"/><path d="M4 9h16M4 15h16"/><path d="M8 6h.01M16 6h.01M8 12h.01M16 12h.01M8 18h.01M16 18h.01"/>',
    wallpaper: '<path d="M4 6a3 3 0 0 1 6 0v12a3 3 0 0 0-6 0z"/><path d="M7 3h11v15H7"/><path d="M11 7l2 2 2-2 2 2"/>',
    ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l1.5 1.5M13 7l2 2"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M8.5 10h7M8.5 14h7M8.5 18h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    quote: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 12h6M9 15.5h6M9 19h3"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-2-2 6.5-6.5a4 4 0 0 1-5-5L11 6l-7.5 7.5L2 12l8-8 1.3 1.3"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.8 3.5 5.8 3.5 9s-1 6.2-3.5 9c-2.5-2.8-3.5-5.8-3.5-9s1-6.2 3.5-9z"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    calc: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8 6.5h8v3H8z"/><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/>',
    printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
    reset: '<path d="M4 4v6h6"/><path d="M5.5 15A7.5 7.5 0 1 0 6 8.5L4 10"/>'
  };
  function svg(name, cls, size) {
    var body = I[name] || I.calc;
    var s = size || 24;
    return '<svg class="' + (cls || 'ico') + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  }
  return { paths: I, svg: svg };
});
