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
    weight: { imp: 'lb', met: 'kg', k: 2.204623 }
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
    var el = ctx.el, KEY = 'pck:quote';
    function blank() {
      var d = new Date();
      var iso = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      return {
        biz: '', contact: '', client: '', address: '', number: 'EST-' + String(d.getFullYear()).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2) + '-01', date: iso, valid: 30, tax: 0, deposit: 0,
        items: [{ d: 'Prep: patch, sand and caulk walls', q: 1, p: 250 }, { d: 'Paint walls, 2 coats (living room)', q: 1, p: 850 }, { d: 'Paint and supplies', q: 1, p: 180 }],
        notes: 'Price includes moving and covering furniture and full cleanup. Work can start within two weeks of approval.'
      };
    }
    var s = store(KEY) || blank();
    function money(x) { return makeFmt('imp', ctx.cur).money(x, 2); }
    function totals() {
      var sub = s.items.reduce(function (a, it) { return a + (parseFloat(it.q) || 0) * (parseFloat(it.p) || 0); }, 0);
      var tax = sub * (parseFloat(s.tax) || 0) / 100;
      var total = sub + tax;
      return { sub: sub, tax: tax, total: total, dep: total * (parseFloat(s.deposit) || 0) / 100 };
    }
    function fld(k, label, type, extra) {
      var id = ctx.uid + '-' + k;
      if (type === 'textarea') return '<div class="field wide"><label for="' + id + '">' + label + '</label><textarea id="' + id + '" data-q="' + k + '">' + esc(s[k]) + '</textarea></div>';
      return '<div class="field' + (extra || '') + '"><label for="' + id + '">' + label + '</label><div class="inp' + (type === 'pct' ? ' has-unit' : '') + '"><input id="' + id + '" data-q="' + k + '" type="' + (type === 'pct' ? 'number' : type) + '" value="' + esc(s[k]) + '"' + (type === 'pct' ? ' min="0" step="any" inputmode="decimal"' : '') + '>' + (type === 'pct' ? '<span class="unit">%</span>' : '') + '</div></div>';
    }
    function itemsHtml() {
      return s.items.map(function (it, i) {
        var p = ctx.uid + '-i' + i;
        return '<div class="q-row"><div class="field"><label for="' + p + 'd">Item ' + (i + 1) + '</label><div class="inp"><input id="' + p + 'd" data-it="' + i + '" data-p="d" value="' + esc(it.d) + '"></div></div>' +
          '<div class="field"><label for="' + p + 'q">Qty</label><div class="inp"><input id="' + p + 'q" type="number" min="0" step="any" inputmode="decimal" data-it="' + i + '" data-p="q" value="' + esc(it.q) + '"></div></div>' +
          '<div class="field"><label for="' + p + 'p">Unit price</label><div class="inp has-pre"><span class="pre">' + makeFmt('imp', ctx.cur).sym + '</span><input id="' + p + 'p" type="number" min="0" step="any" inputmode="decimal" data-it="' + i + '" data-p="p" value="' + esc(it.p) + '"></div></div>' +
          '<button type="button" class="icon-btn" data-qdel="' + i + '" aria-label="Remove item ' + (i + 1) + '">' + ICON.del + '</button></div>';
      }).join('');
    }
    function preview() {
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
      el.innerHTML = '<div class="calc-top"><p class="calc-title">' + (icoSvg ? '<span class="tool-ico">' + icoSvg + '</span>' : '') + 'Free estimate builder</p>' + ctx.switches() + '</div>' +
        '<div class="calc-body"><form class="calc-form" novalidate onsubmit="return false">' +
        '<fieldset class="calc-group"><legend>Your business</legend>' + fld('biz', 'Business name', 'text') + '<div class="field"><label for="' + ctx.uid + '-contact">Phone, email, license</label><div class="inp"><input id="' + ctx.uid + '-contact" data-q="contact" value="' + esc(s.contact) + '"></div></div></fieldset>' +
        '<fieldset class="calc-group"><legend>Client and job</legend>' + fld('client', 'Client name', 'text') + fld('address', 'Job address', 'text') + fld('number', 'Estimate number', 'text') + fld('date', 'Date', 'date') + '</fieldset>' +
        '<fieldset class="calc-group"><legend>Line items</legend><div class="field wide"><div class="quote-items">' + itemsHtml() + '</div><button type="button" class="btn btn-ghost add-row" data-qadd>' + ICON.plus + 'Add a line</button></div></fieldset>' +
        '<fieldset class="calc-group"><legend>Terms</legend>' + fld('tax', 'Sales tax', 'pct') + fld('deposit', 'Deposit', 'pct') + fld('valid', 'Valid for (days)', 'number') + fld('notes', 'Notes and terms', 'textarea') + '</fieldset>' +
        '</form><div class="calc-out"><div data-qpv>' + preview() + '</div><div class="calc-actions"><button type="button" class="btn btn-tape" data-qprint>' + ICON.print + 'Print or save as PDF</button><button type="button" class="btn btn-ghost" data-qreset>' + ICON.reset + 'Start over</button></div>' +
        '<p class="result-note">Everything stays in this browser. Nothing is sent to us.</p></div></div>';
    }
    function refresh() { var pv = el.querySelector('[data-qpv]'); if (pv) pv.innerHTML = preview(); store(KEY, s); }
    render();
    el.addEventListener('input', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-q')) { s[t.getAttribute('data-q')] = t.value; refresh(); }
      else if (t.hasAttribute('data-it')) { s.items[+t.getAttribute('data-it')][t.getAttribute('data-p')] = t.value; refresh(); }
    });
    el.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('button') : null;
      if (!t) return;
      if (t.hasAttribute('data-qadd')) { s.items.push({ d: '', q: 1, p: 0 }); render(); refresh(); var last = el.querySelector('[data-it="' + (s.items.length - 1) + '"][data-p="d"]'); if (last) last.focus(); }
      else if (t.hasAttribute('data-qdel')) { s.items.splice(+t.getAttribute('data-qdel'), 1); if (!s.items.length) s.items.push({ d: '', q: 1, p: 0 }); render(); refresh(); }
      else if (t.hasAttribute('data-qreset')) { if (window.confirm('Clear this estimate and start over?')) { s = blank(); render(); refresh(); } }
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
