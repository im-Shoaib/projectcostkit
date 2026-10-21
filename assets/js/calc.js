/*
 * ProjectCostKit calculators.
 * One small engine + one definition per calculator. Each page has <div class="calc" data-calc="id">.
 * Math is done in US units (feet, inches, square feet, gallons) and converted for display.
 * The pure math lives in CALCS[id].compute so it can be tested in Node: require('./calc.js').CALCS.
 */
(function (root) {
  'use strict';

  /* ---------------- units ---------------- */
  // k converts a metric input to the US base unit (base = metric * k)
  var FAM = {
    len: { imp: 'ft', met: 'm', k: 3.28084 },
    small: { imp: 'in', met: 'mm', k: 1 / 25.4 },
    depth: { imp: 'in', met: 'cm', k: 1 / 2.54 },
    area: { imp: 'sq ft', met: 'm²', k: 10.76391 },
    cov: { imp: 'sq ft/gal', met: 'm²/L', k: 10.76391 * 3.785412 },
    perVol: { imp: 'per gal', met: 'per L', k: 3.785412 },
    perArea: { imp: 'per sq ft', met: 'per m²', k: 1 / 10.76391 },
    perLen: { imp: 'per ft', met: 'per m', k: 1 / 3.28084 },
    perYd3: { imp: 'per cu yd', met: 'per m³', k: 0.764555 },
    perTon: { imp: 'per ton', met: 'per tonne', k: 0.907185 },
    weight: { imp: 'lb', met: 'kg', k: 2.204623 },
    perSqyd: { imp: 'per sq yd', met: 'per m²', k: 0.836127 },
    nRate: { imp: 'lb N per 1,000 sq ft', met: 'g N per m²', k: 0.204816 }
  };
  var GAL_L = 3.785412, YD3_FT3 = 27, M3_FT3 = 35.31467, SQM = 10.76391, KG_LB = 2.204623;

  /* ---------------- formatting ---------------- */
  function num(x, d) {
    if (!isFinite(x)) return '–';
    d = d == null ? 0 : d;
    var s = (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (parts[1] && /^0+$/.test(parts[1])) return parts[0];
    return parts[1] ? parts[0] + '.' + parts[1].replace(/0+$/, '') : parts[0];
  }
  function smart(x) { return num(x, Math.abs(x) < 10 ? 2 : Math.abs(x) < 100 ? 1 : 0); }
  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }

  function makeFmt(u, cur) {
    var sym = { USD: '$', GBP: '£', EUR: '€' }[cur] || '$';
    return {
      u: u,
      money: function (x, d) {
        if (!isFinite(x)) return '–';
        var neg = x < 0; x = Math.abs(x);
        d = d == null ? (x < 100 ? 2 : 0) : d;
        var s = num(x, d);
        if (d === 2 && s.indexOf('.') === -1) s += '.00';
        else if (d === 2 && /\.\d$/.test(s)) s += '0';
        return (neg ? '-' : '') + sym + s;
      },
      sym: sym,
      area: function (sqft) { return u === 'met' ? smart(sqft / SQM) + ' m²' : num(sqft, sqft < 100 ? 1 : 0) + ' sq ft'; },
      len: function (ft) { return u === 'met' ? smart(ft / 3.28084) + ' m' : num(ft, ft < 100 ? 1 : 0) + ' ft'; },
      vol: function (ft3) { return u === 'met' ? num(ft3 / M3_FT3, 2) + ' m³' : num(ft3 / YD3_FT3, 2) + ' cu yd'; },
      perArea: function (perSqft) { return u === 'met' ? 'per m²' : 'per sq ft'; },
      areaRate: function (perSqft) { return u === 'met' ? perSqft * SQM : perSqft; }
    };
  }

  /* ---------------- shared math ---------------- */
  function shapeArea(r) {
    // r: {s: 'rect'|'tri'|'circle', a, b} in feet
    if (r.s === 'circle') return Math.PI * Math.pow(r.a / 2, 2);
    if (r.s === 'tri') return r.a * r.b / 2;
    return r.a * r.b;
  }
  function rowsArea(rows) { return (rows || []).reduce(function (s, r) { return s + Math.max(0, shapeArea(r)); }, 0); }
  function rowsPerimeter(rows) { return (rows || []).reduce(function (s, r) { return s + 2 * (Math.max(0, r.a) + Math.max(0, r.b)); }, 0); }

  // paint: gallons -> what to buy (US gallons and quarts)
  function buyGallons(g) {
    var quarts = Math.ceil(g * 4 - 1e-9);
    var gal = Math.floor(quarts / 4), qt = quarts % 4;
    if (qt === 3) { gal += 1; qt = 0; }
    var text = gal ? num(gal) + ' ' + plural(gal, 'gallon') : '';
    if (qt) text += (text ? ' + ' : '') + qt + ' ' + plural(qt, 'quart');
    if (!text) text = '0 gallons';
    return { text: text, gallons: gal + qt / 4 };
  }
  // paint: litres -> tins (5 L, 2.5 L, 1 L)
  function buyLitres(L) {
    var n5 = Math.floor(L / 5 + 1e-9), rem = L - n5 * 5, n25 = 0, n1 = 0;
    if (rem > 3.5 + 1e-9) n5++;
    else if (rem > 2.5 + 1e-9) { n25 = 1; n1 = 1; }
    else if (rem > 1 + 1e-9) n25 = 1;
    else if (rem > 1e-9) n1 = 1;
    var parts = [];
    if (n5) parts.push(n5 + ' × 5 L');
    if (n25) parts.push(n25 + ' × 2.5 L');
    if (n1) parts.push(n1 + ' × 1 L');
    return { text: parts.join(' + ') || '0 L', litres: n5 * 5 + n25 * 2.5 + n1 };
  }

  var DOOR_SQFT = 21, WINDOW_SQFT = 15; // 3x7 ft door, 3x5 ft window

  function paintRoom(v) {
    // v in base units: length, width, height (ft); doors, windows, coats; ceiling 'yes'/'no'; cov sqft/gal
    var perim = 2 * (v.length + v.width);
    var walls = Math.max(0, perim * v.height - (v.doors || 0) * DOOR_SQFT - (v.windows || 0) * WINDOW_SQFT);
    var ceiling = v.ceiling === 'yes' ? v.length * v.width : 0;
    var surface = walls + ceiling;
    var gallons = surface * v.coats / v.cov;
    return { walls: walls, ceiling: ceiling, surface: surface, gallons: gallons };
  }

  /* ---------------- calculator definitions ---------------- */
  var CURRENCY_NOTE = 'Default prices are typical US prices. Change them to match your store or supplier.';

  var CALCS = {};

  CALCS.paint = {
    title: 'Paint calculator', icon: 'paintcan',
    fields: [
      { group: 'Room size', id: 'length', label: 'Room length', fam: 'len', def: { imp: 12, met: 3.6 } },
      { group: 'Room size', id: 'width', label: 'Room width', fam: 'len', def: { imp: 12, met: 3.6 } },
      { group: 'Room size', id: 'height', label: 'Wall height', fam: 'len', def: { imp: 8, met: 2.4 } },
      { group: 'What you are painting', id: 'doors', label: 'Doors', type: 'int', def: 1, min: 0, hint: 'Each takes off about 21 sq ft (2 m²)' },
      { group: 'What you are painting', id: 'windows', label: 'Windows', type: 'int', def: 2, min: 0, hint: 'Each takes off about 15 sq ft (1.4 m²)' },
      { group: 'What you are painting', id: 'ceiling', label: 'Paint the ceiling too?', type: 'select', def: 'no', opts: [['no', 'No, walls only'], ['yes', 'Yes, same paint']] },
      { group: 'What you are painting', id: 'coats', label: 'Coats', type: 'select', def: '2', opts: [['1', '1 coat'], ['2', '2 coats'], ['3', '3 coats']] },
      { group: 'Paint', id: 'cov', label: 'Coverage per can', fam: 'cov', def: { imp: 350, met: 12 }, hint: 'Check the label. 350 sq ft/gal (about 9 m²/L) is a safe planning number.' },
      { group: 'Paint', id: 'price', label: 'Paint price', fam: 'perVol', money: true, def: { imp: 45, met: 9 } }
    ],
    compute: function (v, f) {
      var r = paintRoom({ length: v.length, width: v.width, height: v.height, doors: v.doors, windows: v.windows, ceiling: v.ceiling, coats: +v.coats, cov: v.cov });
      if (r.surface <= 0) return { error: 'The doors and windows add up to more than the wall area. Check the room size.' };
      var main, cost;
      if (f.u === 'met') {
        var L = r.gallons * GAL_L, t = buyLitres(L);
        main = { label: 'Paint to buy', value: num(L, 1) + ' L', sub: 'For example ' + t.text };
        cost = t.litres * v.price / GAL_L; // price is per gallon in base units
      } else {
        var b = buyGallons(r.gallons);
        main = { label: 'Paint to buy', value: num(r.gallons, 2) + ' gal', sub: 'Buy ' + b.text };
        cost = b.gallons * v.price;
      }
      return {
        main: main,
        rows: [
          ['Wall area (after doors and windows)', f.area(r.walls)],
          r.ceiling ? ['Ceiling area', f.area(r.ceiling)] : null,
          ['Area painted, all coats', f.area(r.surface * +v.coats)],
          ['Estimated paint cost', f.money(cost), 'total']
        ],
        note: 'Rough, porous or patched walls drink more paint. Add about 10% for those, or for a big color change.'
      };
    }
  };

  CALCS['paint-quick'] = {
    title: 'Quick paint estimate', icon: 'paintcan', compact: true,
    fields: [
      { id: 'length', label: 'Room length', fam: 'len', def: { imp: 12, met: 3.6 } },
      { id: 'width', label: 'Room width', fam: 'len', def: { imp: 12, met: 3.6 } },
      { id: 'height', label: 'Wall height', fam: 'len', def: { imp: 8, met: 2.4 } },
      { id: 'coats', label: 'Coats', type: 'select', def: '2', opts: [['1', '1 coat'], ['2', '2 coats'], ['3', '3 coats']] }
    ],
    link: { href: 'blog/paint-calculator/', label: 'Full paint calculator' },
    compute: function (v, f) {
      var r = paintRoom({ length: v.length, width: v.width, height: v.height, doors: 1, windows: 2, ceiling: 'no', coats: +v.coats, cov: 350 });
      if (f.u === 'met') {
        var L = r.gallons * GAL_L;
        return { main: { label: 'Wall paint needed', value: num(L, 1) + ' L', sub: 'For example ' + buyLitres(L).text }, rows: [['Wall area', f.area(r.walls)], ['Assumes', '1 door, 2 windows']] };
      }
      return { main: { label: 'Wall paint needed', value: num(r.gallons, 2) + ' gal', sub: 'Buy ' + buyGallons(r.gallons).text }, rows: [['Wall area', f.area(r.walls)], ['Assumes', '1 door, 2 windows']] };
    }
  };

  CALCS['paint-cost'] = {
    title: 'Room painting cost estimator', icon: 'room',
    fields: [
      { group: 'Room size', id: 'length', label: 'Room length', fam: 'len', def: { imp: 12, met: 3.6 } },
      { group: 'Room size', id: 'width', label: 'Room width', fam: 'len', def: { imp: 14, met: 4.2 } },
      { group: 'Room size', id: 'height', label: 'Wall height', fam: 'len', def: { imp: 8, met: 2.4 } },
      { group: 'Scope', id: 'ceiling', label: 'Ceiling', type: 'select', def: 'no', opts: [['no', 'Not included'], ['yes', 'Paint it too']] },
      { group: 'Scope', id: 'trim', label: 'Baseboards and trim', type: 'select', def: 'no', opts: [['no', 'Not included'], ['yes', 'Paint them too']] },
      { group: 'Pro pricing', id: 'lo', label: 'Low rate (walls)', fam: 'perArea', money: true, def: { imp: 2, met: 21.5 }, hint: 'Per sq ft of floor' },
      { group: 'Pro pricing', id: 'hi', label: 'High rate (walls)', fam: 'perArea', money: true, def: { imp: 6, met: 64.5 } },
      { group: 'Doing it yourself', id: 'price', label: 'Paint price', fam: 'perVol', money: true, def: { imp: 45, met: 9 } },
      { group: 'Doing it yourself', id: 'supplies', label: 'Rollers, brushes, tape, drop cloths', type: 'money', def: 75 }
    ],
    compute: function (v, f) {
      if (v.hi < v.lo) return { error: 'The high rate is lower than the low rate. Swap them.' };
      var floor = v.length * v.width, perim = 2 * (v.length + v.width);
      var lo = floor * v.lo, hi = floor * v.hi;
      if (v.ceiling === 'yes') { lo += floor * 1; hi += floor * 6; }
      if (v.trim === 'yes') { lo += perim * 1; hi += perim * 3; }
      var paint = paintRoom({ length: v.length, width: v.width, height: v.height, doors: 1, windows: 2, ceiling: v.ceiling, coats: 2, cov: 350 });
      var diyPaint = f.u === 'met' ? buyLitres(paint.gallons * GAL_L).litres * v.price / GAL_L : buyGallons(paint.gallons).gallons * v.price;
      if (v.trim === 'yes') diyPaint += f.u === 'met' ? v.price / GAL_L : 0.25 * v.price; // a 1 L tin or a quart of trim paint
      var diy = diyPaint + v.supplies;
      var mid = (lo + hi) / 2;
      return {
        main: { label: 'Typical price to hire a painter', value: f.money(lo, 0) + ' to ' + f.money(hi, 0), sub: 'Middle of the range: ' + f.money(mid, 0) },
        rows: [
          ['Floor area', f.area(floor)],
          v.ceiling === 'yes' ? ['Ceiling (adds $1 to $6 per sq ft of floor)', 'Included'] : null,
          v.trim === 'yes' ? ['Trim (adds $1 to $3 per linear ft)', f.len(perim)] : null,
          ['Paint for 2 coats', f.u === 'met' ? num(paint.gallons * GAL_L, 1) + ' L' : num(paint.gallons, 2) + ' gal'],
          ['Do it yourself (paint and supplies)', f.money(diy, 0), 'total'],
          ['Saving if you DIY, against the middle price', f.money(Math.max(0, mid - diy), 0)]
        ],
        note: 'Pro ranges follow Angi\'s 2026 data: $2 to $6 per square foot of floor for walls. Ceiling and trim rates are in US dollars per square foot and per foot.'
      };
    }
  };

  CALCS['exterior-paint'] = {
    title: 'Exterior paint calculator', icon: 'house',
    fields: [
      { group: 'House size', id: 'length', label: 'House length', fam: 'len', def: { imp: 50, met: 15 } },
      { group: 'House size', id: 'width', label: 'House width', fam: 'len', def: { imp: 30, met: 9 } },
      { group: 'House size', id: 'height', label: 'Wall height to the eaves', fam: 'len', def: { imp: 18, met: 5.5 }, hint: 'About 9 ft (2.7 m) per story' },
      { group: 'House size', id: 'gables', label: 'Gable ends', type: 'select', def: '2', opts: [['0', 'None (hip roof)'], ['2', '2 gables'], ['4', '4 gables']] },
      { group: 'House size', id: 'gableH', label: 'Gable height (eave to peak)', fam: 'len', def: { imp: 7, met: 2.1 }, show: function (v) { return v.gables !== '0'; } },
      { group: 'Openings', id: 'windows', label: 'Windows', type: 'int', def: 12, min: 0 },
      { group: 'Openings', id: 'doors', label: 'Doors (incl. garage = 3)', type: 'int', def: 2, min: 0 },
      { group: 'Paint', id: 'surface', label: 'Surface', type: 'select', def: '350', opts: [['350', 'Smooth siding (350 sq ft/gal)'], ['250', 'Rough: stucco, brick, shakes (250 sq ft/gal)']] },
      { group: 'Paint', id: 'coats', label: 'Coats', type: 'select', def: '2', opts: [['1', '1 coat'], ['2', '2 coats']] },
      { group: 'Paint', id: 'price', label: 'Paint price', fam: 'perVol', money: true, def: { imp: 60, met: 12 } }
    ],
    compute: function (v, f) {
      var walls = 2 * (v.length + v.width) * v.height;
      var g = +v.gables;
      var gableArea = 0; // each gable is a triangle: base x height / 2
      if (g === 4) gableArea = 2 * (v.width * v.gableH / 2) + 2 * (v.length * v.gableH / 2);
      else if (g === 2) gableArea = 2 * (v.width * v.gableH / 2);
      var openings = v.windows * WINDOW_SQFT + v.doors * DOOR_SQFT;
      var area = Math.max(0, walls + gableArea - openings);
      if (!area) return { error: 'The openings add up to more than the wall area. Check the sizes.' };
      var gallons = area * (+v.coats) / (+v.surface);
      var main, cost;
      if (f.u === 'met') {
        var L = gallons * GAL_L, tins10 = Math.floor(L / 10), rest = buyLitres(L - tins10 * 10);
        main = { label: 'Exterior paint to buy', value: num(L, 0) + ' L', sub: 'For example ' + (tins10 ? tins10 + ' × 10 L' + (rest.litres ? ' + ' : '') : '') + (rest.litres ? rest.text : '') };
        cost = (tins10 * 10 + rest.litres) * v.price / GAL_L;
      } else {
        var whole = Math.ceil(gallons - 1e-9), five = Math.floor(whole / 5), ones = whole - five * 5;
        main = { label: 'Exterior paint to buy', value: num(gallons, 1) + ' gal', sub: 'Buy ' + (five ? five + ' × 5-gallon ' + plural(five, 'bucket') + (ones ? ' + ' : '') : '') + (ones ? ones + ' ' + plural(ones, 'gallon') : '') };
        cost = whole * v.price;
      }
      return {
        main: main,
        rows: [
          ['Wall area', f.area(walls)],
          g ? ['Gable area', f.area(gableArea)] : null,
          ['Taken off for openings', '-' + f.area(openings)],
          ['Paintable area', f.area(area)],
          ['Estimated paint cost', f.money(cost, 0), 'total']
        ],
        note: 'Trim, fascia, shutters and doors usually take a separate gallon or two of a different sheen.'
      };
    }
  };

  CALCS['exterior-cost'] = {
    title: 'Exterior painting cost estimator', icon: 'housecost',
    fields: [
      { id: 'home', label: 'Home size (living area)', fam: 'area', def: { imp: 2000, met: 185 } },
      { id: 'lo', label: 'Low rate', fam: 'perArea', money: true, def: { imp: 1.5, met: 16 } },
      { id: 'hi', label: 'High rate', fam: 'perArea', money: true, def: { imp: 4, met: 43 } },
      { id: 'quote', label: 'A quote you received (optional)', type: 'money', def: 0, min: 0 }
    ],
    compute: function (v, f) {
      if (v.hi < v.lo) return { error: 'The high rate is lower than the low rate. Swap them.' };
      var lo = v.home * v.lo, hi = v.home * v.hi, mid = (lo + hi) / 2;
      var rows = [['Home size', f.area(v.home)], ['Middle of the range', f.money(mid, 0)]];
      if (v.quote > 0) {
        var where = v.quote < lo ? 'Below the usual range. Ask what prep and paint are included.' : v.quote > hi ? 'Above the usual range. Ask for a line-by-line breakdown.' : 'Inside the usual range.';
        rows.push(['Your quote', f.money(v.quote, 0)]);
        rows.push(['How it compares', where, 'total']);
      }
      return {
        main: { label: 'Typical cost to paint the outside', value: f.money(lo, 0) + ' to ' + f.money(hi, 0), sub: 'Based on the rates you entered' },
        rows: rows,
        note: 'Default rates are $1.50 to $4 per square foot of home, from Angi\'s 2026 data via NerdWallet. Height, siding type and repairs move you within the range.'
      };
    }
  };

  CALCS.primer = {
    title: 'Primer calculator', icon: 'primer',
    fields: [
      { id: 'area', label: 'Area to prime', fam: 'area', def: { imp: 400, met: 37 }, hint: 'Walls: perimeter × height' },
      { id: 'coats', label: 'Coats of primer', type: 'select', def: '1', opts: [['1', '1 coat'], ['2', '2 coats (dark color, bare wood, stains)']] },
      { id: 'cov', label: 'Primer coverage', fam: 'cov', def: { imp: 250, met: 6 }, hint: 'Most primers: 200 to 300 sq ft/gal' },
      { id: 'price', label: 'Primer price', fam: 'perVol', money: true, def: { imp: 30, met: 7 } }
    ],
    compute: function (v, f) {
      var gallons = v.area * (+v.coats) / v.cov;
      if (f.u === 'met') {
        var L = gallons * GAL_L, t = buyLitres(L);
        return { main: { label: 'Primer to buy', value: num(L, 1) + ' L', sub: 'For example ' + t.text }, rows: [['Area', f.area(v.area)], ['Estimated cost', f.money(t.litres * v.price / GAL_L), 'total']] };
      }
      var b = buyGallons(gallons);
      return { main: { label: 'Primer to buy', value: num(gallons, 2) + ' gal', sub: 'Buy ' + b.text }, rows: [['Area', f.area(v.area)], ['Estimated cost', f.money(b.gallons * v.price), 'total']], note: 'Primer spreads thinner than paint because bare surfaces soak it up, so it covers less per gallon.' };
    }
  };

  CALCS.flooring = {
    title: 'Flooring calculator', icon: 'floor',
    fields: [
      { group: 'Rooms', id: 'rooms', type: 'rects', label: 'Area', shapes: false, def: { imp: [[14, 12]], met: [[4.2, 3.6]] }, addLabel: 'Add another area', hint: 'Split L-shaped rooms into rectangles.' },
      { group: 'Flooring', id: 'waste', label: 'Extra for cuts and waste', type: 'select', def: '10', opts: [['5', '5% (simple room, straight lay)'], ['10', '10% (most rooms)'], ['15', '15% (diagonal or lots of angles)']] },
      { group: 'Flooring', id: 'box', label: 'Coverage per box', fam: 'area', def: { imp: 20, met: 2 } },
      { group: 'Flooring', id: 'price', label: 'Flooring price', fam: 'perArea', money: true, def: { imp: 3.5, met: 38 } }
    ],
    compute: function (v, f) {
      var area = rowsArea(v.rooms);
      if (!area) return { error: 'Enter at least one room size.' };
      var need = area * (1 + v.waste / 100);
      var boxes = Math.ceil(need / v.box - 1e-9);
      var bought = boxes * v.box;
      return {
        main: { label: 'Boxes to buy', value: num(boxes) + ' ' + plural(boxes, 'box', 'boxes'), sub: f.area(bought) + ' of flooring' },
        rows: [['Floor area', f.area(area)], ['With ' + v.waste + '% extra', f.area(need)], ['Material cost', f.money(bought * v.price, 0), 'total']],
        note: 'Keep one unopened box after the job. Matching a dye lot years later is hard.'
      };
    }
  };

  CALCS.tile = {
    title: 'Tile calculator', icon: 'tile',
    fields: [
      { group: 'Area', id: 'rooms', type: 'rects', label: 'Area', shapes: false, def: { imp: [[8, 6]], met: [[2.4, 1.8]] }, addLabel: 'Add another area' },
      { group: 'Tile', id: 'tl', label: 'Tile length', fam: 'small', def: { imp: 12, met: 300 } },
      { group: 'Tile', id: 'tw', label: 'Tile width', fam: 'small', def: { imp: 12, met: 300 } },
      { group: 'Tile', id: 'joint', label: 'Grout joint', fam: 'small', def: { imp: 0.125, met: 3 }, min: 0, step: 'any', hint: '1/8 in = 0.125' },
      { group: 'Tile', id: 'waste', label: 'Extra for cuts and breakage', type: 'select', def: '10', opts: [['10', '10% (straight layout)'], ['15', '15% (diagonal or herringbone)'], ['20', '20% (complex room, large format)']] },
      { group: 'Buying', id: 'perBox', label: 'Tiles per box', type: 'int', def: 10, min: 1 },
      { group: 'Buying', id: 'boxPrice', label: 'Price per box', type: 'money', def: 30 }
    ],
    compute: function (v, f) {
      var area = rowsArea(v.rooms);
      if (!area) return { error: 'Enter the area you are tiling.' };
      var tileSqft = (v.tl + v.joint) * (v.tw + v.joint) / 144;
      var exact = area / tileSqft;
      var tiles = Math.ceil(exact * (1 + v.waste / 100) - 1e-9);
      var boxes = Math.ceil(tiles / v.perBox - 1e-9);
      return {
        main: { label: 'Tiles to buy', value: num(tiles) + ' tiles', sub: num(boxes) + ' ' + plural(boxes, 'box', 'boxes') + ' of ' + v.perBox },
        rows: [['Area', f.area(area)], ['Tiles to cover it exactly', num(Math.ceil(exact - 1e-9))], ['With ' + v.waste + '% extra', num(tiles)], ['Tile cost', f.money(boxes * v.boxPrice, 0), 'total']]
      };
    }
  };

  CALCS.grout = {
    title: 'Grout calculator', icon: 'grout',
    fields: [
      { id: 'area', label: 'Tiled area', fam: 'area', def: { imp: 60, met: 5.5 } },
      { id: 'tl', label: 'Tile length', fam: 'small', def: { imp: 12, met: 300 } },
      { id: 'tw', label: 'Tile width', fam: 'small', def: { imp: 12, met: 300 } },
      { id: 'tt', label: 'Tile thickness', fam: 'small', def: { imp: 0.375, met: 9 }, step: 'any', hint: '3/8 in = 0.375' },
      { id: 'joint', label: 'Joint width', fam: 'small', def: { imp: 0.125, met: 3 }, step: 'any', hint: '1/8 in = 0.125, 1/4 in = 0.25' },
      { id: 'bag', label: 'Bag size', type: 'select', def: { imp: '25', met: '20' }, opts: { imp: [['10', '10 lb'], ['25', '25 lb']], met: [['5', '5 kg'], ['20', '20 kg']] } }
    ],
    compute: function (v, f) {
      // Mapei formula: kg/m² = (A + B) / (A × B) × C × D × 1.6, all in mm
      var A = v.tl * 25.4, B = v.tw * 25.4, C = v.tt * 25.4, D = v.joint * 25.4;
      var kgm2 = (A + B) / (A * B) * C * D * 1.6;
      var m2 = v.area / SQM;
      var kg = kgm2 * m2 * 1.1;
      var lb = kg * KG_LB;
      var bagNum = +v.bag;
      var bags = f.u === 'met' ? Math.ceil(kg / bagNum - 1e-9) : Math.ceil(lb / bagNum - 1e-9);
      return {
        main: { label: 'Grout to buy', value: f.u === 'met' ? num(kg, 1) + ' kg' : num(lb, 1) + ' lb', sub: bags + ' × ' + (f.u === 'met' ? bagNum + ' kg' : bagNum + ' lb') + ' ' + plural(bags, 'bag') },
        rows: [['Use rate', f.u === 'met' ? num(kgm2, 2) + ' kg per m²' : num(kgm2 * KG_LB / SQM, 3) + ' lb per sq ft'], ['Area', f.area(v.area)], ['Includes', '10% extra for mixing and cleanup']],
        note: 'Uses the manufacturer formula printed on Mapei grout data sheets, with an average density of 1.6 kg per liter. Epoxy grouts cover a little less.'
      };
    }
  };

  CALCS.baseboard = {
    title: 'Baseboard calculator', icon: 'baseboard',
    fields: [
      { group: 'Rooms', id: 'rooms', type: 'rects', label: 'Room', shapes: false, def: { imp: [[12, 12]], met: [[3.6, 3.6]] }, addLabel: 'Add another room' },
      { group: 'Details', id: 'doors', label: 'Doorways', type: 'int', def: 1, min: 0, hint: 'About 3 ft (0.9 m) skipped at each' },
      { group: 'Details', id: 'stick', label: 'Length of each piece', type: 'select', def: { imp: '16', met: '3.6' }, opts: { imp: [['8', '8 ft'], ['12', '12 ft'], ['16', '16 ft']], met: [['2.4', '2.4 m'], ['3', '3.0 m'], ['3.6', '3.6 m'], ['4.2', '4.2 m']] } },
      { group: 'Details', id: 'waste', label: 'Extra for miters and mistakes', type: 'select', def: '10', opts: [['10', '10%'], ['15', '15% (many corners)']] },
      { group: 'Details', id: 'price', label: 'Price per piece', type: 'money', def: 15 }
    ],
    compute: function (v, f) {
      var perim = rowsPerimeter(v.rooms);
      if (!perim) return { error: 'Enter at least one room size.' };
      var run = Math.max(0, perim - v.doors * 3);
      var need = run * (1 + v.waste / 100);
      var stickFt = f.u === 'met' ? +v.stick * 3.28084 : +v.stick;
      var pieces = Math.ceil(need / stickFt - 1e-9);
      return {
        main: { label: 'Pieces to buy', value: num(pieces) + ' ' + plural(pieces, 'piece'), sub: (f.u === 'met' ? v.stick + ' m' : v.stick + ' ft') + ' lengths' },
        rows: [['Room perimeter', f.len(perim)], ['Baseboard run (doorways removed)', f.len(run)], ['With ' + v.waste + '% extra', f.len(need)], ['Cost', f.money(pieces * v.price, 0), 'total']],
        note: 'Longer pieces mean fewer joints on long walls. Buy at least one piece longer than your longest wall if you can.'
      };
    }
  };

  CALCS['floor-cost'] = {
    title: 'Laminate vs vinyl plank cost', icon: 'compare',
    fields: [
      { group: 'Area', id: 'area', label: 'Floor area', fam: 'area', def: { imp: 300, met: 28 } },
      { group: 'Area', id: 'removal', label: 'Old floor removal (optional)', fam: 'perArea', money: true, def: { imp: 0, met: 0 }, min: 0, hint: 'Angi: $1.50 to $3.50 per sq ft' },
      { group: 'Laminate', id: 'lamMat', label: 'Laminate material', fam: 'perArea', money: true, def: { imp: 3, met: 32 } },
      { group: 'Laminate', id: 'lamLab', label: 'Laminate labor', fam: 'perArea', money: true, def: { imp: 4, met: 43 }, min: 0, hint: 'Enter 0 if you install it yourself' },
      { group: 'Laminate', id: 'under', label: 'Underlayment', fam: 'perArea', money: true, def: { imp: 0.45, met: 5 }, min: 0 },
      { group: 'Vinyl plank (LVP)', id: 'lvpMat', label: 'LVP material', fam: 'perArea', money: true, def: { imp: 4, met: 43 } },
      { group: 'Vinyl plank (LVP)', id: 'lvpLab', label: 'LVP labor', fam: 'perArea', money: true, def: { imp: 3, met: 32 }, min: 0 }
    ],
    compute: function (v, f) {
      var a = v.area * 1.1; // 10% extra material
      var lam = a * (v.lamMat + v.under) + v.area * (v.lamLab + v.removal);
      var lvp = a * v.lvpMat + v.area * (v.lvpLab + v.removal);
      var cheaper = lam <= lvp ? 'Laminate' : 'Vinyl plank';
      return {
        main: { label: cheaper + ' costs less here', value: f.money(Math.abs(lam - lvp), 0) + ' less', sub: 'Laminate ' + f.money(lam, 0) + ' vs vinyl plank ' + f.money(lvp, 0) },
        rows: [
          ['Laminate total', f.money(lam, 0)],
          ['Laminate per ' + (f.u === 'met' ? 'm²' : 'sq ft'), f.money(f.areaRate(lam / v.area))],
          ['Vinyl plank total', f.money(lvp, 0)],
          ['Vinyl plank per ' + (f.u === 'met' ? 'm²' : 'sq ft'), f.money(f.areaRate(lvp / v.area))]
        ],
        note: 'Material includes 10% extra for cuts. Many LVP products have underlayment attached, so it is not added here.'
      };
    }
  };

  CALCS.mulch = {
    title: 'Mulch calculator', icon: 'mulch',
    fields: [
      { group: 'Beds', id: 'beds', type: 'rects', label: 'Bed', shapes: true, def: { imp: [['rect', 20, 4]], met: [['rect', 6, 1.2]] }, addLabel: 'Add another bed', hint: 'Circle: enter the diameter. Triangle: base and height.' },
      { group: 'Mulch', id: 'depth', label: 'Depth', fam: 'depth', def: { imp: 3, met: 7.5 }, hint: 'Fine mulch: 2 in. Coarse: 3 to 4 in.' },
      { group: 'Mulch', id: 'bag', label: 'Bag size', type: 'select', def: { imp: '2', met: '50' }, opts: { imp: [['2', '2 cu ft'], ['3', '3 cu ft']], met: [['50', '50 L'], ['70', '70 L'], ['100', '100 L']] } },
      { group: 'Prices', id: 'bagPrice', label: 'Price per bag', type: 'money', def: 4.5 },
      { group: 'Prices', id: 'bulk', label: 'Bulk price', fam: 'perYd3', money: true, def: { imp: 45, met: 60 } }
    ],
    compute: function (v, f) {
      var area = rowsArea(v.beds);
      if (!area) return { error: 'Enter at least one bed size.' };
      var ft3 = area * v.depth / 12;
      var bagFt3 = f.u === 'met' ? +v.bag / 1000 * M3_FT3 : +v.bag;
      var bags = Math.ceil(ft3 / bagFt3 - 1e-9);
      var bulkCost = ft3 / YD3_FT3 * v.bulk;
      return {
        main: { label: 'Mulch needed', value: f.vol(ft3), sub: 'or ' + num(bags) + ' bags of ' + (f.u === 'met' ? v.bag + ' L' : v.bag + ' cu ft') },
        rows: [['Bed area', f.area(area)], ['Bagged cost', f.money(bags * v.bagPrice, 0)], ['Bulk cost (before delivery)', f.money(bulkCost, 0)], ['Cheaper here', bags * v.bagPrice > bulkCost ? 'Bulk, if delivery is cheap' : 'Bags', 'total']],
        note: 'Keep mulch 6 to 12 inches back from tree trunks, and use gravel instead of wood mulch within 5 feet of the house.'
      };
    }
  };

  var STONE = [['1.4', 'Crushed stone (about 1.4 tons per cu yd)'], ['1.5', 'Crusher run or road base (about 1.5)'], ['1.35', 'Pea gravel or river rock (about 1.35)']];
  CALCS.gravel = {
    title: 'Gravel calculator', icon: 'gravel',
    fields: [
      { group: 'Area', id: 'areas', type: 'rects', label: 'Area', shapes: true, def: { imp: [['rect', 20, 10]], met: [['rect', 6, 3]] }, addLabel: 'Add another area' },
      { group: 'Gravel', id: 'depth', label: 'Depth', fam: 'depth', def: { imp: 3, met: 7.5 }, hint: 'Paths: 2 to 3 in. Driveways: 4 to 6 in.' },
      { group: 'Gravel', id: 'dens', label: 'Material', type: 'select', def: '1.4', opts: STONE },
      { group: 'Gravel', id: 'price', label: 'Price', fam: 'perTon', money: true, def: { imp: 45, met: 50 } }
    ],
    compute: function (v, f) {
      var area = rowsArea(v.areas);
      if (!area) return { error: 'Enter the area you are covering.' };
      var ft3 = area * v.depth / 12, yd3 = ft3 / YD3_FT3, tons = yd3 * +v.dens;
      var tonnes = tons * 0.907185;
      return {
        main: f.u === 'met' ? { label: 'Gravel to order', value: num(tonnes, 2) + ' tonnes', sub: f.vol(ft3) } : { label: 'Gravel to order', value: num(tons, 2) + ' tons', sub: f.vol(ft3) },
        rows: [['Area', f.area(area)], ['Volume', f.vol(ft3)], ['Material cost (before delivery)', f.money(tons * v.price, 0), 'total']],
        note: 'Weights are typical for dry material. Wet stone and stone with fines weigh more, so suppliers may round up.'
      };
    }
  };

  CALCS.fence = {
    title: 'Fence materials calculator', icon: 'fence',
    fields: [
      { group: 'Fence', id: 'length', label: 'Fence length', fam: 'len', def: { imp: 120, met: 36 } },
      { group: 'Fence', id: 'height', label: 'Fence height', type: 'select', def: { imp: '6', met: '1.8' }, opts: { imp: [['4', '4 ft'], ['5', '5 ft'], ['6', '6 ft']], met: [['1.2', '1.2 m'], ['1.5', '1.5 m'], ['1.8', '1.8 m']] } },
      { group: 'Fence', id: 'spacing', label: 'Post spacing', type: 'select', def: { imp: '8', met: '2.4' }, opts: { imp: [['6', '6 ft'], ['8', '8 ft']], met: [['1.8', '1.8 m'], ['2.4', '2.4 m']] } },
      { group: 'Fence', id: 'gates', label: 'Gates', type: 'int', def: 1, min: 0, hint: 'Each gate opening: 4 ft (1.2 m)' },
      { group: 'Boards', id: 'pw', label: 'Picket width', fam: 'small', def: { imp: 5.5, met: 140 }, hint: 'A 1x6 picket is 5.5 in wide' },
      { group: 'Boards', id: 'gap', label: 'Gap between pickets', fam: 'small', def: { imp: 0, met: 0 }, min: 0, step: 'any', hint: '0 for a privacy fence' },
      { group: 'Boards', id: 'bagsPer', label: 'Concrete bags per post', type: 'num', def: 2, min: 0, step: 0.5, hint: 'Use our post concrete calculator for an exact count' },
      { group: 'Prices', id: 'pPost', label: 'Post', type: 'money', def: 20 },
      { group: 'Prices', id: 'pRail', label: 'Rail', type: 'money', def: 9 },
      { group: 'Prices', id: 'pPicket', label: 'Picket', type: 'money', def: 3.5 },
      { group: 'Prices', id: 'pBag', label: 'Concrete bag', type: 'money', def: 7 }
    ],
    compute: function (v, f) {
      var gateW = 4;
      var heightFt = f.u === 'met' ? +v.height * 3.28084 : +v.height;
      var spacingFt = f.u === 'met' ? +v.spacing * 3.28084 : +v.spacing;
      var run = v.length - v.gates * gateW;
      if (run <= 0) return { error: 'The gates take up the whole fence length. Check the length.' };
      var sections = Math.ceil(run / spacingFt - 1e-9);
      var posts = sections + 1 + v.gates;
      var railsPer = heightFt > 5.01 ? 3 : 2;
      var rails = sections * railsPer;
      var pickets = Math.ceil(run * 12 / (v.pw + v.gap) - 1e-9);
      var bags = Math.ceil(posts * v.bagsPer - 1e-9);
      var cost = posts * v.pPost + rails * v.pRail + pickets * v.pPicket + bags * v.pBag;
      return {
        main: { label: 'Materials estimate', value: f.money(cost, 0), sub: num(posts) + ' posts, ' + num(rails) + ' rails, ' + num(pickets) + ' pickets' },
        rows: [['Fence sections', num(sections)], ['Posts (incl. gate posts)', num(posts)], ['Rails (' + railsPer + ' per section)', num(rails)], ['Pickets', num(pickets)], ['Concrete bags', num(bags)], ['Gate hardware', v.gates ? 'Not included' : 'None']],
        note: 'Wood privacy fences usually have posts 6 to 8 feet apart. Check local rules on height and how close to the property line you can build.'
      };
    }
  };

  CALCS['deck-boards'] = {
    title: 'Deck board calculator', icon: 'boards',
    fields: [
      { group: 'Deck', id: 'length', label: 'Deck length (along the boards)', fam: 'len', def: { imp: 16, met: 4.8 } },
      { group: 'Deck', id: 'width', label: 'Deck width (across the boards)', fam: 'len', def: { imp: 12, met: 3.6 } },
      { group: 'Boards', id: 'bw', label: 'Board width', type: 'select', def: { imp: '5.5', met: '140' }, opts: { imp: [['5.5', '5.5 in (6 in boards)'], ['3.5', '3.5 in (4 in boards)']], met: [['140', '140 mm'], ['90', '90 mm']] } },
      { group: 'Boards', id: 'gap', label: 'Gap between boards', fam: 'small', def: { imp: 0.1875, met: 5 }, step: 'any', hint: 'Trex: 3/16 in (0.1875). Check your board brand.' },
      { group: 'Boards', id: 'blen', label: 'Board length you will buy', type: 'select', def: { imp: '16', met: '4.8' }, opts: { imp: [['12', '12 ft'], ['16', '16 ft'], ['20', '20 ft']], met: [['3.6', '3.6 m'], ['4.8', '4.8 m'], ['5.4', '5.4 m']] } },
      { group: 'Boards', id: 'joist', label: 'Joist spacing', type: 'select', def: { imp: '16', met: '400' }, opts: { imp: [['12', '12 in'], ['16', '16 in']], met: [['300', '300 mm'], ['400', '400 mm']] } },
      { group: 'Boards', id: 'waste', label: 'Extra for cuts', type: 'select', def: '10', opts: [['5', '5%'], ['10', '10%'], ['15', '15% (angled layout)']] },
      { group: 'Boards', id: 'price', label: 'Price per board', type: 'money', def: 38 }
    ],
    compute: function (v, f) {
      var bwIn = f.u === 'met' ? +v.bw / 25.4 : +v.bw;
      var blenFt = f.u === 'met' ? +v.blen * 3.28084 : +v.blen;
      var joistIn = f.u === 'met' ? +v.joist / 25.4 : +v.joist;
      var rowsN = Math.ceil(v.width * 12 / (bwIn + v.gap) - 1e-9);
      var perRow = Math.ceil(v.length / blenFt - 1e-9);
      var boards = Math.ceil(rowsN * perRow * (1 + v.waste / 100) - 1e-9);
      var joists = Math.floor(v.length * 12 / joistIn + 1e-9) + 1;
      var screws = rowsN * joists * 2;
      return {
        main: { label: 'Deck boards to buy', value: num(boards) + ' boards', sub: (f.u === 'met' ? v.blen + ' m' : v.blen + ' ft') + ' long' },
        rows: [['Deck area', f.area(v.length * v.width)], ['Rows of boards', num(rowsN)], ['Boards per row', num(perRow)], ['Joists the boards cross', num(joists)], ['Face screws (2 per joist)', num(screws)], ['Board cost', f.money(boards * v.price, 0), 'total']],
        note: 'Composite boards often need 12 in joist spacing for diagonal layouts. Follow the board maker\'s guide.'
      };
    }
  };

  var DECK_MAT = { pt: [2, 5], cedar: [3, 7], redwood: [5, 35], composite: [12, 22] };
  CALCS['deck-cost'] = {
    title: 'Deck cost estimator', icon: 'deck',
    fields: [
      { id: 'area', label: 'Deck size', fam: 'area', def: { imp: 300, met: 28 } },
      { id: 'mat', label: 'Decking material', type: 'select', def: 'pt', opts: [['pt', 'Pressure-treated wood'], ['cedar', 'Cedar'], ['redwood', 'Redwood'], ['composite', 'Composite']] },
      { id: 'labLo', label: 'Labor, low', fam: 'perArea', money: true, def: { imp: 15, met: 160 } },
      { id: 'labHi', label: 'Labor, high', fam: 'perArea', money: true, def: { imp: 35, met: 375 } },
      { id: 'permit', label: 'Permit', type: 'money', def: 350, min: 0, hint: 'Usually $230 to $500' }
    ],
    compute: function (v, f) {
      var m = DECK_MAT[v.mat] || DECK_MAT.pt;
      var lo = v.area * (m[0] + v.labLo) + v.permit;
      var hi = v.area * (m[1] + v.labHi) + v.permit;
      return {
        main: { label: 'Estimated deck cost', value: f.money(lo, 0) + ' to ' + f.money(hi, 0), sub: 'Middle of the range: ' + f.money((lo + hi) / 2, 0) },
        rows: [['Deck size', f.area(v.area)], ['Material', '$' + m[0] + ' to $' + m[1] + ' per sq ft'], ['Labor', f.money(v.area * v.labLo, 0) + ' to ' + f.money(v.area * v.labHi, 0)], ['Permit', f.money(v.permit, 0)]],
        note: 'Material ranges are US prices per square foot from Angi\'s 2026 data. Railings, stairs and footings on a slope add to the total.'
      };
    }
  };

  CALCS.pavers = {
    title: 'Paver calculator', icon: 'pavers',
    fields: [
      { group: 'Patio', id: 'length', label: 'Patio length', fam: 'len', def: { imp: 16, met: 4.8 } },
      { group: 'Patio', id: 'width', label: 'Patio width', fam: 'len', def: { imp: 12, met: 3.6 } },
      { group: 'Pavers', id: 'pl', label: 'Paver length', fam: 'small', def: { imp: 8, met: 200 } },
      { group: 'Pavers', id: 'pw', label: 'Paver width', fam: 'small', def: { imp: 4, met: 100 } },
      { group: 'Pavers', id: 'waste', label: 'Extra for cuts', type: 'select', def: '10', opts: [['5', '5% (square patio)'], ['10', '10% (most patios)'], ['15', '15% (curves, patterns)']] },
      { group: 'Base', id: 'base', label: 'Gravel base depth', fam: 'depth', def: { imp: 4, met: 10 }, hint: 'Patios: 4 in compacted. Driveways need more.' },
      { group: 'Base', id: 'sand', label: 'Bedding sand depth', fam: 'depth', def: { imp: 1, met: 2.5 } },
      { group: 'Prices', id: 'pPaver', label: 'Price per paver', type: 'money', def: 0.75 },
      { group: 'Prices', id: 'pBase', label: 'Base gravel', fam: 'perTon', money: true, def: { imp: 40, met: 45 } }
    ],
    compute: function (v, f) {
      var area = v.length * v.width;
      var paverSqft = v.pl * v.pw / 144;
      var pavers = Math.ceil(area / paverSqft * (1 + v.waste / 100) - 1e-9);
      var baseArea = (v.length + 1) * (v.width + 1); // base runs 6 in past every edge
      var baseFt3 = baseArea * v.base / 12, baseTons = baseFt3 / YD3_FT3 * 1.5;
      var sandFt3 = area * v.sand / 12;
      return {
        main: { label: 'Pavers to buy', value: num(pavers) + ' pavers', sub: 'For ' + f.area(area) + ' with ' + v.waste + '% extra' },
        rows: [
          ['Base gravel (crusher run)', f.u === 'met' ? num(baseTons * 0.907185, 2) + ' tonnes' : num(baseTons, 2) + ' tons'],
          ['Bedding sand', f.vol(sandFt3)],
          ['Paver cost', f.money(pavers * v.pPaver, 0)],
          ['Base gravel cost', f.money(baseTons * v.pBase, 0)],
          ['Materials total', f.money(pavers * v.pPaver + baseTons * v.pBase, 0), 'total']
        ],
        note: 'The base is figured 6 inches wider than the patio on every side and compacted. Add polymeric sand for the joints and an edge restraint.'
      };
    }
  };

  var BAGS_IMP = [['80', '80 lb'], ['60', '60 lb'], ['50', '50 lb'], ['40', '40 lb']];
  var BAGS_MET = [['25', '25 kg'], ['20', '20 kg']];
  var YIELD_PER_LB = 0.6 / 80; // Quikrete: 80 lb bag yields 0.60 cu ft
  function bagYieldFt3(size, u) { return u === 'met' ? +size * KG_LB * YIELD_PER_LB : +size * YIELD_PER_LB; }

  CALCS.concrete = {
    title: 'Concrete calculator', icon: 'concrete',
    fields: [
      { id: 'shape', label: 'Shape', type: 'select', def: 'slab', opts: [['slab', 'Slab, footing or wall (rectangle)'], ['round', 'Round column or hole']] },
      { id: 'length', label: 'Length', fam: 'len', def: { imp: 10, met: 3 }, show: function (v) { return v.shape === 'slab'; } },
      { id: 'width', label: 'Width', fam: 'len', def: { imp: 10, met: 3 }, show: function (v) { return v.shape === 'slab'; } },
      { id: 'thick', label: 'Thickness', fam: 'depth', def: { imp: 4, met: 10 }, show: function (v) { return v.shape === 'slab'; }, hint: 'Walkways and patios: 4 in (10 cm)' },
      { id: 'dia', label: 'Diameter', fam: 'small', def: { imp: 12, met: 300 }, show: function (v) { return v.shape === 'round'; } },
      { id: 'depth', label: 'Height or depth', fam: 'len', def: { imp: 4, met: 1.2 }, show: function (v) { return v.shape === 'round'; } },
      { id: 'qty', label: 'How many', type: 'int', def: 1, min: 1 },
      { id: 'waste', label: 'Extra for spills and uneven ground', type: 'select', def: '10', opts: [['5', '5%'], ['10', '10%']] },
      { id: 'bag', label: 'Bag size', type: 'select', def: { imp: '80', met: '25' }, opts: { imp: BAGS_IMP, met: BAGS_MET } },
      { id: 'bagPrice', label: 'Price per bag', type: 'money', def: 7 },
      { id: 'ready', label: 'Ready-mix price', fam: 'perYd3', money: true, def: { imp: 110, met: 145 }, hint: 'Ask about short-load fees for small orders' }
    ],
    compute: function (v, f) {
      var one = v.shape === 'round' ? Math.PI * Math.pow(v.dia / 24, 2) * v.depth : v.length * v.width * v.thick / 12;
      var ft3 = one * v.qty * (1 + v.waste / 100);
      if (!ft3) return { error: 'Enter the size of the pour.' };
      var bags = Math.ceil(ft3 / bagYieldFt3(v.bag, f.u) - 1e-9);
      var readyCost = ft3 / YD3_FT3 * v.ready;
      return {
        main: { label: 'Concrete needed', value: f.vol(ft3), sub: 'or ' + num(bags) + ' bags of ' + (f.u === 'met' ? v.bag + ' kg' : v.bag + ' lb') },
        rows: [['Volume before extra', f.vol(one * v.qty)], ['Bagged cost', f.money(bags * v.bagPrice, 0)], ['Ready-mix cost (before fees)', f.money(readyCost, 0)], ['Rule of thumb', bags > 60 ? 'Order ready-mix' : 'Bags are fine', 'total']],
        note: 'Bag yields from the Quikrete data sheet: an 80 lb bag makes 0.60 cu ft. Metric bag counts use the same yield per kilogram.'
      };
    }
  };

  CALCS['post-concrete'] = {
    title: 'Fence post concrete calculator', icon: 'post',
    fields: [
      { id: 'posts', label: 'Number of posts', type: 'int', def: 10, min: 1 },
      { id: 'dia', label: 'Hole diameter', fam: 'small', def: { imp: 10, met: 250 }, hint: 'About 3 times the post width' },
      { id: 'depth', label: 'Hole depth', fam: 'depth', def: { imp: 30, met: 75 }, hint: 'At least a third of the post height above ground' },
      { id: 'gravel', label: 'Gravel in the bottom', fam: 'depth', def: { imp: 4, met: 10 }, min: 0 },
      { id: 'post', label: 'Post size', type: 'select', def: { imp: '3.5', met: '100' }, opts: { imp: [['3.5', '4x4 (3.5 in)'], ['5.5', '6x6 (5.5 in)'], ['r4', 'Round, 4 in'], ['r2.4', 'Round metal, 2-3/8 in']], met: [['75', '75 mm square'], ['100', '100 mm square'], ['125', '125 mm square']] } },
      { id: 'bag', label: 'Bag size', type: 'select', def: { imp: '50', met: '20' }, opts: { imp: BAGS_IMP, met: BAGS_MET } },
      { id: 'bagPrice', label: 'Price per bag', type: 'money', def: 7 }
    ],
    compute: function (v, f) {
      var fill = v.depth - v.gravel; // inches of concrete
      if (fill <= 0) return { error: 'The gravel layer is as deep as the hole. Check the depth.' };
      var holeIn3 = Math.PI * Math.pow(v.dia / 2, 2) * fill;
      var p = String(v.post), postIn3;
      if (p.charAt(0) === 'r') postIn3 = Math.PI * Math.pow(+p.slice(1) / 2, 2) * fill;
      else { var s = f.u === 'met' ? +p / 25.4 : +p; postIn3 = s * s * fill; }
      var perPostFt3 = Math.max(0, holeIn3 - postIn3) / 1728;
      if (!perPostFt3) return { error: 'The post is as wide as the hole. Make the hole wider.' };
      var y = bagYieldFt3(v.bag, f.u);
      var perPost = perPostFt3 / y;
      var total = Math.ceil(perPost * v.posts - 1e-9);
      return {
        main: { label: 'Bags of concrete', value: num(total) + ' bags', sub: num(perPost, 1) + ' bags per post (' + (f.u === 'met' ? v.bag + ' kg' : v.bag + ' lb') + ')' },
        rows: [['Concrete per post', f.u === 'met' ? num(perPostFt3 / M3_FT3 * 1000, 1) + ' L' : num(perPostFt3, 2) + ' cu ft'], ['All posts', f.vol(perPostFt3 * v.posts)], ['Cost', f.money(total * v.bagPrice, 0), 'total']],
        note: 'Slope the top of the concrete away from the post so rain runs off instead of pooling against the wood.'
      };
    }
  };

  CALCS.drywall = {
    title: 'Drywall calculator', icon: 'drywall',
    fields: [
      { group: 'Room', id: 'length', label: 'Room length', fam: 'len', def: { imp: 12, met: 3.6 } },
      { group: 'Room', id: 'width', label: 'Room width', fam: 'len', def: { imp: 12, met: 3.6 } },
      { group: 'Room', id: 'height', label: 'Wall height', fam: 'len', def: { imp: 8, met: 2.4 } },
      { group: 'Room', id: 'ceiling', label: 'Ceiling', type: 'select', def: 'yes', opts: [['yes', 'Include the ceiling'], ['no', 'Walls only']] },
      { group: 'Room', id: 'doors', label: 'Doors', type: 'int', def: 1, min: 0 },
      { group: 'Room', id: 'windows', label: 'Windows', type: 'int', def: 1, min: 0 },
      { group: 'Sheets', id: 'sheet', label: 'Sheet size', type: 'select', def: { imp: '4x8', met: '1.2x2.4' }, opts: { imp: [['4x8', '4 × 8 ft'], ['4x10', '4 × 10 ft'], ['4x12', '4 × 12 ft']], met: [['1.2x2.4', '1200 × 2400 mm'], ['1.2x2.7', '1200 × 2700 mm'], ['0.9x1.8', '900 × 1800 mm']] } },
      { group: 'Sheets', id: 'waste', label: 'Extra for cuts', type: 'select', def: '10', opts: [['10', '10%'], ['15', '15% (many openings or angles)']] },
      { group: 'Sheets', id: 'price', label: 'Price per sheet', type: 'money', def: 18 }
    ],
    compute: function (v, f) {
      var dims = String(v.sheet).split('x').map(Number);
      var sw = dims[0], sl = dims[1];
      if (f.u === 'met') { sw *= 3.28084; sl *= 3.28084; }
      var sheetSqft = sw * sl;
      var walls = Math.max(0, 2 * (v.length + v.width) * v.height - v.doors * DOOR_SQFT - v.windows * WINDOW_SQFT);
      var ceil = v.ceiling === 'yes' ? v.length * v.width : 0;
      var wallSheets = Math.ceil(walls * (1 + v.waste / 100) / sheetSqft - 1e-9);
      var ceilSheets = Math.ceil(ceil * (1 + v.waste / 100) / sheetSqft - 1e-9);
      var sheets = wallSheets + ceilSheets;
      // screws: framing at 16 in across the sheet; screws every 16 in on walls, 12 in on ceilings (IRC R702.3.5)
      var cols = Math.round(sw * 12 / 16) + 1;
      var wallScrews = wallSheets * cols * (Math.floor(sl * 12 / 16) + 1);
      var ceilScrews = ceilSheets * cols * (Math.floor(sl * 12 / 12) + 1);
      var area = walls + ceil;
      var mud = area / 1000 * 9; // gallons, ProForm: 9 gal ready-mix per 1,000 sq ft
      var tape = sheets * (sw + sl);
      return {
        main: { label: 'Drywall sheets', value: num(sheets) + ' sheets', sub: num(wallSheets) + ' for walls' + (ceilSheets ? ', ' + num(ceilSheets) + ' for the ceiling' : '') },
        rows: [
          ['Area to cover', f.area(area)],
          ['Screws (about)', num(Math.ceil((wallScrews + ceilScrews) / 50) * 50)],
          ['Joint compound', f.u === 'met' ? num(mud * GAL_L, 0) + ' L' : num(mud, 1) + ' gal'],
          ['Paper tape (about)', f.len(tape)],
          ['Sheet cost', f.money(sheets * v.price, 0), 'total']
        ],
        note: 'Compound uses the maker\'s rule of about 9 gallons of ready-mix per 1,000 sq ft. Screw spacing follows the IRC: 16 in on walls, 12 in on ceilings.'
      };
    }
  };

  var ROLLS = { us: [20.5, 33 * 12], euro: [0.53 * 39.3701, 10.05 * 39.3701] };
  CALCS.wallpaper = {
    title: 'Wallpaper calculator', icon: 'wallpaper',
    fields: [
      { group: 'Walls', id: 'mode', label: 'What you are papering', type: 'select', def: 'room', opts: [['room', 'All four walls'], ['wall', 'One feature wall']] },
      { group: 'Walls', id: 'length', label: 'Room length', fam: 'len', def: { imp: 12, met: 3.6 }, show: function (v) { return v.mode === 'room'; } },
      { group: 'Walls', id: 'width', label: 'Room width', fam: 'len', def: { imp: 10, met: 3 }, show: function (v) { return v.mode === 'room'; } },
      { group: 'Walls', id: 'wall', label: 'Wall width', fam: 'len', def: { imp: 12, met: 3.6 }, show: function (v) { return v.mode === 'wall'; } },
      { group: 'Walls', id: 'height', label: 'Wall height', fam: 'len', def: { imp: 8, met: 2.4 } },
      { group: 'Paper', id: 'roll', label: 'Roll type', type: 'select', def: { imp: 'us', met: 'euro' }, opts: [['us', 'US double roll (20.5 in × 33 ft)'], ['euro', 'European roll (53 cm × 10 m)']] },
      { group: 'Paper', id: 'repeat', label: 'Pattern repeat', fam: 'small', def: { imp: 0, met: 0 }, min: 0, step: 'any', hint: 'On the label. 0 for plain or random-match paper.' }
    ],
    compute: function (v, f) {
      var widthFt = v.mode === 'wall' ? v.wall : 2 * (v.length + v.width);
      var r = ROLLS[v.roll] || ROLLS.us;
      var strip = v.height * 12 + v.repeat + 4; // inches: 2 in trim top and bottom
      var perRoll = Math.floor(r[1] / strip + 1e-9);
      if (perRoll < 1) return { error: 'One strip is longer than a whole roll. Check the wall height and repeat.' };
      var strips = Math.ceil(widthFt * 12 / r[0] - 1e-9);
      var rolls = Math.ceil(strips / perRoll - 1e-9);
      return {
        main: { label: 'Rolls to buy', value: num(rolls) + ' ' + plural(rolls, 'roll'), sub: v.roll === 'euro' ? 'European rolls' : 'US double rolls' },
        rows: [['Wall width to cover', f.len(widthFt)], ['Strips needed', num(strips)], ['Full strips per roll', num(perRoll)], ['Wall area', f.area(widthFt * v.height)]],
        note: 'Doors and windows are not taken off: the offcuts rarely match. Buy every roll from the same batch number, plus one spare.'
      };
    }
  };

  CALCS.sqft = {
    title: 'Square footage calculator', icon: 'ruler',
    fields: [
      { group: 'Areas', id: 'areas', type: 'rects', label: 'Area', shapes: true, def: { imp: [['rect', 12, 10]], met: [['rect', 3.6, 3]] }, addLabel: 'Add another area', hint: 'Circle: enter the diameter. Triangle: base and height.' },
      { group: 'Optional', id: 'price', label: 'Price (to get a total)', fam: 'perArea', money: true, def: { imp: 0, met: 0 }, min: 0 }
    ],
    compute: function (v, f) {
      var area = rowsArea(v.areas);
      if (!area) return { error: 'Enter at least one size.' };
      var rows = [['Square feet', num(area, 2) + ' sq ft'], ['Square meters', num(area / SQM, 2) + ' m²'], ['Square yards', num(area / 9, 2) + ' sq yd']];
      if (v.price > 0) rows.push(['Total at your price', f.money(area * v.price, 0), 'total']);
      return { main: { label: 'Total area', value: f.area(area), sub: f.u === 'met' ? num(area, 0) + ' sq ft' : num(area / SQM, 1) + ' m²' }, rows: rows };
    }
  };

  /* ----- for pros ----- */
  CALCS['paint-estimate'] = {
    title: 'Painting estimate calculator', icon: 'clipboard',
    fields: [
      { group: 'Job', id: 'area', label: 'Surface to paint', fam: 'area', def: { imp: 1200, met: 110 }, hint: 'Walls + ceilings, one coat' },
      { group: 'Job', id: 'coats', label: 'Coats', type: 'select', def: '2', opts: [['1', '1 coat'], ['2', '2 coats']] },
      { group: 'Job', id: 'rate', label: 'Your production rate', fam: 'area', def: { imp: 150, met: 14 }, hint: 'Area per hour, per coat. Time your crew.' },
      { group: 'Costs', id: 'labor', label: 'Labor cost per hour', type: 'money', def: 35, hint: 'Wages + payroll costs' },
      { group: 'Costs', id: 'cov', label: 'Paint coverage', fam: 'cov', def: { imp: 350, met: 9 } },
      { group: 'Costs', id: 'price', label: 'Paint price (your cost)', fam: 'perVol', money: true, def: { imp: 40, met: 8 } },
      { group: 'Costs', id: 'supplies', label: 'Supplies and masking', type: 'money', def: 60 },
      { group: 'Costs', id: 'overhead', label: 'Overhead for this job', type: 'money', def: 150, hint: 'Insurance, vehicle, phone, ads' },
      { group: 'Price', id: 'margin', label: 'Target profit margin', type: 'pct', def: 25, min: 0, max: 90 }
    ],
    compute: function (v, f) {
      if (v.margin >= 100) return { error: 'Margin must be below 100%.' };
      var hours = v.area * (+v.coats) / v.rate;
      var labor = hours * v.labor;
      var gallons = v.area * (+v.coats) / v.cov;
      var paint = Math.ceil(gallons - 1e-9) * v.price;
      var cost = labor + paint + v.supplies + v.overhead;
      var price = cost / (1 - v.margin / 100);
      return {
        main: { label: 'Price to quote', value: f.money(price, 0), sub: f.money(f.areaRate(price / v.area)) + ' ' + f.perArea() + ' of surface' },
        rows: [['Labor hours', num(hours, 1)], ['Labor cost', f.money(labor, 0)], ['Paint (' + (f.u === 'met' ? num(gallons * GAL_L, 0) + ' L' : Math.ceil(gallons - 1e-9) + ' gal') + ')', f.money(paint, 0)], ['Supplies and overhead', f.money(v.supplies + v.overhead, 0)], ['Total job cost', f.money(cost, 0)], ['Profit', f.money(price - cost, 0), 'total']],
        note: 'Margin is profit as a share of the price. A 25% margin needs a 33% markup on cost.'
      };
    }
  };

  CALCS['hourly-rate'] = {
    title: 'Contractor hourly rate calculator', icon: 'clock',
    fields: [
      { group: 'You', id: 'pay', label: 'Take-home pay you want per year', type: 'money', def: 60000 },
      { group: 'You', id: 'tax', label: 'Taxes to set aside', type: 'pct', def: 30, min: 0, max: 80, hint: 'US self-employment tax alone is 15.3%' },
      { group: 'Business', id: 'expenses', label: 'Business costs per year', type: 'money', def: 18000, hint: 'Insurance, truck, tools, phone, software, ads' },
      { group: 'Business', id: 'hours', label: 'Billable hours per week', type: 'num', def: 30, min: 1, hint: 'Paid hours only, not quoting or driving' },
      { group: 'Business', id: 'weeks', label: 'Working weeks per year', type: 'num', def: 48, min: 1, max: 52 },
      { group: 'Business', id: 'profit', label: 'Profit on top', type: 'pct', def: 10, min: 0, max: 80 }
    ],
    compute: function (v, f) {
      if (v.tax >= 100 || v.profit >= 100) return { error: 'Percentages must be below 100%.' };
      var preTax = v.pay / (1 - v.tax / 100);
      var breakEven = preTax + v.expenses;
      var revenue = breakEven / (1 - v.profit / 100);
      var hours = v.hours * v.weeks;
      return {
        main: { label: 'Charge at least', value: f.money(revenue / hours, 0) + ' per hour', sub: 'Break-even: ' + f.money(breakEven / hours, 0) + ' per hour' },
        rows: [['Billable hours per year', num(hours)], ['Income before tax', f.money(preTax, 0)], ['Plus business costs', f.money(v.expenses, 0)], ['Revenue needed, with profit', f.money(revenue, 0), 'total']],
        note: 'This is a floor, not a market rate. Compare it with what local pros charge before you set your price.'
      };
    }
  };

  CALCS.markup = {
    title: 'Markup and margin calculator', icon: 'percent',
    fields: [
      { id: 'mode', label: 'I know my', type: 'select', def: 'markup', opts: [['markup', 'Cost and markup %'], ['margin', 'Cost and the margin % I want'], ['price', 'Cost and selling price']] },
      { id: 'cost', label: 'Cost', type: 'money', def: 1000 },
      { id: 'pct', label: 'Percent', type: 'pct', def: 25, min: 0, max: 1000, show: function (v) { return v.mode !== 'price'; } },
      { id: 'price', label: 'Selling price', type: 'money', def: 1250, show: function (v) { return v.mode === 'price'; } }
    ],
    compute: function (v, f) {
      var price;
      if (v.mode === 'markup') price = v.cost * (1 + v.pct / 100);
      else if (v.mode === 'margin') { if (v.pct >= 100) return { error: 'A margin must be below 100%.' }; price = v.cost / (1 - v.pct / 100); }
      else price = v.price;
      if (!(price > 0)) return { error: 'Enter a selling price above zero.' };
      var profit = price - v.cost;
      var markup = v.cost > 0 ? profit / v.cost * 100 : 0;
      var margin = profit / price * 100;
      return {
        main: { label: 'Selling price', value: f.money(price, price < 100 ? 2 : 0), sub: 'Profit ' + f.money(profit, Math.abs(profit) < 100 ? 2 : 0) },
        rows: [['Markup (profit ÷ cost)', num(markup, 1) + '%'], ['Margin (profit ÷ price)', num(margin, 1) + '%', 'total']],
        note: profit < 0 ? 'This price is below your cost.' : 'Markup is always the bigger number. 25% markup gives a 20% margin.'
      };
    }
  };

  CALCS.handyman = {
    title: 'Handyman job price calculator', icon: 'wrench',
    fields: [
      { group: 'Labor', id: 'hours', label: 'Hours on site', type: 'num', def: 3, min: 0, step: 0.25 },
      { group: 'Labor', id: 'rate', label: 'Hourly rate', type: 'money', def: 75 },
      { group: 'Materials', id: 'mat', label: 'Materials (your cost)', type: 'money', def: 120, min: 0 },
      { group: 'Materials', id: 'markup', label: 'Markup on materials', type: 'pct', def: 20, min: 0, hint: 'Common: 20% to 50%' },
      { group: 'Fees', id: 'trip', label: 'Trip or supply-run fee', type: 'money', def: 0, min: 0 },
      { group: 'Fees', id: 'min', label: 'Minimum charge', type: 'money', def: 150, min: 0 }
    ],
    compute: function (v, f) {
      var labor = v.hours * v.rate, mats = v.mat * (1 + v.markup / 100);
      var sub = labor + mats + v.trip;
      var total = Math.max(sub, v.min);
      return {
        main: { label: 'Price for this job', value: f.money(total, 0), sub: total > sub ? 'Your minimum charge applies' : 'Labor, materials and fees' },
        rows: [['Labor', f.money(labor, 0)], ['Materials with markup', f.money(mats, 0)], ['Trip fee', f.money(v.trip, 0)], ['Material profit', f.money(mats - v.mat, 0), 'total']]
      };
    }
  };

  CALCS.quote = { title: 'Free estimate builder', icon: 'quote', custom: true };

  /* =========================================================================
     Batch 2 calculators (October 2026). Each one reproduces the worked example
     in its article with the default values.
     ========================================================================= */
  function up(x) { return Math.ceil(x - 1e-9); }
  function upStep(x, step) { return Math.ceil(x / step - 1e-9) * step; }
  function inch(f, x, d) { return f.u === 'met' ? num(x * 25.4, 0) + ' mm' : num(x, d == null ? 2 : d) + ' in'; }
  function ftIn(inches) { var ft = Math.floor(inches / 12 + 1e-9), i = inches - ft * 12; return ft + ' ft' + (i > 0.05 ? ' ' + num(i, 1) + ' in' : ''); }
  function cuft(f, ft3) { return f.u === 'met' ? num(ft3 / M3_FT3 * 1000, 0) + ' L' : num(ft3, 1) + ' cu ft'; }
  function orderVol(f, ft3) { // bulk orders in quarter steps
    return f.u === 'met' ? num(upStep(ft3 / M3_FT3, 0.25), 2) + ' m³' : num(upStep(ft3 / YD3_FT3, 0.25), 2) + ' cu yd';
  }
  function weightTxt(f, lb, d) { return f.u === 'met' ? num(lb / KG_LB, d == null ? 1 : d) + ' kg' : num(lb, d == null ? 1 : d) + ' lb'; }
  function buyCans(f, gal) { // stain and paint in whole gallons, 5-gallon pails for big jobs; litres in metric
    if (f.u === 'met') { var t = buyLitres(gal * GAL_L); return { text: t.text, gal: t.litres / GAL_L }; }
    var n = up(gal), p5 = Math.floor(n / 5), r = n - p5 * 5;
    if (r === 4) { p5++; r = 0; }
    var parts = [];
    if (p5) parts.push(p5 + ' × 5-gallon ' + plural(p5, 'pail'));
    if (r) parts.push(r + ' ' + plural(r, 'gallon'));
    return { text: parts.join(' + ') || '0 gallons', gal: p5 * 5 + r };
  }

  /* ----- roofing ----- */
  var PITCH = [['0', 'Flat or almost flat'], ['3', '3/12 (14°)'], ['4', '4/12 (18°)'], ['5', '5/12 (23°)'], ['6', '6/12 (27°)'], ['7', '7/12 (30°)'], ['8', '8/12 (34°)'], ['9', '9/12 (37°)'], ['10', '10/12 (40°)'], ['12', '12/12 (45°)']];
  CALCS.roofing = {
    title: 'Roofing calculator', icon: 'roof',
    fields: [
      { group: 'Roof', id: 'secs', type: 'rects', label: 'Section', def: { imp: [[40, 30]], met: [[12.2, 9.1]] }, addLabel: 'Add a roof section', hint: 'Measure the flat footprint under each roof section. Length runs along the eaves.' },
      { group: 'Roof', id: 'pitch', label: 'Roof pitch', type: 'select', def: '6', opts: PITCH },
      { group: 'Roof', id: 'style', label: 'Roof style', type: 'select', def: 'gable', opts: [['gable', 'Gable (two slopes, rakes at the ends)'], ['hip', 'Hip (slopes on all four sides)']] },
      { group: 'Materials', id: 'waste', label: 'Waste', type: 'select', def: '10', opts: [['10', '10% (simple gable)'], ['15', '15% (hip, valleys, dormers)'], ['5', '5% (very plain roof)']] },
      { group: 'Materials', id: 'bps', label: 'Bundles per square', type: 'select', def: '3', opts: [['3', '3 (most architectural and 3-tab)'], ['4', '4 (heavy designer shingles)'], ['5', '5 (heavy designer shingles)']] },
      { group: 'Materials', id: 'under', label: 'Underlayment roll', type: 'select', def: '1000', opts: [['1000', 'Synthetic, 1,000 sq ft per roll'], ['400', '15 lb felt, about 400 sq ft per roll'], ['200', '30 lb felt, about 200 sq ft per roll']] }
    ],
    compute: function (v, f) {
      var plan = 0, drip = 0, pf = Math.sqrt(1 + Math.pow(+v.pitch / 12, 2));
      (v.secs || []).forEach(function (r) {
        var a = Math.max(0, r.a), b = Math.max(0, r.b);
        plan += a * b;
        drip += v.style === 'hip' ? 2 * (a + b) : 2 * a + 2 * b * pf;
      });
      if (!plan) return { error: 'Enter the length and width of at least one roof section.' };
      var roof = plan * pf, cover = roof * (1 + v.waste / 100), squares = cover / 100;
      var bundles = up(squares * +v.bps), rolls = up(roof / +v.under), pieces = up(drip / 10);
      return {
        main: { label: 'Shingles to buy', value: num(bundles) + ' bundles', sub: num(squares, 2) + ' squares, including ' + v.waste + '% waste' },
        rows: [['Footprint (flat plan)', f.area(plan)], ['Pitch factor', num(pf, 3)], ['Roof surface area', f.area(roof)], ['Underlayment', num(rolls) + ' ' + plural(rolls, 'roll')], ['Drip edge', f.len(drip) + ', ' + num(pieces) + ' pieces of 10 ft (3 m)'], ['Squares to cover', num(squares, 2), 'total']],
        note: 'A square is 100 sq ft of roof. Ridge cap, starter strip, nails and flashing are extra. Check the coverage printed on your shingle bundle.'
      };
    }
  };

  var ROOF_MAT = { arch: [100, 250, 'Architectural shingles'], tab: [80, 130, '3-tab shingles'], metal: [100, 800, 'Metal'], tile: [300, 2500, 'Tile'], slate: [600, 1600, 'Slate'] };
  CALCS['roof-cost'] = {
    title: 'Roof replacement cost estimator', icon: 'roofcost',
    fields: [
      { id: 'area', label: 'Roof surface area', fam: 'area', def: { imp: 1700, met: 158 }, hint: 'The sloped area, not the floor area. 1 square = 100 sq ft.' },
      { id: 'mat', label: 'Roofing material', type: 'select', def: 'arch', opts: [['arch', 'Architectural shingles'], ['tab', '3-tab shingles'], ['metal', 'Metal'], ['tile', 'Tile'], ['slate', 'Slate']] },
      { id: 'layers', label: 'Old roof to remove', type: 'select', def: '1', opts: [['1', 'One layer'], ['2', 'Two layers'], ['0', 'None (roof-over)']] },
      { id: 'steep', label: 'Pitch', type: 'select', def: 'no', opts: [['no', 'Up to 7/12'], ['yes', 'Steeper than 7/12']] },
      { id: 'extras', label: 'Extras (decking, vents, permit)', type: 'money', def: 0, min: 0, hint: 'Often $400 to $1,200 on a mid-size job' }
    ],
    compute: function (v, f) {
      var m = ROOF_MAT[v.mat] || ROOF_MAT.arch, sq = v.area / 100, L = +v.layers;
      var lo = 100 * L + m[0] + 200, hi = 300 * L + m[1] + 350;
      if (v.steep === 'yes') { lo *= 1.15; hi *= 1.5; }
      var tLo = lo * sq + v.extras, tHi = hi * sq + v.extras, tMid = (lo + hi) / 2 * sq + v.extras;
      return {
        main: { label: 'Typical installed price', value: f.money(tMid, 0), sub: 'Range ' + f.money(tLo, 0) + ' to ' + f.money(tHi, 0) },
        rows: [['Roof size', num(sq, 1) + ' squares'], ['Installed price per square', f.money(lo, 0) + ' to ' + f.money(hi, 0)], ['Per sq ft of roof', f.money(lo / 100) + ' to ' + f.money(hi / 100)], ['Material, per square', '$' + num(m[0]) + ' to $' + num(m[1])], ['Labor, per square', '$200 to $350'], ['Tear-off, per layer per square', L ? '$100 to $300' : 'None'], v.steep === 'yes' ? ['Steep roof', '+15% to +50%'] : null, v.extras ? ['Extras', f.money(v.extras, 0)] : null],
        note: 'Per-square figures are 2026 US averages from HomeGuide, with the steep-roof premium from Angi. Metal, tile and slate need specialist crews, so their labor often runs above the shingle labor used here.'
      };
    }
  };

  /* ----- soil: topsoil and raised beds ----- */
  var SOIL_BAG = { imp: [['1.5', '1.5 cu ft'], ['1', '1 cu ft'], ['0.75', '0.75 cu ft'], ['2', '2 cu ft']], met: [['50', '50 L'], ['40', '40 L'], ['25', '25 L'], ['70', '70 L']] };
  var SETTLE = [['10', '10% (loose soil settles)'], ['0', 'None'], ['15', '15%']];
  function soil(v, f, rows, depthIn) {
    var area = rowsArea(rows);
    if (!area) return null;
    var ft3 = area * depthIn / 12, buy = ft3 * (1 + v.settle / 100);
    var bagFt3 = f.u === 'met' ? +v.bag / 1000 * M3_FT3 : +v.bag;
    var bags = up(buy / bagFt3);
    var orderYd = f.u === 'met' ? upStep(buy / M3_FT3, 0.25) * M3_FT3 / YD3_FT3 : upStep(buy / YD3_FT3, 0.25);
    return { area: area, ft3: ft3, buy: buy, bags: bags, bulkCost: orderYd * v.bulk, bagCost: bags * v.bagPrice, bagLabel: f.u === 'met' ? v.bag + ' L' : v.bag + ' cu ft' };
  }
  CALCS.topsoil = {
    title: 'Topsoil calculator', icon: 'soil',
    fields: [
      { group: 'Area', id: 'areas', type: 'rects', label: 'Area', shapes: true, def: { imp: [['rect', 20, 25]], met: [['rect', 6.1, 7.6]] }, addLabel: 'Add another area' },
      { group: 'Soil', id: 'depth', label: 'Depth', fam: 'depth', def: { imp: 4, met: 10 }, hint: 'New lawn: 4 to 6 in. Beds: 6 to 8 in. Topdressing: 0.5 to 1 in.' },
      { group: 'Soil', id: 'settle', label: 'Extra for settling', type: 'select', def: '10', opts: SETTLE },
      { group: 'Soil', id: 'bag', label: 'Bag size', type: 'select', def: { imp: '1.5', met: '50' }, opts: SOIL_BAG },
      { group: 'Prices', id: 'bulk', label: 'Bulk price', fam: 'perYd3', money: true, def: { imp: 30, met: 40 }, hint: 'HomeGuide: $10 to $50 per cu yd before delivery' },
      { group: 'Prices', id: 'bagPrice', label: 'Price per bag', type: 'money', def: 5 }
    ],
    compute: function (v, f) {
      var s = soil(v, f, v.areas, v.depth);
      if (!s) return { error: 'Enter the size of the area you are covering.' };
      return {
        main: { label: 'Topsoil to order', value: f.vol(s.buy), sub: 'Order ' + orderVol(f, s.buy) + ', or ' + num(s.bags) + ' bags of ' + s.bagLabel },
        rows: [['Area', f.area(s.area)], ['Volume before settling', f.vol(s.ft3)], ['Bulk cost (before delivery)', f.money(s.bulkCost, 0)], ['Bagged cost', f.money(s.bagCost, 0)], ['Cheaper here', s.bagCost > s.bulkCost ? 'Bulk delivery' : 'Bags', 'total']],
        note: 'Bulk orders are rounded up to the next quarter yard. Delivery is usually a flat fee per load, so get the amount right in one order.'
      };
    }
  };
  CALCS['raised-bed'] = {
    title: 'Raised bed soil calculator', icon: 'bed',
    fields: [
      { group: 'Beds', id: 'beds', type: 'rects', label: 'Bed', def: { imp: [[8, 4], [8, 4]], met: [[2.4, 1.2], [2.4, 1.2]] }, addLabel: 'Add another bed', hint: 'Measure the inside of each bed.' },
      { group: 'Soil', id: 'depth', label: 'Fill depth', fam: 'depth', def: { imp: 12, met: 30 }, hint: 'The soil depth, not the board height' },
      { group: 'Soil', id: 'settle', label: 'Extra for settling', type: 'select', def: '10', opts: SETTLE },
      { group: 'Soil', id: 'bag', label: 'Bag size', type: 'select', def: { imp: '1.5', met: '50' }, opts: SOIL_BAG },
      { group: 'Prices', id: 'bagPrice', label: 'Price per bag', type: 'money', def: 9 },
      { group: 'Prices', id: 'bulk', label: 'Bulk blend price', fam: 'perYd3', money: true, def: { imp: 50, met: 65 } }
    ],
    compute: function (v, f) {
      var s = soil(v, f, v.beds, v.depth);
      if (!s) return { error: 'Enter the length and width of at least one bed.' };
      return {
        main: { label: 'Soil to buy', value: cuft(f, s.buy), sub: num(s.bags) + ' bags of ' + s.bagLabel + ', or ' + f.vol(s.buy) + ' in bulk' },
        rows: [['Bed area', f.area(s.area)], ['Bed volume before settling', cuft(f, s.ft3) + ' (' + f.vol(s.ft3) + ')'], ['Bulk order, quarter steps', orderVol(f, s.buy)], ['Bagged cost', f.money(s.bagCost, 0)], ['Bulk cost (before delivery)', f.money(s.bulkCost, 0), 'total']],
        note: 'Ask the yard for a raised bed blend, not fill dirt. Past about one cubic yard in total, bulk usually costs less, even with delivery.'
      };
    }
  };

  /* ----- sod ----- */
  CALCS.sod = {
    title: 'Sod calculator', icon: 'sod',
    fields: [
      { group: 'Lawn', id: 'areas', type: 'rects', label: 'Area', shapes: true, def: { imp: [['rect', 30, 50]], met: [['rect', 9.1, 15.2]] }, addLabel: 'Add another lawn area' },
      { group: 'Lawn', id: 'waste', label: 'Waste', type: 'select', def: '10', opts: [['5', '5% (plain rectangle)'], ['10', '10% (curved beds)'], ['15', '15% (odd shapes)']] },
      { group: 'Sod', id: 'pallet', label: 'Pallet coverage', fam: 'area', def: { imp: 450, met: 42 }, hint: 'Ask your farm. Usually 400 to 500 sq ft.' },
      { group: 'Sod', id: 'roll', label: 'Roll coverage', fam: 'area', def: { imp: 10, met: 0.93 }, hint: 'A standard 2 x 5 ft roll is 10 sq ft' },
      { group: 'Sod', id: 'price', label: 'Sod price', fam: 'perArea', money: true, def: { imp: 0.6, met: 6.5 }, hint: 'HomeGuide: $0.30 to $0.80 per sq ft' }
    ],
    compute: function (v, f) {
      var area = rowsArea(v.areas);
      if (!area) return { error: 'Enter the size of your lawn.' };
      var need = area * (1 + v.waste / 100);
      var pallets = up(need / v.pallet), rolls = up(need / v.roll);
      return {
        main: { label: 'Sod to order', value: num(pallets) + ' ' + plural(pallets, 'pallet'), sub: f.area(need) + ', or ' + num(rolls) + ' rolls' },
        rows: [['Lawn area', f.area(area)], ['With ' + v.waste + '% waste', f.area(need)], ['Sod cost at your price', f.money(need * v.price, 0)], ['Range at $0.30 to $0.80 per sq ft', f.money(need * 0.3, 0) + ' to ' + f.money(need * 0.8, 0)], ['Pro install, $1 to $2 per sq ft', f.money(area, 0) + ' to ' + f.money(area * 2, 0), 'total']],
        note: 'Confirm the pallet size before you order. A farm that cuts 400 sq ft pallets can change your count by a full pallet.'
      };
    }
  };

  /* ----- carpet ----- */
  CALCS.carpet = {
    title: 'Carpet calculator', icon: 'carpet',
    fields: [
      { group: 'Rooms', id: 'rooms', type: 'rects', label: 'Room', def: { imp: [[12, 12], [14, 12]], met: [[3.7, 3.7], [4.3, 3.7]] }, addLabel: 'Add another room' },
      { group: 'Carpet', id: 'rw', label: 'Roll width', type: 'select', def: { imp: '12', met: '4' }, opts: { imp: [['12', '12 ft'], ['13.5', '13.5 ft'], ['15', '15 ft']], met: [['3.66', '3.66 m (12 ft)'], ['4', '4 m'], ['5', '5 m']] } },
      { group: 'Carpet', id: 'pile', label: 'Pile direction', type: 'select', def: 'auto', opts: [['auto', 'Fewest cuts (pile may turn between rooms)'], ['length', 'Pile runs along the length I entered']] },
      { group: 'Prices', id: 'price', label: 'Carpet price', fam: 'perSqyd', money: true, def: { imp: 27, met: 32 } },
      { group: 'Prices', id: 'pad', label: 'Pad price', fam: 'perSqyd', money: true, def: { imp: 4.5, met: 5.4 }, min: 0 },
      { group: 'Prices', id: 'labor', label: 'Installation', fam: 'perArea', money: true, def: { imp: 1, met: 10.75 }, min: 0 }
    ],
    compute: function (v, f) {
      var rw = f.u === 'met' ? +v.rw * 3.28084 : +v.rw;
      var net = 0, lin = 0, seams = 0;
      (v.rooms || []).forEach(function (r) {
        var a = Math.max(0, r.a), b = Math.max(0, r.b);
        if (!a || !b) return;
        net += a * b;
        var nA = up(b / rw), linA = nA * a, nB = up(a / rw), linB = nB * b;
        var useA = v.pile === 'length' || linA < linB - 1e-9 || (Math.abs(linA - linB) < 1e-9 && nA <= nB);
        lin += useA ? linA : linB; seams += (useA ? nA : nB) - 1;
      });
      if (!net) return { error: 'Enter the length and width of at least one room.' };
      var ordered = rw * lin;
      var buy, buyTxt, cost, padN;
      if (f.u === 'met') {
        buy = up(ordered / SQM); padN = up(net / SQM);
        buyTxt = num(buy) + ' m²';
        cost = (buy + 0) * v.price / 0.836127 + padN * v.pad / 0.836127 + net * v.labor;
      } else {
        buy = up(ordered / 9); padN = up(net / 9);
        buyTxt = num(buy) + ' sq yd';
        cost = buy * v.price + padN * v.pad + net * v.labor;
      }
      return {
        main: { label: 'Carpet to order', value: buyTxt, sub: f.len(lin) + ' off a ' + (f.u === 'met' ? v.rw + ' m' : v.rw + ' ft') + ' roll' },
        rows: [['Floor area', f.area(net)], ['Area you pay for', f.area(ordered)], ['Seams inside rooms', num(seams)], ['Pad', f.u === 'met' ? num(padN) + ' m²' : num(padN) + ' sq yd'], ['Carpet, pad and install', f.money(cost, 0)], ['Per ' + (f.u === 'met' ? 'm²' : 'sq ft') + ' of floor', f.money(f.areaRate(cost / net)), 'total']],
        note: 'Each room is cut from full-width strips. Offcuts can sometimes fill closets, so ask the installer to plan the cuts. Removal of old carpet is extra.'
      };
    }
  };

  /* ----- cabinet painting cost ----- */
  CALCS['cabinet-cost'] = {
    title: 'Cabinet painting cost calculator', icon: 'cabinet',
    fields: [
      { group: 'Kitchen', id: 'doors', label: 'Cabinet doors', type: 'int', def: 20, min: 0 },
      { group: 'Kitchen', id: 'drawers', label: 'Drawer fronts', type: 'int', def: 8, min: 0 },
      { group: 'Kitchen', id: 'lf', label: 'Cabinet run (linear)', fam: 'len', def: { imp: 30, met: 9.1 }, hint: 'Base, wall and island runs added together' },
      { group: 'Kitchen', id: 'box', label: 'Boxes and frames to paint', fam: 'area', def: { imp: 66, met: 6.1 }, min: 0, hint: 'Face frames, exposed sides, island back. About 2 sq ft per foot of cabinets.' },
      { group: 'Doing it yourself', id: 'cov', label: 'Paint coverage', fam: 'cov', def: { imp: 400, met: 9.8 }, hint: 'Cabinet enamel: 400 to 500 sq ft per gallon' },
      { group: 'Doing it yourself', id: 'paint', label: 'Cabinet paint price', fam: 'perVol', money: true, def: { imp: 60, met: 16 } },
      { group: 'Doing it yourself', id: 'primer', label: 'Primer price', fam: 'perVol', money: true, def: { imp: 45, met: 12 } },
      { group: 'Doing it yourself', id: 'supplies', label: 'Brushes, rollers, sandpaper, degreaser', type: 'money', def: 93 }
    ],
    compute: function (v, f) {
      var area = v.doors * 6.25 + v.drawers * 1.17 + v.box;
      if (!area) return { error: 'Enter the number of doors and drawer fronts.' };
      var primerGal = area / v.cov, paintGal = area * 2 / v.cov * 1.1;
      var pb = buyCans(f, primerGal), qb = buyCans(f, paintGal);
      var diy = qb.gal * v.paint + pb.gal * v.primer + v.supplies;
      var pieceLo = v.doors * 70 + v.drawers * 30, pieceHi = v.doors * 125 + v.drawers * 110;
      return {
        main: { label: 'Pro price, by the piece', value: f.money(pieceLo, 0) + ' to ' + f.money(pieceHi, 0), sub: 'Doors $70 to $125, drawer fronts $30 to $110 (HomeGuide). Boxes and masking can add more.' },
        rows: [['Pro price, by the linear foot ($30 to $70)', f.money(v.lf * 30, 0) + ' to ' + f.money(v.lf * 70, 0)], ['Surface to paint', f.area(area)], ['Primer, 1 coat', pb.text], ['Paint, 2 coats + 10%', qb.text], ['Do it yourself, materials', f.money(diy, 0), 'total']],
        note: 'Door area assumes 15 x 30 in doors painted on both sides. A pro quote far under the per-piece range usually means less prep.'
      };
    }
  };

  /* ----- stain: deck and fence ----- */
  CALCS['stain-deck'] = {
    title: 'Deck stain calculator', icon: 'brush',
    fields: [
      { group: 'Deck', id: 'decks', type: 'rects', label: 'Deck area', def: { imp: [[20, 16]], met: [[6.1, 4.9]] }, addLabel: 'Add another area' },
      { group: 'Deck', id: 'extra', label: 'Railings and steps', fam: 'area', def: { imp: 0, met: 0 }, min: 0, hint: 'Optional. Rough guide: a 3 ft railing adds about 6 sq ft per foot, both sides.' },
      { group: 'Stain', id: 'cond', label: 'Wood condition', type: 'select', def: '250', opts: [['250', 'Smooth and sound (250 sq ft/gal first coat)'], ['200', 'Weathered or dry (200)'], ['150', 'Rough sawn or very dry (150)']] },
      { group: 'Stain', id: 'coats', label: 'Coats', type: 'select', def: '2', opts: [['2', '2 thin coats (second coat goes twice as far)'], ['1', 'One-coat product']] },
      { group: 'Stain', id: 'price', label: 'Stain price', fam: 'perVol', money: true, def: { imp: 40, met: 11 }, hint: 'Angi: $30 to $50 per gallon' }
    ],
    compute: function (v, f) {
      var area = rowsArea(v.decks) + v.extra;
      if (!area) return { error: 'Enter the size of your deck.' };
      var c1 = area / +v.cond, c2 = v.coats === '2' ? area / (2 * +v.cond) : 0, gal = c1 + c2;
      var b = buyCans(f, gal);
      return {
        main: { label: 'Stain to buy', value: f.u === 'met' ? num(gal * GAL_L, 1) + ' L' : num(gal, 2) + ' gal', sub: 'Buy ' + b.text },
        rows: [['Area to stain', f.area(area)], ['First coat', f.u === 'met' ? num(c1 * GAL_L, 1) + ' L' : num(c1, 2) + ' gal'], v.coats === '2' ? ['Second coat', f.u === 'met' ? num(c2 * GAL_L, 1) + ' L' : num(c2, 2) + ' gal'] : null, ['Stain cost', f.money(b.gal * v.price, 0), 'total']],
        note: 'Rates use the low end of the Behr semi-transparent label, so you should not run short. Check the coverage on your can.'
      };
    }
  };
  CALCS['stain-fence'] = {
    title: 'Fence stain calculator', icon: 'brush',
    fields: [
      { group: 'Fence', id: 'length', label: 'Fence length', fam: 'len', def: { imp: 100, met: 30.5 }, hint: 'Include gates' },
      { group: 'Fence', id: 'height', label: 'Fence height', fam: 'len', def: { imp: 6, met: 1.8 } },
      { group: 'Fence', id: 'sides', label: 'Sides to stain', type: 'select', def: '2', opts: [['2', 'Both sides'], ['1', 'One side']] },
      { group: 'Fence', id: 'style', label: 'Fence style', type: 'select', def: '1', opts: [['1', 'Solid privacy fence'], ['0.73', 'Spaced pickets (about 73% wood)']] },
      { group: 'Stain', id: 'cond', label: 'Wood condition', type: 'select', def: '200', opts: [['350', 'Smooth new wood (350 sq ft/gal)'], ['250', 'Average, sound boards (250)'], ['200', 'Rough sawn or dry old wood (200)']] },
      { group: 'Stain', id: 'coats', label: 'Coats', type: 'select', def: '2', opts: [['2', '2 coats'], ['1', '1 coat']] },
      { group: 'Stain', id: 'price', label: 'Stain price', fam: 'perVol', money: true, def: { imp: 40, met: 11 } }
    ],
    compute: function (v, f) {
      var wood = v.length * v.height * +v.sides * +v.style, coatArea = wood * +v.coats;
      var gal = coatArea / +v.cond, b = buyCans(f, gal);
      return {
        main: { label: 'Stain to buy', value: f.u === 'met' ? num(gal * GAL_L, 1) + ' L' : num(gal, 1) + ' gal', sub: 'Buy ' + b.text },
        rows: [['Wood surface', f.area(wood)], ['Area to cover, all coats', f.area(coatArea)], ['Coverage used', f.u === 'met' ? num(+v.cond / SQM / GAL_L, 1) + ' m²/L' : v.cond + ' sq ft per gallon'], ['Stain cost', f.money(b.gal * v.price, 0), 'total']],
        note: 'Coverage follows the Behr and Sherwin-Williams labels (200 to 400 sq ft per gallon). Mix pails of the same color together so the shade stays even.'
      };
    }
  };

  /* ----- masonry ----- */
  var WALL_BLOCK = [['18x8', '18 x 8 in face (Allan Block Classic, Keystone Compac III)'], ['16x6', '16 x 6 in face (Keystone Legacy Stone)'], ['18x4', '18 x 4 in face (Allan Block Lite Stone)']];
  CALCS['wall-blocks'] = {
    title: 'Retaining wall block calculator', icon: 'wallblock',
    fields: [
      { group: 'Wall', id: 'length', label: 'Wall length', fam: 'len', def: { imp: 30, met: 9.1 } },
      { group: 'Wall', id: 'above', label: 'Height above ground', fam: 'depth', def: { imp: 32, met: 81 } },
      { group: 'Wall', id: 'buried', label: 'Courses buried', type: 'int', def: 1, min: 0, hint: 'Bury at least one course' },
      { group: 'Blocks', id: 'block', label: 'Block face size', type: 'select', def: '18x8', opts: WALL_BLOCK },
      { group: 'Blocks', id: 'caps', label: 'Cap row', type: 'select', def: 'yes', opts: [['yes', 'Yes'], ['no', 'No caps']] },
      { group: 'Blocks', id: 'waste', label: 'Extra for cuts and breakage', type: 'select', def: '10', opts: [['10', '10%'], ['5', '5%'], ['15', '15%']] },
      { group: 'Base and drainage', id: 'base', label: 'Base depth', fam: 'depth', def: { imp: 6, met: 15 }, hint: 'Allan Block: at least 6 in' },
      { group: 'Base and drainage', id: 'trench', label: 'Trench width', fam: 'depth', def: { imp: 24, met: 60 } }
    ],
    compute: function (v, f) {
      var p = v.block.split('x'), bl = +p[0], bh = +p[1];
      var total = v.above + v.buried * bh, courses = up(total / bh), perCourse = up(v.length * 12 / bl);
      var blocks = courses * perCourse, buy = up(blocks * (1 + v.waste / 100));
      var caps = v.caps === 'yes' ? up(perCourse * (1 + v.waste / 100)) : 0;
      var wallFt = courses * bh / 12;
      var baseFt3 = v.length * (v.trench / 12) * (v.base / 12), drainFt3 = v.length * 1 * wallFt;
      return {
        main: { label: 'Blocks to buy', value: num(buy) + ' blocks', sub: num(blocks) + ' before ' + v.waste + '% extra' + (caps ? ', plus ' + num(caps) + ' caps' : '') },
        rows: [['Courses (including buried)', num(courses)], ['Blocks per course', num(perCourse)], ['Wall height, footing to top', inch(f, courses * bh, 0)], ['Base gravel', f.vol(baseFt3) + ', order ' + orderVol(f, baseFt3)], ['Drainage stone (12 in behind the wall)', f.vol(drainFt3) + ', order ' + orderVol(f, drainFt3)], ['Caps', caps ? num(caps) : 'None', 'total']],
        note: courses * bh > 48 ? 'This wall is over 4 ft from footing to top. Most places need a permit and an engineered design at that height.' : 'Walls up to 4 ft (some towns: 3 ft) usually need no engineer. Check your local rules, and keep slopes and driveways back from the top.'
      };
    }
  };

  CALCS.brick = {
    title: 'Brick calculator', icon: 'brick',
    fields: [
      { group: 'Wall', id: 'length', label: 'Wall length', fam: 'len', def: { imp: 20, met: 6.1 } },
      { group: 'Wall', id: 'height', label: 'Wall height', fam: 'len', def: { imp: 8, met: 2.4 } },
      { group: 'Wall', id: 'open', label: 'Doors and windows', fam: 'area', def: { imp: 20, met: 1.9 }, min: 0, hint: 'Total area of openings' },
      { group: 'Brick', id: 'rate', label: 'Brick size', type: 'select', def: '6.75', opts: { imp: [['6.75', 'Modular (6.75 per sq ft)'], ['5.5', 'Queen (5.50 per sq ft)'], ['4.5', 'Norman (4.50 per sq ft)'], ['3', 'Utility (3.00 per sq ft)'], ['5.574', 'UK standard 215 x 65 mm (5.57 per sq ft)']], met: [['6.75', 'Modular (72.7 per m²)'], ['5.5', 'Queen (59.2 per m²)'], ['4.5', 'Norman (48.4 per m²)'], ['3', 'Utility (32.3 per m²)'], ['5.574', 'UK standard 215 x 65 mm (60 per m²)']] }, hint: '3/8 in (10 mm) mortar joints' },
      { group: 'Brick', id: 'waste', label: 'Waste', type: 'select', def: '10', opts: [['10', '10%'], ['5', '5% (BIA minimum)'], ['15', '15%']] },
      { group: 'Mortar', id: 'perBag', label: 'Bricks laid per 80 lb (36 kg) bag', type: 'int', def: 35, min: 1, hint: 'Sakrete Type N: 35. Quikrete Mortar Mix: up to 37.' }
    ],
    compute: function (v, f) {
      var net = v.length * v.height - v.open;
      if (net <= 0) return { error: 'The openings are bigger than the wall. Check the sizes.' };
      var bricks = net * +v.rate, buy = up(bricks * (1 + v.waste / 100)), bags = up(buy / v.perBag);
      return {
        main: { label: 'Bricks to buy', value: num(buy) + ' bricks', sub: num(bags) + ' bags of mortar' },
        rows: [['Net wall area', f.area(net)], ['Bricks before waste', num(bricks, 1)], ['With ' + v.waste + '% waste', num(buy)], ['Mortar, 80 lb bags', num(bags), 'total']],
        note: 'Brick counts per square foot are from Brick Industry Association Technical Note 10, single wythe in running bond.'
      };
    }
  };

  CALCS.cmu = {
    title: 'Concrete block calculator', icon: 'block',
    fields: [
      { group: 'Wall', id: 'length', label: 'Wall length', fam: 'len', def: { imp: 24, met: 7.3 } },
      { group: 'Wall', id: 'height', label: 'Wall height', fam: 'len', def: { imp: 8, met: 2.4 } },
      { group: 'Wall', id: 'open', label: 'Doors and windows', fam: 'area', def: { imp: 21, met: 2 }, min: 0 },
      { group: 'Block', id: 'rate', label: 'Block face', type: 'select', def: '1.125', opts: [['1.125', '8 x 16 in (standard block)'], ['2.25', '8 x 8 in or 4 x 16 in']] },
      { group: 'Block', id: 'waste', label: 'Waste', type: 'select', def: '10', opts: [['10', '10%'], ['5', '5%']] },
      { group: 'Block', id: 'perBag', label: 'Blocks per 80 lb mortar bag', type: 'int', def: 13, min: 1, hint: 'Quikrete Mortar Mix: 13 standard blocks' }
    ],
    compute: function (v, f) {
      var net = v.length * v.height - v.open;
      if (net <= 0) return { error: 'The openings are bigger than the wall. Check the sizes.' };
      var blocks = net * +v.rate, buy = up(blocks * (1 + v.waste / 100));
      return {
        main: { label: 'Blocks to buy', value: num(buy) + ' blocks', sub: num(up(buy / v.perBag)) + ' bags of mortar' },
        rows: [['Net wall area', f.area(net)], ['Blocks before waste', num(blocks, 1)], ['Mortar, 80 lb bags', num(up(buy / v.perBag))], ['Core fill if every core is filled', num(up(buy / 110)) + ' × 3,000 lb bulk bags of grout', 'total']],
        note: 'Nominal block sizes already include the 3/8 in mortar joint. Most walls only fill the cores that hold rebar, so follow your plans.'
      };
    }
  };

  /* ----- stairs ----- */
  CALCS.stairs = {
    title: 'Stair calculator', icon: 'stairs',
    fields: [
      { id: 'rise', label: 'Total rise (floor to floor)', fam: 'small', def: { imp: 108, met: 2743 }, hint: 'Finished floor to finished floor' },
      { id: 'target', label: 'Target riser height', fam: 'small', def: { imp: 7.5, met: 190 }, hint: 'IRC maximum: 7 3/4 in (196 mm)' },
      { id: 'tread', label: 'Tread depth', fam: 'small', def: { imp: 10.5, met: 267 }, hint: 'IRC minimum: 10 in (254 mm)' },
      { id: 'limit', label: 'Space for the run', fam: 'small', def: { imp: 150, met: 3810 }, min: 0, hint: '0 if there is no limit' }
    ],
    compute: function (v, f) {
      var risers = up(v.rise / v.target), riser = v.rise / risers, treads = risers - 1;
      var run = treads * v.tread, stringer = Math.sqrt(v.rise * v.rise + run * run);
      var stock = up(stringer / 12 / 2) * 2; if (stock < 8) stock = 8;
      var okR = riser <= 7.75 + 1e-9, okT = v.tread >= 10 - 1e-9;
      var fit = !v.limit ? 'No limit set' : run <= v.limit + 1e-9 ? 'Fits, ' + inch(f, v.limit - run, 1) + ' to spare' : 'Too long by ' + inch(f, run - v.limit, 1);
      return {
        main: { label: 'Your stairs', value: num(risers) + ' risers at ' + inch(f, riser), sub: num(treads) + ' treads at ' + inch(f, v.tread) + ', total run ' + inch(f, run, 1) + (f.u === 'met' ? '' : ' (' + ftIn(run) + ')') },
        rows: [['Riser height check (IRC max 7 3/4 in)', okR ? 'Passes' : 'Too tall: lower the target riser'], ['Tread depth check (IRC min 10 in)', okT ? 'Passes' : 'Too shallow'], ['Run', fit], ['Stringer length', inch(f, stringer, 1) + ' (' + f.len(stringer / 12) + ')'], ['Board to buy per stringer', stringer / 12 > 20 ? 'Over 20 ft: plan a landing' : f.u === 'met' ? num(stock * 0.3048, 1) + ' m' : stock + ' ft', 'total']],
        note: 'Cut every riser to the actual height, not the target. Also plan 6 ft 8 in of headroom and a 36 in width (IRC R311.7). Your local code may differ.'
      };
    }
  };

  /* ----- insulation ----- */
  CALCS.insulation = {
    title: 'Insulation calculator', icon: 'insulation',
    fields: [
      { group: 'Space', id: 'areas', type: 'rects', label: 'Section', def: { imp: [[40, 25]], met: [[12.2, 7.6]] }, addLabel: 'Add another section' },
      { group: 'Insulation', id: 'kind', label: 'Type', type: 'select', def: 'blown', opts: [['blown', 'Blown-in (loose fill)'], ['batt', 'Batts or rolls']] },
      { group: 'Insulation', id: 'chart', label: 'Product and R-value', type: 'select', def: '26.4', opts: [['26.4', 'Knauf blown-in, R-49 (26.4 bags per 1,000 sq ft)'], ['20', 'Knauf blown-in, R-38 (20.0 bags)'], ['15.3', 'Knauf blown-in, R-30 (15.3 bags)'], ['22.2', 'Owens Corning L77, R-49 (22.2 bags)'], ['28', 'Owens Corning L77, R-60 (28.0 bags)']], show: function (v) { return v.kind !== 'batt'; } },
      { group: 'Insulation', id: 'cov', label: 'Coverage per bag', fam: 'area', def: { imp: 110.42, met: 10.26 }, hint: 'From the label. Knauf R-19 bag: 110.42 sq ft', show: function (v) { return v.kind === 'batt'; } },
      { group: 'Insulation', id: 'layers', label: 'Layers', type: 'select', def: '1', opts: [['1', '1 layer'], ['2', '2 crossed layers']], show: function (v) { return v.kind === 'batt'; } },
      { group: 'Price', id: 'price', label: 'Price per bag', type: 'money', def: 0, min: 0, hint: 'Optional. Enter your store price for a total.' }
    ],
    compute: function (v, f) {
      var area = rowsArea(v.areas);
      if (!area) return { error: 'Enter the size of the space.' };
      var bags, label;
      if (v.kind === 'batt') { bags = up(area / v.cov) * +v.layers; label = num(up(area / v.cov)) + ' per layer'; }
      else { bags = up(area / 1000 * +v.chart); label = num(area / 1000 * +v.chart, 1) + ' bags before rounding'; }
      return {
        main: { label: 'Bags to buy', value: num(bags) + ' bags', sub: label },
        rows: [['Area', f.area(area)], v.price ? ['Material cost', f.money(bags * v.price, 0), 'total'] : null],
        note: v.kind === 'batt' ? 'R-19 batts fit a 2 x 6 wall or a floor. Two crossed layers give about R-38, so attics usually get blown-in.' : 'Energy Star suggests R-49 to R-60 for an uninsulated attic in zones 5 to 8, and R-30 to R-49 in zone 1. Blow to depth markers on the joists.'
      };
    }
  };

  /* ----- lawn ----- */
  var SEED = { tf: ['Tall fescue', 6, 8, 3, 4], kbg: ['Kentucky bluegrass', 2, 3, 1, 1.5], prg: ['Perennial ryegrass', 4, 5, 4, 6], ff: ['Fine fescues', 4, 5, 2, 2.5], mix: ['Bluegrass and ryegrass mix', 2, 3, 1, 1.5], berm: ['Bermudagrass', 1, 2, 0.5, 1] };
  CALCS['grass-seed'] = {
    title: 'Grass seed calculator', icon: 'seed',
    fields: [
      { group: 'Lawn', id: 'areas', type: 'rects', label: 'Area', shapes: true, def: { imp: [['rect', 50, 100]], met: [['rect', 15.2, 30.5]] }, addLabel: 'Add another area' },
      { group: 'Seed', id: 'grass', label: 'Grass type', type: 'select', def: 'tf', opts: Object.keys(SEED).map(function (k) { return [k, SEED[k][0]]; }) },
      { group: 'Seed', id: 'job', label: 'Job', type: 'select', def: 'new', opts: [['new', 'New lawn on bare soil'], ['over', 'Overseeding an existing lawn']] },
      { group: 'Seed', id: 'bag', label: 'Bag size', type: 'select', def: { imp: '20', met: '10' }, opts: { imp: [['20', '20 lb'], ['10', '10 lb'], ['7', '7 lb'], ['3', '3 lb'], ['50', '50 lb']], met: [['10', '10 kg'], ['5', '5 kg'], ['2', '2 kg'], ['1', '1 kg']] } }
    ],
    compute: function (v, f) {
      var area = rowsArea(v.areas);
      if (!area) return { error: 'Enter the size of your lawn.' };
      var s = SEED[v.grass] || SEED.tf, lo = v.job === 'over' ? s[3] : s[1], hi = v.job === 'over' ? s[4] : s[2];
      var k = area / 1000, lb = k * (lo + hi) / 2;
      var bagLb = f.u === 'met' ? +v.bag * KG_LB : +v.bag, bags = up(lb / bagLb);
      return {
        main: { label: 'Seed needed', value: weightTxt(f, lb), sub: 'Buy ' + bags + ' × ' + (f.u === 'met' ? v.bag + ' kg' : v.bag + ' lb') + ' ' + plural(bags, 'bag') + ' (' + weightTxt(f, bags * bagLb, 0) + ')' },
        rows: [['Lawn area', f.area(area)], ['Rate used (middle of range)', f.u === 'met' ? num((lo + hi) / 2 * 4.8824, 0) + ' g per m²' : num((lo + hi) / 2, 2) + ' lb per 1,000 sq ft'], ['Range for this lawn', weightTxt(f, k * lo) + ' to ' + weightTxt(f, k * hi), 'total']],
        note: 'Rates from Penn State, Kansas State and Nebraska extension guides. Overseeding uses about half the new-lawn rate. If your bag gives a rate for that blend, use it.'
      };
    }
  };

  CALCS.fertilizer = {
    title: 'Lawn fertilizer calculator', icon: 'fertilizer',
    fields: [
      { id: 'area', label: 'Lawn area', fam: 'area', def: { imp: 6000, met: 557 }, hint: 'Leave out the house, driveway and beds' },
      { id: 'n', label: 'Nitrogen to apply', fam: 'nRate', def: { imp: 1, met: 4.88 }, hint: 'Extension guides: no more than 1 lb per 1,000 sq ft (4.9 g/m²) per feeding' },
      { id: 'pct', label: 'Nitrogen on the bag (first number)', type: 'pct', def: 24, min: 1, max: 100, hint: '24-0-6 means 24% nitrogen' },
      { id: 'bag', label: 'Bag weight', fam: 'weight', def: { imp: 15, met: 7 } }
    ],
    compute: function (v, f) {
      var per1000 = v.n / (v.pct / 100), total = per1000 * v.area / 1000, bags = up(total / v.bag);
      return {
        main: { label: 'Fertilizer to spread', value: weightTxt(f, total), sub: 'Buy ' + bags + ' ' + plural(bags, 'bag') + ' of ' + weightTxt(f, v.bag, 0) },
        rows: [['Product per ' + (f.u === 'met' ? '100 m²' : '1,000 sq ft'), f.u === 'met' ? num(per1000 / KG_LB / 92.903 * 100, 2) + ' kg' : num(per1000, 2) + ' lb'], ['Nitrogen in total', weightTxt(f, v.n * v.area / 1000, 2)], ['Spreader setting target', f.u === 'met' ? num(per1000 / KG_LB / 92.903 * 1000, 0) + ' g per m²' : num(per1000, 1) + ' lb per 1,000 sq ft', 'total']],
        note: v.n > 1.0001 ? 'That is more than 1 lb of nitrogen per 1,000 sq ft in one feeding. Extension guides advise splitting it.' : 'Returning clippings to the lawn can cut the nitrogen you need by 25 to 50 percent (Cornell).'
      };
    }
  };

  /* ----- flooring prep ----- */
  CALCS.thinset = {
    title: 'Thinset calculator', icon: 'trowel',
    fields: [
      { id: 'area', label: 'Tile area', fam: 'area', def: { imp: 200, met: 18.6 } },
      { id: 'trowel', label: 'Trowel notch', type: 'select', def: '40', opts: [['85', '1/4 x 1/4 in square (tile under 8 in): 85 sq ft per bag'], ['65', '1/4 x 3/8 in (tile 8 to 15 in): 65 sq ft'], ['40', '1/2 x 1/2 in square (tile over 15 in): 40 sq ft'], ['35', '3/4 in U-notch (large format): 35 sq ft']], hint: 'Coverage per 50 lb bag, low end of the Mapei chart' },
      { id: 'extra', label: 'Extra for cuts and back-buttering', type: 'select', def: '10', opts: [['10', '10%'], ['0', 'None'], ['20', '20% (heavy back-buttering)']] },
      { id: 'bag', label: 'Bag size', type: 'select', def: '50', opts: [['50', '50 lb (22.7 kg)'], ['25', '25 lb (11.3 kg)']] }
    ],
    compute: function (v, f) {
      var bags50 = v.area / +v.trowel * (1 + v.extra / 100), bags = up(bags50 * 50 / +v.bag);
      return {
        main: { label: 'Thinset to buy', value: num(bags) + ' bags', sub: (v.bag === '50' ? '50 lb (22.7 kg)' : '25 lb (11.3 kg)') + ' bags, rounded up' },
        rows: [['Area', f.area(v.area)], ['Bags before extra', num(v.area / +v.trowel * 50 / +v.bag, 2)], ['With ' + v.extra + '% extra', num(bags50 * 50 / +v.bag, 2), 'total']],
        note: 'We always round up from the low end of the maker chart. Running out with half a tile bed open costs more than a spare bag.'
      };
    }
  };

  CALCS['self-leveler'] = {
    title: 'Self-leveling compound calculator', icon: 'leveler',
    fields: [
      { id: 'area', label: 'Floor area', fam: 'area', def: { imp: 240, met: 22.3 } },
      { id: 'depth', label: 'Average depth', fam: 'small', def: { imp: 0.25, met: 6 }, hint: 'The average over the room, not the deepest spot' },
      { id: 'bag', label: 'Bag size', type: 'select', def: '50', opts: [['50', '50 lb'], ['55.1', '25 kg']] },
      { id: 'spare', label: 'Spare bags', type: 'int', def: 1, min: 0 }
    ],
    compute: function (v, f) {
      var ft3 = v.area * v.depth / 12, perBag = +v.bag * 0.01; // 50 lb = 0.5 cu ft (48 sq ft at 1/8 in, Mapei)
      var bags = up(ft3 / perBag);
      return {
        main: { label: 'Bags to buy', value: num(bags + v.spare) + ' bags', sub: num(bags) + ' for the pour + ' + v.spare + ' spare' },
        rows: [['Volume to fill', cuft(f, ft3)], ['Coverage per bag at this depth', f.area(perBag * 12 / v.depth)], ['Coverage per bag at 1/8 in (3 mm)', f.area(perBag * 12 / 0.125), 'total']],
        note: 'Prime the floor first and measure the water for every mix. Coverage halves each time the depth doubles.'
      };
    }
  };

  CALCS.underlayment = {
    title: 'Underlayment calculator', icon: 'underlay',
    fields: [
      { group: 'Rooms', id: 'rooms', type: 'rects', label: 'Room', def: { imp: [[20, 12], [30, 5]], met: [[6.1, 3.7], [9.1, 1.5]] }, addLabel: 'Add another room' },
      { group: 'Roll', id: 'waste', label: 'Waste', type: 'select', def: '10', opts: [['10', '10% (several rooms, halls)'], ['5', '5% (one plain room)'], ['15', '15%']] },
      { group: 'Roll', id: 'roll', label: 'Roll coverage', fam: 'area', def: { imp: 100, met: 9.3 }, hint: 'Common rolls: 100 and 200 sq ft' },
      { group: 'Roll', id: 'price', label: 'Price per roll', type: 'money', def: 0, min: 0, hint: 'Optional. Enter the shelf price for a total.' }
    ],
    compute: function (v, f) {
      var area = rowsArea(v.rooms);
      if (!area) return { error: 'Enter at least one room size.' };
      var need = area * (1 + v.waste / 100), rolls = up(need / v.roll);
      var alt = v.roll < 150 ? 200 : 100;
      return {
        main: { label: 'Underlayment to buy', value: num(rolls) + ' ' + plural(rolls, 'roll'), sub: f.area(rolls * v.roll) + ' of material for ' + f.area(need) },
        rows: [['Floor area', f.area(area)], ['With ' + v.waste + '% waste', f.area(need)], ['Same job with ' + (f.u === 'met' ? num(alt / SQM, 1) + ' m²' : alt + ' sq ft') + ' rolls', num(up(need / alt)) + ' rolls'], v.price ? ['Cost', f.money(rolls * v.price, 0), 'total'] : null],
        note: 'If your planks have pad attached, most makers say to add no second pad. Read the flooring box first.'
      };
    }
  };

  /* ----- lumber ----- */
  CALCS['board-foot'] = {
    title: 'Board foot calculator', icon: 'lumber',
    fields: [
      { group: 'Boards', id: 'thick', label: 'Thickness', fam: 'small', def: { imp: 1, met: 25 }, hint: 'Rough lumber is sold by nominal quarters: 4/4 = 1 in' },
      { group: 'Boards', id: 'width', label: 'Width', fam: 'small', def: { imp: 8, met: 200 } },
      { group: 'Boards', id: 'length', label: 'Length', fam: 'len', def: { imp: 10, met: 3 } },
      { group: 'Boards', id: 'qty', label: 'How many boards', type: 'int', def: 10, min: 1 },
      { group: 'Buying', id: 'waste', label: 'Extra for defects and cuts', type: 'select', def: '15', opts: [['15', '15%'], ['0', 'None'], ['10', '10%'], ['20', '20%'], ['30', '30% (knotty or rough stock)']] },
      { group: 'Buying', id: 'price', label: 'Price per board foot', type: 'money', def: 7.5 }
    ],
    compute: function (v, f) {
      var each = v.thick * v.width * v.length / 12, total = each * v.qty, buy = up(total * (1 + v.waste / 100));
      return {
        main: { label: 'Board feet to buy', value: num(buy) + ' bd ft', sub: f.money(buy * v.price, 2) + ' at ' + f.money(v.price, 2) + ' per board foot' },
        rows: [['Board feet per board', num(each, 2)], ['Total, ' + num(v.qty) + ' ' + plural(v.qty, 'board'), num(total, 1) + ' bd ft'], ['With ' + v.waste + '% extra', num(total * (1 + v.waste / 100), 1) + ' bd ft'], ['Volume', num(buy * 0.00235974, 3) + ' m³', 'total']],
        note: 'One board foot is 144 cubic inches: 1 in thick, 12 in wide and 1 ft long. Yards measure rough boards by nominal thickness.'
      };
    }
  };

  /* ----- costs ----- */
  CALCS['refinish-cost'] = {
    title: 'Floor refinishing cost calculator', icon: 'refinish',
    fields: [
      { id: 'area', label: 'Floor area', fam: 'area', def: { imp: 500, met: 46.5 } },
      { id: 'base', label: 'Sand and finish rate', fam: 'perArea', money: true, def: { imp: 5, met: 54 }, hint: 'Angi: full refinishing $3 to $8 per sq ft' },
      { id: 'stain', label: 'Color', type: 'select', def: 'yes', opts: [['yes', 'New stain color'], ['no', 'Natural, no stain']] },
      { id: 'stainRate', label: 'Stain rate', fam: 'perArea', money: true, def: { imp: 2, met: 21.5 }, hint: 'Angi: $1 to $3 per sq ft', show: function (v) { return v.stain === 'yes'; } },
      { id: 'repairs', label: 'Board repairs', type: 'money', def: 0, min: 0 }
    ],
    compute: function (v, f) {
      var base = v.area * v.base, stain = v.stain === 'yes' ? v.area * v.stainRate : 0, total = base + stain + v.repairs;
      return {
        main: { label: 'Estimated cost', value: f.money(total, 0), sub: f.money(f.areaRate(total / v.area)) + ' ' + f.perArea() },
        rows: [['Sanding and finish', f.money(base, 0)], v.stain === 'yes' ? ['Stain', f.money(stain, 0)] : null, v.repairs ? ['Repairs', f.money(v.repairs, 0)] : null, ['Typical range ($3 to $8 per sq ft)', f.money(v.area * 3, 0) + ' to ' + f.money(v.area * 8, 0)], ['Screen and recoat instead ($1 to $3)', f.money(v.area, 0) + ' to ' + f.money(v.area * 3, 0), 'total']],
        note: 'Ranges are 2026 US prices from Angi and HomeGuide. Stairs are usually priced per step.'
      };
    }
  };

  /* ----- for pros ----- */
  CALCS.overhead = {
    title: 'Contractor overhead calculator', icon: 'pie',
    fields: [
      { group: 'Monthly overhead', id: 'ins', label: 'Insurance', type: 'money', def: 400, min: 0 },
      { group: 'Monthly overhead', id: 'veh', label: 'Vehicle, fuel and repairs', type: 'money', def: 750, min: 0 },
      { group: 'Monthly overhead', id: 'phone', label: 'Phone and data', type: 'money', def: 100, min: 0 },
      { group: 'Monthly overhead', id: 'soft', label: 'Software', type: 'money', def: 150, min: 0 },
      { group: 'Monthly overhead', id: 'rent', label: 'Shop or storage rent', type: 'money', def: 700, min: 0 },
      { group: 'Monthly overhead', id: 'mkt', label: 'Marketing and website', type: 'money', def: 300, min: 0 },
      { group: 'Monthly overhead', id: 'admin', label: 'Accounting, licenses, fees', type: 'money', def: 200, min: 0 },
      { group: 'Your year', id: 'hours', label: 'Billable hours per month', type: 'num', def: 130, min: 1, hint: 'Hours you charge to customers, for the whole crew' },
      { group: 'Your year', id: 'rev', label: 'Revenue per year', type: 'money', def: 156000, min: 0 },
      { group: 'Price a job', id: 'jobH', label: 'Job hours', type: 'num', def: 24, min: 0 },
      { group: 'Price a job', id: 'direct', label: 'Job labor and materials', type: 'money', def: 1800, min: 0 },
      { group: 'Price a job', id: 'margin', label: 'Profit margin', type: 'pct', def: 15, min: 0, max: 90 }
    ],
    compute: function (v, f) {
      var month = v.ins + v.veh + v.phone + v.soft + v.rent + v.mkt + v.admin, year = month * 12, hrs = v.hours * 12;
      var perH = year / hrs, jobOh = v.jobH * perH, cost = v.direct + jobOh, price = cost / (1 - v.margin / 100);
      return {
        main: { label: 'Overhead per billable hour', value: f.money(perH, 2), sub: 'Yearly overhead ' + f.money(year, 0) + ' over ' + num(hrs) + ' billable hours' },
        rows: [['Overhead per month', f.money(month, 0)], ['Overhead as % of revenue', v.rev ? num(year / v.rev * 100, 1) + '%' : 'Enter revenue'], ['This job: overhead share', f.money(jobOh, 0)], ['This job: full cost', f.money(cost, 0)], ['Price at ' + v.margin + '% margin', f.money(price, 2)], ['Quote, rounded up to $5', f.money(Math.ceil(price / 5 - 1e-9) * 5, 0), 'total']],
        note: 'Count only billable hours. Drive time, quoting and rain days do not bill, and spreading overhead over them sets your rate too low.'
      };
    }
  };

  var LAWN_MKT = { '8': [30, 40, 40, 50, 'about 1/8 acre'], '4': [45, 65, 60, 85, 'about 1/4 acre'], '2': [50, 75, 65, 100, 'about 1/2 acre'], '1': [60, 100, 80, 150, 'about 1 acre'] };
  CALCS['lawn-price'] = {
    title: 'Lawn mowing price calculator', icon: 'mower',
    fields: [
      { group: 'Time', id: 'onsite', label: 'Minutes on site', type: 'num', def: 40, min: 1, hint: 'Mow, trim, edge and blow-off' },
      { group: 'Time', id: 'travel', label: 'Travel, load and unload', type: 'num', def: 20, min: 0, hint: 'Minutes' },
      { group: 'Price', id: 'rate', label: 'Your hourly rate', type: 'money', def: 60 },
      { group: 'Price', id: 'freq', label: 'Service', type: 'select', def: 'w', opts: [['w', 'Weekly (4.33 visits a month)'], ['b', 'Every two weeks (2.17 a month)']] },
      { group: 'Market check', id: 'size', label: 'Lot size', type: 'select', def: '4', opts: [['8', 'About 1/8 acre'], ['4', 'About 1/4 acre'], ['2', 'About 1/2 acre'], ['1', 'About 1 acre']] }
    ],
    compute: function (v, f) {
      var mins = v.onsite + v.travel, visit = mins / 60 * v.rate, per = v.freq === 'w' ? 4.33 : 2.17;
      var m = LAWN_MKT[v.size] || LAWN_MKT['4'], lo = v.freq === 'w' ? m[0] : m[2], hi = v.freq === 'w' ? m[1] : m[3];
      var check = visit < lo ? 'Below the usual range. Check your times.' : visit > hi ? 'Above the usual range. Fine if the yard is slow work.' : 'Inside the usual range';
      return {
        main: { label: 'Price per visit', value: f.money(visit, 0), sub: f.money(visit * per, 0) + ' a month' },
        rows: [['Paid time per visit', num(mins) + ' min'], ['On-site share', f.money(v.onsite / 60 * v.rate, 0)], ['Travel share', f.money(v.travel / 60 * v.rate, 0)], ['Market, ' + m[4] + (v.freq === 'w' ? ', weekly' : ', every two weeks'), f.money(lo, 0) + ' to ' + f.money(hi, 0)], ['Your price vs market', check, 'total']],
        note: 'Market ranges are 2026 US prices per visit from HomeGuide data. Your own time and rate come first; the market is only a sanity check.'
      };
    }
  };

  var CLEAN = { std: [0.10, 0.17, 'Standard'], deep: [0.11, 0.30, 'Deep clean'], move: [0.22, 0.33, 'Move-in or move-out'] };
  CALCS['cleaning-price'] = {
    title: 'House cleaning price calculator', icon: 'spray',
    fields: [
      { group: 'Home', id: 'sqft', label: 'Home size', fam: 'area', def: { imp: 2000, met: 186 } },
      { group: 'Home', id: 'type', label: 'Clean type', type: 'select', def: 'std', opts: [['std', 'Standard'], ['deep', 'Deep clean'], ['move', 'Move-in or move-out']] },
      { group: 'Your numbers', id: 'hours', label: 'Labor hours for this clean', type: 'num', def: 4, min: 0.25, step: 0.25, hint: 'Total for all cleaners' },
      { group: 'Your numbers', id: 'rate', label: 'Hourly rate per cleaner', type: 'money', def: 50 },
      { group: 'Your numbers', id: 'sqRate', label: 'Your square foot rate', fam: 'perArea', money: true, def: { imp: 0.10, met: 1.08 }, hint: 'For the cross-check' },
      { group: 'Recurring', id: 'rHours', label: 'Hours for each repeat visit', type: 'num', def: 3, min: 0, step: 0.25 },
      { group: 'Recurring', id: 'freq', label: 'Repeat visits', type: 'select', def: 'b', opts: [['b', 'Every two weeks'], ['w', 'Weekly'], ['m', 'Monthly']] }
    ],
    compute: function (v, f) {
      var t = CLEAN[v.type] || CLEAN.std, byTime = v.hours * v.rate, bySq = v.sqft * v.sqRate;
      var gap = Math.abs(byTime - bySq) / Math.max(byTime, bySq);
      var rep = v.rHours * v.rate, per = { w: 4.33, b: 2.17, m: 1 }[v.freq];
      return {
        main: { label: 'Price for this clean', value: f.money(byTime, 0), sub: 'Square foot check: ' + f.money(bySq, 0) + (gap < 0.1 ? ' (they agree)' : ' (more than 10% apart, so recheck your time)') },
        rows: [['Market for ' + t[2].toLowerCase() + ', ' + f.area(v.sqft), f.money(v.sqft * t[0], 0) + ' to ' + f.money(v.sqft * t[1], 0)], v.rHours ? ['Repeat visit price', f.money(rep, 0)] : null, v.rHours ? ['Repeat visits per month', f.money(rep * per, 0), 'total'] : null],
        note: 'Square foot ranges are 2026 US figures from HomeGuide: standard $0.10 to $0.17, deep $0.11 to $0.30, move-out $0.22 to $0.33 per sq ft.'
      };
    }
  };

  CALCS['pressure-price'] = {
    title: 'Pressure washing price calculator', icon: 'washer',
    fields: [
      { group: 'Surface 1', id: 'a1', label: 'Area (e.g. driveway)', fam: 'area', def: { imp: 600, met: 56 }, min: 0 },
      { group: 'Surface 1', id: 'r1', label: 'Rate', fam: 'perArea', money: true, def: { imp: 0.30, met: 3.2 }, hint: 'Driveways: $0.10 to $0.40' },
      { group: 'Surface 2', id: 'a2', label: 'Area (e.g. patio or deck)', fam: 'area', def: { imp: 300, met: 28 }, min: 0 },
      { group: 'Surface 2', id: 'r2', label: 'Rate', fam: 'perArea', money: true, def: { imp: 0.40, met: 4.3 }, hint: 'Decks: $0.30 to $0.80' },
      { group: 'Surface 3', id: 'a3', label: 'Area (e.g. siding)', fam: 'area', def: { imp: 0, met: 0 }, min: 0 },
      { group: 'Surface 3', id: 'r3', label: 'Rate', fam: 'perArea', money: true, def: { imp: 0.25, met: 2.7 }, hint: 'House exterior: $0.15 to $0.50' },
      { group: 'Job', id: 'min', label: 'Minimum charge', type: 'money', def: 150 },
      { group: 'Job', id: 'addons', label: 'Add-ons (stain treatment, sealing)', type: 'money', def: 0, min: 0 }
    ],
    compute: function (v, f) {
      var p1 = v.a1 * v.r1, p2 = v.a2 * v.r2, p3 = v.a3 * v.r3, area = v.a1 + v.a2 + v.a3, sub = p1 + p2 + p3 + v.addons;
      if (!area) return { error: 'Enter the size of at least one surface.' };
      var total = Math.max(sub, v.min);
      return {
        main: { label: 'Job price', value: f.money(total, 0), sub: total > sub ? 'Your minimum charge applies' : f.money(f.areaRate((p1 + p2 + p3) / area)) + ' ' + f.perArea() + ' on average' },
        rows: [v.a1 ? ['Surface 1', f.money(p1, 0)] : null, v.a2 ? ['Surface 2', f.money(p2, 0)] : null, v.a3 ? ['Surface 3', f.money(p3, 0)] : null, v.addons ? ['Add-ons', f.money(v.addons, 0)] : null, ['Total area', f.area(area)], ['Typical homeowner job (HomeGuide)', '$173 to $311', 'total']],
        note: 'Rate hints are 2026 US ranges from HomeGuide. Price oil stains, algae treatment and sealing as separate lines.'
      };
    }
  };

  CALCS.invoice = { title: 'Free invoice builder', icon: 'invoice', custom: true, mode: 'invoice' };

  /* =========================================================================
     ENGINE (browser only)
     ========================================================================= */
  root.PCK_CALC = { CALCS: CALCS, makeFmt: makeFmt, paintRoom: paintRoom, buyGallons: buyGallons, buyLitres: buyLitres, bagYieldFt3: bagYieldFt3, num: num };
  if (typeof document === 'undefined') {
    if (typeof module === 'object' && module.exports) module.exports = root.PCK_CALC;
    return;
  }

  var ICON = {
    copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/></svg>',
    reset: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4v6h6"/><path d="M5.5 15A7.5 7.5 0 1 0 6 8.5L4 10"/></svg>',
    print: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>',
    del: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };
  var ROOT = document.documentElement.getAttribute('data-root') || './';

  function store(key, val) {
    try {
      if (val === undefined) { var s = localStorage.getItem(key); return s ? JSON.parse(s) : null; }
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
    return null;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function guessUnits() {
    var l = (navigator.language || 'en-US').toLowerCase();
    return /^en-(us|ca)|^es-us/.test(l) || l === 'en' ? 'imp' : 'met';
  }
  function guessCurrency() {
    var l = (navigator.language || 'en-US').toLowerCase();
    if (/-gb$/.test(l)) return 'GBP';
    if (/^(de|fr|es|it|nl|pt|fi|el|sk|sl|et|lv|lt)\b|-ie$|-(de|fr|es|it|nl|at|be|pt|fi)$/.test(l) && !/es-us/.test(l)) return 'EUR';
    return 'USD';
  }
  function defFor(field, u) {
    var d = field.def;
    if (d && typeof d === 'object' && !Array.isArray(d)) d = d[u];
    if (Array.isArray(d)) return d.map(function (r) { return r.length === 3 ? { s: r[0], a: r[1], b: r[2] } : { s: 'rect', a: r[0], b: r[1] }; });
    return d;
  }
  function optsFor(field, u) { return Array.isArray(field.opts) ? field.opts : (field.opts ? field.opts[u] : []); }
  function round(x, step) {
    var d = step >= 1 ? 0 : (step ? String(step).split('.')[1].length : 2);
    return Math.round(x * Math.pow(10, d)) / Math.pow(10, d);
  }

  function Calc(el) {
    var id = el.getAttribute('data-calc');
    var def = CALCS[id];
    if (!def) { el.innerHTML = '<p class="calc-loading">This calculator could not load. Refresh the page to try again.</p>'; return; }
    this.el = el; this.id = id; this.def = def;
    this.uid = 'c' + Math.random().toString(36).slice(2, 7);
    var saved = store('pck:' + id) || {};
    this.u = saved.u || store('pck:units') || guessUnits();
    this.cur = store('pck:cur') || guessCurrency();
    this.vals = {};
    this.reset(true);
    if (saved.vals && saved.u === this.u) {
      for (var k in saved.vals) if (Object.prototype.hasOwnProperty.call(this.vals, k)) this.vals[k] = saved.vals[k];
    }
    var tpl = el.querySelector('template.calc-ico');
    this.icon = tpl ? tpl.innerHTML : '';
    if (def.compact) el.classList.add('calc-compact');
    if (def.custom) { Quote(this); return; }
    this.render();
    this.update();
    var self = this;
    el.addEventListener('input', function (e) { self.onInput(e); });
    el.addEventListener('change', function (e) { self.onInput(e); });
    el.addEventListener('click', function (e) { self.onClick(e); });
  }
  Calc.prototype.reset = function (silent) {
    var self = this;
    this.vals = {};
    (this.def.fields || []).forEach(function (fd) {
      var d = defFor(fd, self.u);
      self.vals[fd.id] = Array.isArray(d) ? d.map(function (r) { return { s: r.s, a: r.a, b: r.b }; }) : (d == null ? '' : d);
    });
    if (!silent) { this.render(); this.update(); }
  };
  Calc.prototype.switches = function () {
    var u = this.u, cur = this.cur;
    var hasUnits = (this.def.fields || []).some(function (fd) { return fd.fam || fd.type === 'rects' || (fd.opts && !Array.isArray(fd.opts)); });
    var hasMoney = (this.def.fields || []).some(function (fd) { return fd.money || fd.type === 'money'; }) || this.def.custom;
    var out = '<div class="calc-switches">';
    if (hasUnits) out += '<div class="seg" role="group" aria-label="Units"><button type="button" data-units="imp" aria-pressed="' + (u === 'imp') + '">Feet</button><button type="button" data-units="met" aria-pressed="' + (u === 'met') + '">Meters</button></div>';
    if (hasMoney) out += '<div class="seg" role="group" aria-label="Currency"><button type="button" data-cur="USD" aria-pressed="' + (cur === 'USD') + '">$</button><button type="button" data-cur="GBP" aria-pressed="' + (cur === 'GBP') + '">£</button><button type="button" data-cur="EUR" aria-pressed="' + (cur === 'EUR') + '">€</button></div>';
    return out + '</div>';
  };
  Calc.prototype.fieldHtml = function (fd) {
    var u = this.u, v = this.vals[fd.id], fid = this.uid + '-' + fd.id;
    var sym = makeFmt(u, this.cur).sym;
    var hint = fd.hint ? '<span class="hint" id="' + fid + '-h">' + esc(fd.hint) + '</span>' : '';
    var desc = fd.hint ? ' aria-describedby="' + fid + '-h"' : '';
    if (fd.type === 'select') {
      var longOpt = optsFor(fd, u).some(function (o) { return String(o[1]).length > 16; });
      return '<div class="field' + (longOpt ? ' sel-wide' : '') + '" data-field="' + fd.id + '"><label for="' + fid + '">' + esc(fd.label) + '</label><div class="inp"><select id="' + fid + '" data-k="' + fd.id + '"' + desc + '>' +
        optsFor(fd, u).map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(v) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>' + hint + '</div>';
    }
    if (fd.type === 'rects') return this.rectsHtml(fd);
    var unit = '', pre = '';
    if (fd.fam) {
      var fam = FAM[fd.fam];
      unit = fam[u];
      if (fd.money) { pre = sym; }
    }
    if (fd.type === 'money') pre = sym;
    if (fd.type === 'pct') unit = '%';
    var step = fd.step || (fd.type === 'int' ? 1 : 'any');
    var min = fd.min != null ? fd.min : 0;
    var cls = 'inp' + (pre ? ' has-pre' : '') + (unit ? ' has-unit' : '');
    return '<div class="field" data-field="' + fd.id + '"><label for="' + fid + '">' + esc(fd.label) + '</label><div class="' + cls + '">' + (pre ? '<span class="pre">' + pre + '</span>' : '') +
      '<input id="' + fid + '" data-k="' + fd.id + '" type="number" inputmode="decimal" step="' + step + '" min="' + min + '"' + (fd.max != null ? ' max="' + fd.max + '"' : '') + ' value="' + esc(v) + '"' + desc + '>' +
      (unit ? '<span class="unit">' + esc(fd.money ? unit.replace('per ', '/') : unit) + '</span>' : '') + '</div>' + hint + '</div>';
  };
  Calc.prototype.rectsHtml = function (fd) {
    var u = this.u, rows = this.vals[fd.id] || [], self = this, unit = FAM.len[u];
    var html = '<div class="field wide" data-field="' + fd.id + '"><div class="rows">';
    rows.forEach(function (r, i) {
      var p = self.uid + '-' + fd.id + '-' + i;
      var aLabel = r.s === 'circle' ? 'Diameter' : r.s === 'tri' ? 'Base' : 'Length';
      var bLabel = r.s === 'tri' ? 'Height' : 'Width';
      html += '<div class="row-item' + (fd.shapes ? '' : ' no-shape') + '" data-row="' + i + '">' +
        (fd.shapes ? '<div class="field"><label for="' + p + '-s">' + esc(fd.label) + ' ' + (i + 1) + '</label><div class="inp"><select id="' + p + '-s" data-r="' + fd.id + '" data-i="' + i + '" data-p="s"><option value="rect"' + (r.s === 'rect' ? ' selected' : '') + '>Rectangle</option><option value="circle"' + (r.s === 'circle' ? ' selected' : '') + '>Circle</option><option value="tri"' + (r.s === 'tri' ? ' selected' : '') + '>Triangle</option></select></div></div>' : '') +
        '<div class="field"><label for="' + p + '-a">' + (fd.shapes ? aLabel : esc(fd.label) + ' ' + (i + 1) + ' length') + '</label><div class="inp has-unit"><input id="' + p + '-a" type="number" inputmode="decimal" step="any" min="0" data-r="' + fd.id + '" data-i="' + i + '" data-p="a" value="' + esc(r.a) + '"><span class="unit">' + unit + '</span></div></div>' +
        (r.s === 'circle' ? '' : '<div class="field"><label for="' + p + '-b">' + (fd.shapes ? bLabel : 'Width') + '</label><div class="inp has-unit"><input id="' + p + '-b" type="number" inputmode="decimal" step="any" min="0" data-r="' + fd.id + '" data-i="' + i + '" data-p="b" value="' + esc(r.b) + '"><span class="unit">' + unit + '</span></div></div>') +
        (rows.length > 1 ? '<button type="button" class="icon-btn" data-del="' + fd.id + '" data-i="' + i + '" aria-label="Remove ' + esc(fd.label.toLowerCase()) + ' ' + (i + 1) + '">' + ICON.del + '</button>' : (r.s === 'circle' ? '<span></span>' : '<span></span>')) +
        '</div>';
    });
    html += '</div><button type="button" class="btn btn-ghost add-row" data-add="' + fd.id + '">' + ICON.plus + esc(fd.addLabel || 'Add another') + '</button>' +
      (fd.hint ? '<span class="hint">' + esc(fd.hint) + '</span>' : '') + '</div>';
    return html;
  };
  Calc.prototype.render = function () {
    var self = this, def = this.def, u = this.u;
    var groups = [], byGroup = {};
    def.fields.forEach(function (fd) {
      if (fd.show && !fd.show(self.vals)) return;
      var g = fd.group || '';
      if (!byGroup[g]) { byGroup[g] = []; groups.push(g); }
      byGroup[g].push(fd);
    });
    var form = groups.map(function (g) {
      var inner = byGroup[g].map(function (fd) { return self.fieldHtml(fd); }).join('');
      return '<fieldset class="calc-group">' + (g ? '<legend>' + esc(g) + '</legend>' : '<legend class="sr">' + esc(def.title) + '</legend>') + inner + '</fieldset>';
    }).join('');
    var icoSvg = this.icon;
    this.el.innerHTML = '<div class="calc-top"><p class="calc-title">' + (icoSvg ? '<span class="tool-ico">' + icoSvg + '</span>' : '') + esc(def.title) + '</p>' + this.switches() + '</div>' +
      '<div class="calc-body"><form class="calc-form" novalidate onsubmit="return false">' + form + '</form>' +
      '<div class="calc-out" aria-live="polite"><div data-out></div><div class="calc-actions">' +
      (def.link ? '<a class="btn btn-tape" href="' + ROOT + def.link.href + '">' + esc(def.link.label) + '</a>' : '<button type="button" class="btn btn-ghost" data-copy>' + ICON.copy + 'Copy results</button><button type="button" class="btn btn-ghost" data-print>' + ICON.print + 'Print</button>') +
      '<button type="button" class="btn btn-ghost" data-reset>' + ICON.reset + 'Reset</button></div></div></div>';
    void u;
  };
  Calc.prototype.baseValues = function () {
    var self = this, out = {}, u = this.u;
    var bad = [];
    this.def.fields.forEach(function (fd) {
      var raw = self.vals[fd.id];
      if (fd.type === 'select') { out[fd.id] = raw; return; }
      if (fd.type === 'rects') {
        out[fd.id] = (raw || []).map(function (r) {
          var k = u === 'met' ? FAM.len.k : 1;
          return { s: r.s || 'rect', a: (parseFloat(r.a) || 0) * k, b: (parseFloat(r.b) || 0) * k };
        });
        return;
      }
      var n = parseFloat(raw);
      var hidden = fd.show && !fd.show(self.vals);
      var isMoney = fd.money || fd.type === 'money';
      var zeroOk = fd.min === 0 || isMoney;
      if (!hidden) {
        if (!isFinite(n)) { if (!zeroOk) bad.push(fd); }
        else if (n < 0) bad.push(fd);
        else if (!zeroOk && (n === 0 || (fd.min != null && n < fd.min))) bad.push(fd);
        else if (fd.max != null && n > fd.max) bad.push(fd);
      }
      if (!isFinite(n)) n = 0;
      if (fd.fam && u === 'met') n = n * FAM[fd.fam].k;
      out[fd.id] = n;
    });
    return { v: out, bad: bad };
  };
  Calc.prototype.update = function () {
    var out = this.el.querySelector('[data-out]');
    if (!out) return;
    var fields = this.el.querySelectorAll('.field.invalid');
    for (var i = 0; i < fields.length; i++) fields[i].classList.remove('invalid');
    var b = this.baseValues();
    var f = makeFmt(this.u, this.cur);
    if (b.bad.length) {
      var self = this;
      b.bad.forEach(function (fd) { var el = self.el.querySelector('[data-field="' + fd.id + '"]'); if (el) el.classList.add('invalid'); });
      out.innerHTML = '<p class="result-error">Check "' + esc(b.bad[0].label) + '". It needs a number' + (b.bad[0].max != null ? ' up to ' + b.bad[0].max : '') + (b.bad[0].min === 0 ? '' : ' above zero') + '.</p>';
      this.last = null;
      return;
    }
    var r;
    try { r = this.def.compute(b.v, f); } catch (e) { r = { error: 'Something in the inputs does not add up. Check each number.' }; }
    this.last = r;
    if (r.error) { out.innerHTML = '<p class="result-error">' + esc(r.error) + '</p>'; return; }
    var html = '<div class="result-main"><div class="result-label">' + esc(r.main.label) + '</div><div class="result-value">' + esc(r.main.value) + '</div>' + (r.main.sub ? '<div class="result-sub">' + esc(r.main.sub) + '</div>' : '') + '</div>';
    var rows = (r.rows || []).filter(Boolean);
    if (rows.length) html += '<ul class="result-list">' + rows.map(function (x) { return '<li' + (x[2] ? ' class="' + x[2] + '"' : '') + '><span>' + esc(x[0]) + '</span><strong>' + esc(x[1]) + '</strong></li>'; }).join('') + '</ul>';
    if (r.note) html += '<p class="result-note">' + esc(r.note) + '</p>';
    if (this.cur !== 'USD' && this.def.fields.some(function (fd) { return fd.money || fd.type === 'money'; })) html += '<p class="result-note">' + CURRENCY_NOTE + '</p>';
    out.innerHTML = html;
    store('pck:' + this.id, { u: this.u, vals: this.vals });
  };
  Calc.prototype.onInput = function (e) {
    var t = e.target;
    if (t.hasAttribute('data-k')) {
      var k = t.getAttribute('data-k');
      this.vals[k] = t.value;
      var fd = this.def.fields.filter(function (x) { return x.id === k; })[0];
      if (fd && fd.type === 'select' && this.def.fields.some(function (x) { return !!x.show; })) {
        if (e.type === 'change') { this.render(); this.update(); var el = this.el.querySelector('[data-k="' + k + '"]'); if (el) el.focus(); return; }
      }
      this.update();
    } else if (t.hasAttribute('data-r')) {
      var key = t.getAttribute('data-r'), i = +t.getAttribute('data-i'), p = t.getAttribute('data-p');
      this.vals[key][i][p] = t.value;
      if (p === 's' && e.type === 'change') { this.render(); this.update(); var el2 = this.el.querySelector('[data-r="' + key + '"][data-i="' + i + '"][data-p="s"]'); if (el2) el2.focus(); return; }
      this.update();
    }
  };
  Calc.prototype.setUnits = function (u) {
    if (u === this.u) return;
    var old = this.u, self = this;
    this.def.fields.forEach(function (fd) {
      var v = self.vals[fd.id];
      var dOld = defFor(fd, old), dNew = defFor(fd, u);
      if (fd.type === 'select') {
        if (fd.opts && !Array.isArray(fd.opts)) self.vals[fd.id] = dNew;
        else if (fd.def && typeof fd.def === 'object') self.vals[fd.id] = dNew;
        return;
      }
      if (fd.type === 'rects') {
        var k = FAM.len.k;
        self.vals[fd.id] = (v || []).map(function (r) {
          var a = parseFloat(r.a), b = parseFloat(r.b);
          var conv = function (x) { if (!isFinite(x)) return ''; return u === 'met' ? round(x / k, 0.01) : round(x * k, 0.1); };
          return { s: r.s, a: conv(a), b: conv(b) };
        });
        return;
      }
      if (!fd.fam) return;
      var n = parseFloat(v);
      if (String(n) === String(dOld) || n === dOld) { self.vals[fd.id] = dNew; return; }
      if (!isFinite(n)) return;
      var base = old === 'met' ? n * FAM[fd.fam].k : n;
      var nv = u === 'met' ? base / FAM[fd.fam].k : base;
      self.vals[fd.id] = round(nv, fd.money ? 0.01 : (fd.fam === 'small' && u === 'met') ? 1 : 0.01);
    });
    this.u = u;
    store('pck:units', u);
    this.render(); this.update();
    var btn = this.el.querySelector('[data-units="' + u + '"]'); if (btn) btn.focus();
  };
  Calc.prototype.resultText = function () {
    var r = this.last;
    if (!r || r.error) return '';
    var lines = [this.def.title, r.main.label + ': ' + r.main.value + (r.main.sub ? ' (' + r.main.sub + ')' : '')];
    (r.rows || []).filter(Boolean).forEach(function (x) { lines.push(x[0] + ': ' + x[1]); });
    lines.push(window.location.href.split('#')[0]);
    return lines.join('\n');
  };
  Calc.prototype.onClick = function (e) {
    var t = e.target.closest ? e.target.closest('button') : null;
    if (!t || !this.el.contains(t)) return;
    var self = this;
    if (t.hasAttribute('data-units')) this.setUnits(t.getAttribute('data-units'));
    else if (t.hasAttribute('data-cur')) {
      this.cur = t.getAttribute('data-cur'); store('pck:cur', this.cur);
      this.render(); this.update();
      var c = this.el.querySelector('[data-cur="' + this.cur + '"]'); if (c) c.focus();
    } else if (t.hasAttribute('data-reset')) { this.reset(); }
    else if (t.hasAttribute('data-add')) {
      var key = t.getAttribute('data-add'); var rows = this.vals[key]; var last = rows[rows.length - 1] || { s: 'rect', a: '', b: '' };
      rows.push({ s: last.s, a: '', b: '' });
      this.render(); this.update();
      var inp = this.el.querySelector('[data-r="' + key + '"][data-i="' + (rows.length - 1) + '"][data-p="a"]'); if (inp) inp.focus();
    } else if (t.hasAttribute('data-del')) {
      var k2 = t.getAttribute('data-del'), i = +t.getAttribute('data-i');
      this.vals[k2].splice(i, 1);
      this.render(); this.update();
      var add = this.el.querySelector('[data-add="' + k2 + '"]'); if (add) add.focus();
    } else if (t.hasAttribute('data-copy')) {
      var text = this.resultText();
      var done = function () { var o = t.innerHTML; t.textContent = 'Copied'; setTimeout(function () { t.innerHTML = o; }, 1600); };
      if (navigator.clipboard && text) navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy your results:', text); });
      else if (text) window.prompt('Copy your results:', text);
    } else if (t.hasAttribute('data-print')) {
      window.print();
    }
    void self;
  };

  /* ----- free estimate builder ----- */
  function Quote(ctx) {
    var INV = ctx.def.mode === 'invoice';
    var el = ctx.el, KEY = INV ? 'pck:invoice' : 'pck:quote';
    var WORD = INV ? 'invoice' : 'estimate';
    function blank() {
      var d = new Date();
      var iso = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      if (INV) return {
        biz: '', contact: '', client: '', address: '', number: 'INV-' + String(d.getFullYear()).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2) + '-01', date: iso, work: '', due: 14, tax: 7, paid: 400,
        items: [{ d: 'Labor: paint living room walls and ceiling, 2 coats (hours)', q: 16, p: 65, t: false }, { d: 'Paint', q: 1, p: 185, t: true }, { d: 'Primer', q: 1, p: 65, t: true }, { d: 'Supplies: tape, rollers, drop cloths', q: 1, p: 40, t: true }],
        notes: 'Pay by check, card or bank transfer.\nLate payments: 1.5% per month, as stated in our contract.\nThank you for your business.'
      };
      return {
        biz: '', contact: '', client: '', address: '', number: 'EST-' + String(d.getFullYear()).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2) + '-01', date: iso, valid: 30, tax: 0, deposit: 0,
        items: [{ d: 'Prep: patch, sand and caulk walls', q: 1, p: 250 }, { d: 'Paint walls, 2 coats (living room)', q: 1, p: 850 }, { d: 'Paint and supplies', q: 1, p: 180 }],
        notes: 'Price includes moving and covering furniture and full cleanup. Work can start within two weeks of approval.'
      };
    }
    var s = store(KEY) || blank();
    function money(x) { return makeFmt('imp', ctx.cur).money(x, 2); }
    function line(it) { return (parseFloat(it.q) || 0) * (parseFloat(it.p) || 0); }
    function totals() {
      var sub = s.items.reduce(function (a, it) { return a + line(it); }, 0);
      var taxable = INV ? s.items.reduce(function (a, it) { return a + (it.t ? line(it) : 0); }, 0) : sub;
      var tax = Math.round(taxable * (parseFloat(s.tax) || 0)) / 100;
      var total = sub + tax;
      if (INV) { var paid = parseFloat(s.paid) || 0; return { sub: sub, taxable: taxable, tax: tax, total: total, paid: paid, bal: total - paid }; }
      return { sub: sub, tax: tax, total: total, dep: total * (parseFloat(s.deposit) || 0) / 100 };
    }
    function addDays(iso, n) {
      if (!iso) return '';
      var p = String(iso).split('-');
      var d = new Date(+p[0], +p[1] - 1, +p[2] + (parseInt(n, 10) || 0));
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }
    function fld(k, label, type, extra) {
      var id = ctx.uid + '-' + k;
      if (type === 'money') return '<div class="field"><label for="' + id + '">' + label + '</label><div class="inp has-pre"><span class="pre">' + makeFmt('imp', ctx.cur).sym + '</span><input id="' + id + '" data-q="' + k + '" type="number" min="0" step="any" inputmode="decimal" value="' + esc(s[k]) + '"></div></div>';
      if (type === 'textarea') return '<div class="field wide"><label for="' + id + '">' + label + '</label><textarea id="' + id + '" data-q="' + k + '">' + esc(s[k]) + '</textarea></div>';
      return '<div class="field' + (extra || '') + '"><label for="' + id + '">' + label + '</label><div class="inp' + (type === 'pct' ? ' has-unit' : '') + '"><input id="' + id + '" data-q="' + k + '" type="' + (type === 'pct' ? 'number' : type) + '" value="' + esc(s[k]) + '"' + (type === 'pct' ? ' min="0" step="any" inputmode="decimal"' : '') + '>' + (type === 'pct' ? '<span class="unit">%</span>' : '') + '</div></div>';
    }
    function itemsHtml() {
      return s.items.map(function (it, i) {
        var p = ctx.uid + '-i' + i;
        return '<div class="q-row' + (INV ? ' has-tax' : '') + '"><div class="field"><label for="' + p + 'd">Item ' + (i + 1) + '</label><div class="inp"><input id="' + p + 'd" data-it="' + i + '" data-p="d" value="' + esc(it.d) + '"></div></div>' +
          '<div class="field"><label for="' + p + 'q">Qty</label><div class="inp"><input id="' + p + 'q" type="number" min="0" step="any" inputmode="decimal" data-it="' + i + '" data-p="q" value="' + esc(it.q) + '"></div></div>' +
          '<div class="field"><label for="' + p + 'p">Unit price</label><div class="inp has-pre"><span class="pre">' + makeFmt('imp', ctx.cur).sym + '</span><input id="' + p + 'p" type="number" min="0" step="any" inputmode="decimal" data-it="' + i + '" data-p="p" value="' + esc(it.p) + '"></div></div>' +
          (INV ? '<div class="field q-tax"><label for="' + p + 't">Taxed</label><div class="inp chk"><input id="' + p + 't" type="checkbox" data-it="' + i + '" data-p="t"' + (it.t ? ' checked' : '') + '></div></div>' : '') +
          '<button type="button" class="icon-btn" data-qdel="' + i + '" aria-label="Remove item ' + (i + 1) + '">' + ICON.del + '</button></div>';
      }).join('');
    }
    function previewInvoice() {
      var t = totals();
      return '<div class="quote-preview" id="' + ctx.uid + '-pv"><div class="q-meta"><div><h3>' + esc(s.biz || 'Your business name') + '</h3><div>' + esc(s.contact || 'Address · phone · email · license number').replace(/\n/g, '<br>') + '</div></div>' +
        '<div style="text-align:right"><strong style="font-size:1.1rem;color:#16324F">INVOICE</strong><div>' + esc(s.number) + '</div><div>Date: ' + esc(addDays(s.date, 0)) + '</div>' + (s.due ? '<div>Due: ' + esc(addDays(s.date, s.due)) + '</div>' : '') + '</div></div>' +
        '<p style="margin:14px 0 0"><strong>Bill to:</strong> ' + esc(s.client || 'Client name') + (s.address ? '<br>' + esc(s.address) : '') + (s.work ? '<br><span style="color:#56636F">Work dates: ' + esc(s.work) + '</span>' : '') + '</p>' +
        '<table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>' +
        s.items.map(function (it) { var q = parseFloat(it.q) || 0, pr = parseFloat(it.p) || 0; return '<tr><td>' + esc(it.d || '') + (it.t && parseFloat(s.tax) ? ' <span style="color:#56636F">(T)</span>' : '') + '</td><td class="num">' + num(q, 2) + '</td><td class="num">' + money(pr) + '</td><td class="num">' + money(q * pr) + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td colspan="3">Subtotal</td><td class="num">' + money(t.sub) + '</td></tr>' +
        (t.tax ? '<tr><td colspan="3">Tax (' + num(parseFloat(s.tax), 2) + '% on ' + (t.taxable < t.sub ? 'items marked T' : 'all items') + ')</td><td class="num">' + money(t.tax) + '</td></tr>' : '') +
        '<tr><td colspan="3">Total</td><td class="num">' + money(t.total) + '</td></tr>' +
        (t.paid ? '<tr><td colspan="3">Deposit paid</td><td class="num">-' + money(t.paid) + '</td></tr>' : '') +
        '<tr class="q-total"><td colspan="3">Balance due</td><td class="num">' + money(t.bal) + '</td></tr></tfoot></table>' +
        (s.due ? '<p><strong>Terms:</strong> due in ' + esc(s.due) + ' days, by ' + esc(addDays(s.date, s.due)) + '.</p>' : '') +
        (s.notes ? '<p style="white-space:pre-line">' + esc(s.notes) + '</p>' : '') + '</div>';
    }
    function preview() {
      if (INV) return previewInvoice();
      var t = totals();
      var valid = '';
      if (s.date && s.valid) {
        var p = String(s.date).split('-');
        var d = new Date(+p[0], +p[1] - 1, +p[2] + (parseInt(s.valid, 10) || 0));
        valid = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      }
      return '<div class="quote-preview" id="' + ctx.uid + '-pv"><div class="q-meta"><div><h3>' + esc(s.biz || 'Your business name') + '</h3><div>' + esc(s.contact || 'Phone · email · license number').replace(/\n/g, '<br>') + '</div></div>' +
        '<div style="text-align:right"><strong style="font-size:1.1rem;color:#16324F">ESTIMATE</strong><div>' + esc(s.number) + '</div><div>' + esc(s.date) + '</div></div></div>' +
        '<p style="margin:14px 0 0"><strong>Prepared for:</strong> ' + esc(s.client || 'Client name') + (s.address ? '<br>' + esc(s.address) : '') + '</p>' +
        '<table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead><tbody>' +
        s.items.map(function (it) { var q = parseFloat(it.q) || 0, pr = parseFloat(it.p) || 0; return '<tr><td>' + esc(it.d || '') + '</td><td class="num">' + num(q, 2) + '</td><td class="num">' + money(pr) + '</td><td class="num">' + money(q * pr) + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td colspan="3">Subtotal</td><td class="num">' + money(t.sub) + '</td></tr>' +
        (t.tax ? '<tr><td colspan="3">Tax (' + num(parseFloat(s.tax), 2) + '%)</td><td class="num">' + money(t.tax) + '</td></tr>' : '') +
        '<tr class="q-total"><td colspan="3">Total</td><td class="num">' + money(t.total) + '</td></tr>' +
        (t.dep ? '<tr><td colspan="3">Deposit to book (' + num(parseFloat(s.deposit), 0) + '%)</td><td class="num">' + money(t.dep) + '</td></tr>' : '') + '</tfoot></table>' +
        (s.notes ? '<p style="white-space:pre-line">' + esc(s.notes) + '</p>' : '') +
        (valid ? '<p style="color:#56636F">This estimate is valid until ' + esc(valid) + '.</p>' : '') +
        '<p style="margin-top:22px;color:#56636F">Accepted by: ______________________ &nbsp; Date: __________</p></div>';
    }
    function render() {
      var icoSvg = ctx.icon;
      el.classList.add('is-stacked');
      el.innerHTML = '<div class="calc-top"><p class="calc-title">' + (icoSvg ? '<span class="tool-ico">' + icoSvg + '</span>' : '') + esc(ctx.def.title) + '</p>' + ctx.switches() + '</div>' +
        '<div class="calc-body"><form class="calc-form" novalidate onsubmit="return false">' +
        '<fieldset class="calc-group"><legend>Your business</legend>' + fld('biz', 'Business name', 'text') + '<div class="field"><label for="' + ctx.uid + '-contact">' + (INV ? 'Address, phone, email, license' : 'Phone, email, license') + '</label><div class="inp"><input id="' + ctx.uid + '-contact" data-q="contact" value="' + esc(s.contact) + '"></div></div></fieldset>' +
        '<fieldset class="calc-group"><legend>Client and job</legend>' + fld('client', 'Client name', 'text') + fld('address', 'Job address', 'text') + fld('number', INV ? 'Invoice number' : 'Estimate number', 'text') + fld('date', INV ? 'Invoice date' : 'Date', 'date') + (INV ? fld('work', 'Work dates', 'text') : '') + '</fieldset>' +
        '<fieldset class="calc-group"><legend>Line items</legend><div class="field wide"><div class="quote-items">' + itemsHtml() + '</div><button type="button" class="btn btn-ghost add-row" data-qadd>' + ICON.plus + 'Add a line</button></div></fieldset>' +
        '<fieldset class="calc-group"><legend>Terms</legend>' + fld('tax', INV ? 'Sales tax on items marked Taxed' : 'Sales tax', 'pct') + (INV ? fld('paid', 'Deposit already paid', 'money') + fld('due', 'Due in (days)', 'number') : fld('deposit', 'Deposit', 'pct') + fld('valid', 'Valid for (days)', 'number')) + fld('notes', 'Notes and terms', 'textarea') + '</fieldset>' +
        '</form><div class="calc-out"><div data-qpv>' + preview() + '</div><div class="calc-actions"><button type="button" class="btn btn-tape" data-qprint>' + ICON.print + 'Print or save as PDF</button><button type="button" class="btn btn-ghost" data-qreset>' + ICON.reset + 'Start over</button></div>' +
        '<p class="result-note">Everything stays in this browser. Nothing is sent to us.</p></div></div>';
    }
    function refresh() { var pv = el.querySelector('[data-qpv]'); if (pv) pv.innerHTML = preview(); store(KEY, s); }
    render();
    el.addEventListener('input', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-q')) { s[t.getAttribute('data-q')] = t.value; refresh(); }
      else if (t.hasAttribute('data-it')) { s.items[+t.getAttribute('data-it')][t.getAttribute('data-p')] = t.type === 'checkbox' ? t.checked : t.value; refresh(); }
    });
    el.addEventListener('change', function (e) {
      var t = e.target;
      if (t.type === 'checkbox' && t.hasAttribute('data-it')) { s.items[+t.getAttribute('data-it')].t = t.checked; refresh(); }
    });
    el.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('button') : null;
      if (!t) return;
      if (t.hasAttribute('data-qadd')) { s.items.push({ d: '', q: 1, p: 0, t: INV }); render(); refresh(); var last = el.querySelector('[data-it="' + (s.items.length - 1) + '"][data-p="d"]'); if (last) last.focus(); }
      else if (t.hasAttribute('data-qdel')) { s.items.splice(+t.getAttribute('data-qdel'), 1); if (!s.items.length) s.items.push({ d: '', q: 1, p: 0 }); render(); refresh(); }
      else if (t.hasAttribute('data-qreset')) { if (window.confirm('Clear this ' + WORD + ' and start over?')) { s = blank(); render(); refresh(); } }
      else if (t.hasAttribute('data-qprint')) { document.body.classList.add('print-quote'); window.print(); setTimeout(function () { document.body.classList.remove('print-quote'); }, 500); }
      else if (t.hasAttribute('data-cur')) { ctx.cur = t.getAttribute('data-cur'); store('pck:cur', ctx.cur); render(); refresh(); }
    });
  }

  function boot() {
    var els = document.querySelectorAll('.calc[data-calc]');
    for (var i = 0; i < els.length; i++) {
      try { new Calc(els[i]); } catch (e) { els[i].innerHTML = '<p class="calc-loading">This calculator could not load. Refresh the page to try again.</p>'; if (window.console) console.error(e); }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof self !== 'undefined' ? self : this);
