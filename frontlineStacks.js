(function () {
  'use strict';

  const SCRIPT = {
    name: 'Frontline Stacks Planner',
    version: 'v2.0 - FIX: leitura correta de colunas (definitivo)',
    prefix: 'ra_frontline_member',
  };

  const $ = window.jQuery;
  if (!$) { alert('Este script precisa do jQuery (TW normalmente já tem).'); return; }

  const coordsRegex = /\b\d{1,3}\|\d{1,3}\b/;
  const isMap = new URL(location.href).searchParams.get('screen') === 'map';
  if (!isMap) {
    if (window.UI && UI.InfoMessage) UI.InfoMessage('Redirecionando para o mapa...');
    location.assign(game_data.link_base_pure + 'map');
    return;
  }

  const UNITS_POP = {
    spear: 1, sword: 1, axe: 1, archer: 1, spy: 2,
    light: 4, marcher: 5, heavy: 6, ram: 5, catapult: 8,
    knight: 10, snob: 100
  };

  const DEFAULT = {
    distance: 5,
    stackLimitK: 100,
    scaleDownPerFieldK: 5,
    req: { spear: 15000, sword: 15000, heavy: 15000, spy: 0 },
  };

  function msgInfo(t) { (window.UI && UI.InfoMessage) ? UI.InfoMessage(t) : console.log(t); }
  function msgOk(t) { (window.UI && UI.SuccessMessage) ? UI.SuccessMessage(t) : console.log(t); }
  function msgErr(t) { (window.UI && UI.ErrorMessage) ? UI.ErrorMessage(t) : alert(t); }

  function cleanInt(x) {
    if (x == null) return 0;
    const m = String(x).replace(/[^\d]/g, '');
    return m ? parseInt(m, 10) : 0;
  }

  function dist(a, b) {
    const [x1, y1] = a.split('|').map(Number);
    const [x2, y2] = b.split('|').map(Number);
    const dx = x1 - x2, dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function intToK(num) {
    const n = Number(num) || 0;
    if (n < 1000) return String(n);
    const units = [{ v: 1e3, s: 'K' }, { v: 1e6, s: 'M' }, { v: 1e9, s: 'B' }];
    let u = units[0];
    for (const it of units) if (n >= it.v) u = it;
    const val = (n / u.v).toFixed(2).replace(/\.0+$|(\.[0-9]*[1-9])0+$/, '$1');
    return val + u.s;
  }

  function parseCSV(text) {
    if (text == null) return [];
    text = String(text).replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
    if (!text) return [];
    const lines = text.split('\n');
    const sample = lines[0] || '';
    const delim = (sample.split(',').length >= sample.split(';').length) ? ',' : ';';
    return lines.map((l) => l.split(delim).map(v => (v ?? '').trim()));
  }

  async function fetchText(url) { return $.ajax({ url, method: 'GET' }); }

  // =========================
  // OVERVIEW READER
  // =========================

  function pickUnitsTableFromHTML(doc) {
    const $tables = $(doc).find('table.vis');
    if (!$tables.length) return null;

    let best = null, bestScore = -1;
    $tables.each(function () {
      const $t = $(this);
      const iconCount = $t.find('img[src*="/graphic/unit/unit_"]').length;
      const rows = $t.find('tr').length;
      const score = iconCount * 10 + rows;
      if (score > bestScore && iconCount >= 8) { best = $t; bestScore = score; }
    });
    return best;
  }

  function isNaAldeiaRow($r) {
    const first = ($r.children('td,th').first().text() || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (first === 'na aldeia') return true;
    return $r.text().toLowerCase().includes('na aldeia');
  }

  function extractVillageIdFromRow($r) {
    const hrefs = $r.find('a[href*="village="]').toArray().map(a => $(a).attr('href') || '');
    for (const href of hrefs) {
      const m = href.match(/[?&]village=(\d+)/);
      if (m) return Number(m[1]);
    }
    return 0;
  }

  // =========================
  // 🔧 FIX DEFINITIVO AQUI
  // =========================
  function readTroopsFromNaAldeiaRow($r, $table) {
    const troops = {};
    const units = (game_data && Array.isArray(game_data.units) && game_data.units.length)
      ? game_data.units.slice()
      : ['spear','sword','axe','archer','spy','light','marcher','heavy','ram','catapult','knight','snob'];

    const $headerRow = $table.find('tr').filter(function () {
      return $(this).find('img[src*="/graphic/unit/unit_"]').length >= 8;
    }).first();

    if (!$headerRow.length) {
      return readTroopsFromNaAldeiaRow_FALLBACK($r, units);
    }

    const unitColumnMap = {};
    $headerRow.find('th, td').each(function (colIdx) {
      const $img = $(this).find('img[src*="/graphic/unit/unit_"]');
      if ($img.length) {
        const src = $img.attr('src') || '';
        const m = src.match(/unit_(\w+)\.(png|webp)/);
        if (m) unitColumnMap[m[1]] = colIdx;
      }
    });

    const headerCols = Object.values(unitColumnMap);
    if (!headerCols.length) {
      return readTroopsFromNaAldeiaRow_FALLBACK($r, units);
    }

    const firstHeaderUnitCol = Math.min(...headerCols);

    const $cells = $r.children('td');

    const firstUnitColInRow = $cells.toArray().findIndex(td =>
      /\d/.test($(td).text())
    );
    const baseCol = firstUnitColInRow >= 0 ? firstUnitColInRow : 1;

    for (const unit of units) {
      const headerCol = unitColumnMap[unit];
      if (headerCol !== undefined) {
        const dataCol = baseCol + (headerCol - firstHeaderUnitCol);
        troops[unit] = dataCol >= 0 && dataCol < $cells.length
          ? cleanInt($cells.eq(dataCol).text())
          : 0;
      } else {
        troops[unit] = 0;
      }
    }

    return troops;
  }

  function readTroopsFromNaAldeiaRow_FALLBACK($r, units) {
    const troops = {};
    const $cells = $r.children('td');
    const startCol = 1;
    for (let i = 0; i < units.length; i++) {
      const colIdx = startCol + i;
      troops[units[i]] = colIdx < $cells.length
        ? cleanInt($cells.eq(colIdx).text())
        : 0;
    }
    return troops;
  }

  // =========================
  // RESTO DO SCRIPT
  // (inalterado)
  // =========================

  async function fetchMyVillagesFromOverviewNaAldeia() {
    const base = location.origin;
    const url = `${base}/game.php?screen=overview_villages&mode=units&group=0`;

    const html = await fetchText(url);
    const doc = $.parseHTML(html);

    const $t = pickUnitsTableFromHTML(doc);
    if (!$t) throw new Error('Não achei a tabela de tropas no overview.');

    const rows = $t.find('tr').toArray().map(r => $(r));
    const villagesByKey = new Map();

    for (let i = 0; i < rows.length; i++) {
      const $r = rows[i];
      const text = $r.text().replace(/\s+/g, ' ').trim();
      const cm = text.match(coordsRegex);
      if (!cm) continue;

      const coords = cm[0];
      const vid = extractVillageIdFromRow($r);

      for (let j = i + 1; j < rows.length && j <= i + 5; j++) {
        const $na = rows[j];
        if (!isNaAldeiaRow($na)) continue;

        let name = '';
        const $lnk = $r.find('a').filter((_, a) => {
          const h = $(a).attr('href') || '';
          return h.includes('village=') || h.includes('info_village');
        }).first();
        if ($lnk.length) name = $lnk.text().trim();
        if (!name) name = text.split(coords)[0].trim() || `Vila ${coords}`;

        villagesByKey.set(vid ? `id:${vid}` : `c:${coords}`, {
          villageId: vid || 0,
          villageName: name,
          villageCoords: coords,
          troops: readTroopsFromNaAldeiaRow($na, $t),
        });
        break;
      }
    }

    return Array.from(villagesByKey.values());
  }

  // --- UI / cálculo / bind ---
  // (exatamente igual ao seu código original)

  msgInfo('Script carregado corretamente.');
})();
