(function () {
  'use strict';

  const SCRIPT = {
    name: 'Frontline Stacks Planner',
    version: 'v2.0 - FIX: leitura correta de colunas',
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

  const style = `
    #${SCRIPT.prefix}{ border:1px solid #603000; background:#f4e4bc; margin:10px 0 15px; }
    #${SCRIPT.prefix} *{ box-sizing:border-box; }
    #${SCRIPT.prefix} .hdr{ background:#c1a264 url(/graphic/screen/tableheader_bg3.png) repeat-x; padding:10px; display:flex; align-items:center; justify-content:space-between; }
    #${SCRIPT.prefix} .hdr h3{ margin:0; padding:0; font-size:18px; }
    #${SCRIPT.prefix} .sub{ padding:8px 10px; font-size:13px; opacity:.9; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    #${SCRIPT.prefix} .pill{ padding:2px 8px; border:1px solid #8a6a2f; background:#f7ebcf; border-radius:999px; font-weight:700; font-size:12px; }
    #${SCRIPT.prefix} .body{ padding:10px; }
    #${SCRIPT.prefix} label{ display:block; font-weight:700; margin:0 0 6px; font-size:14px; }
    #${SCRIPT.prefix} input[type="text"], #${SCRIPT.prefix} input[type="number"]{
      width:100%; padding:7px 8px; font-size:14px; line-height:1.1;
    }
    #${SCRIPT.prefix} .grid4{ display:grid; grid-template-columns: 1.4fr .6fr .6fr .8fr; gap:12px; }
    #${SCRIPT.prefix} .gridReq{ display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; align-items:end; }
    #${SCRIPT.prefix} .unitBox{ display:flex; gap:8px; align-items:center; }
    #${SCRIPT.prefix} .unitBox img{ width:20px; height:20px; }
    #${SCRIPT.prefix} .btnRow{ margin-top:10px; display:flex; gap:10px; flex-wrap:wrap; }
    #${SCRIPT.prefix} .btn{ display:inline-block; padding:4px 10px; font-size:13px; }
    #${SCRIPT.prefix} .tblWrap{ margin-top:12px; max-height:520px; overflow:auto; border:1px solid #bd9c5a; }
    #${SCRIPT.prefix} table{ width:100%; border-collapse:collapse; font-size:14px; }
    #${SCRIPT.prefix} thead th{ position:sticky; top:0; background:#e9d6a9; border-bottom:2px solid #bd9c5a; padding:6px; text-align:left; }
    #${SCRIPT.prefix} tbody td{ border-bottom:2px solid #bd9c5a; padding:8px 6px; vertical-align:top; }
    #${SCRIPT.prefix} .mono{ white-space:pre; font-family:monospace; font-size:12.5px; }
    #${SCRIPT.prefix} .right{ text-align:right; }
    #${SCRIPT.prefix} .small{ font-size:12px; opacity:.9; }
    @media (max-width: 900px){ #${SCRIPT.prefix} .grid4{ grid-template-columns:1fr; } #${SCRIPT.prefix} .gridReq{ grid-template-columns:1fr 1fr; } }

    #${SCRIPT.prefix}_modalMask{ position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:99998; display:none; }
    #${SCRIPT.prefix}_modal{ position:fixed; left:50%; top:10%; transform:translateX(-50%); width:min(820px, 92vw); max-height:78vh; overflow:auto;
      background:#f4e4bc; border:2px solid #603000; z-index:99999; display:none; }
    #${SCRIPT.prefix}_modal .mHdr{ padding:10px; background:#c1a264 url(/graphic/screen/tableheader_bg3.png) repeat-x; display:flex; align-items:center; justify-content:space-between; }
    #${SCRIPT.prefix}_modal .mHdr b{ font-size:16px; }
    #${SCRIPT.prefix}_modal .mBody{ padding:10px; }
    #${SCRIPT.prefix}_modal .mRow{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    #${SCRIPT.prefix}_modal .list{ margin-top:10px; border:1px solid #bd9c5a; background:#fff7e1; }
    #${SCRIPT.prefix}_modal .list .item{ display:flex; align-items:center; gap:10px; padding:8px 10px; border-bottom:1px solid #e0c48b; }
    #${SCRIPT.prefix}_modal .list .item:last-child{ border-bottom:none; }
    #${SCRIPT.prefix}_modal .tag{ font-weight:800; min-width:110px; }
    #${SCRIPT.prefix}_modal .name{ opacity:.9; }
  `;

  function unitImg(unit) { return `/graphic/unit/unit_${unit}.png`; }
  function unitInput(unit, val) {
    return `
      <div>
        <div class="unitBox">
          <img src="${unitImg(unit)}" alt="${unit}" />
          <div style="font-weight:700;">${unit.toUpperCase()}</div>
        </div>
        <input type="number" class="raReq" data-unit="${unit}" value="${val}" />
      </div>
    `;
  }

  function mountUI() {
    const html = `
      <div id="${SCRIPT.prefix}">
        <div class="hdr">
          <h3>${SCRIPT.name}</h3>
          <div class="small"><b>${SCRIPT.version}</b></div>
        </div>
        <div class="sub">
          <span class="pill">member</span>
          <span>lendo <b>"Na aldeia"</b> do overview (inclui apoios)</span>
          <span class="pill" id="raTribesPill">tribos: (nenhuma)</span>
          <a class="btn" href="javascript:void(0)" id="raPickTribes">Selecionar tribos</a>
        </div>
        <div class="body">
          <div class="grid4">
            <div>
              <label>Tribos inimigas (selecionadas)</label>
              <input id="raEnemyTags" type="text" placeholder="(use o botão Selecionar tribos)" disabled />
            </div>
            <div>
              <label>Distance</label>
              <input id="raDistance" type="number" value="${DEFAULT.distance}" />
            </div>
            <div>
              <label>Stack Limit (k)</label>
              <input id="raStackLimit" type="number" value="${DEFAULT.stackLimitK}" />
            </div>
            <div>
              <label>Scale down per field (k)</label>
              <input id="raScaleDown" type="number" value="${DEFAULT.scaleDownPerFieldK}" />
            </div>
          </div>

          <div style="margin-top:12px;">
            <label>Required Stack Amount</label>
            <div class="gridReq">
              ${unitInput('spear', DEFAULT.req.spear)}
              ${unitInput('sword', DEFAULT.req.sword)}
              ${unitInput('heavy', DEFAULT.req.heavy)}
              ${unitInput('spy', DEFAULT.req.spy)}
            </div>
          </div>

          <div class="btnRow">
            <a class="btn" href="javascript:void(0)" id="raCalc">Calculate Stacks</a>
            <a class="btn" href="javascript:void(0)" id="raExport">Export</a>
          </div>

          <div class="tblWrap" id="raOut" style="display:none;"></div>
        </div>
      </div>

      <div id="${SCRIPT.prefix}_modalMask"></div>
      <div id="${SCRIPT.prefix}_modal">
        <div class="mHdr">
          <b>Selecionar tribos inimigas (multi)</b>
          <a class="btn" href="javascript:void(0)" id="raCloseModal">Fechar</a>
        </div>
        <div class="mBody">
          <div class="mRow">
            <div style="flex:1; min-width:220px;">
              <label>Filtrar</label>
              <input id="raTribeFilter" type="text" placeholder="ex: [BO] / -B.O- / nome..." />
            </div>
            <div style="display:flex; gap:10px; align-items:flex-end;">
              <a class="btn" href="javascript:void(0)" id="raSelectAllShown">Marcar exibidas</a>
              <a class="btn" href="javascript:void(0)" id="raClearAll">Limpar</a>
              <a class="btn" href="javascript:void(0)" id="raApplyTribes"><b>Aplicar</b></a>
            </div>
          </div>
          <div class="small" style="margin-top:6px;">Mostrando tags como <b>[TAG]</b> sem confundir BO com -B.O-.</div>
          <div class="list" id="raTribeList"></div>
        </div>
      </div>

      <style>${style}</style>
    `;

    const $container = $('#contentContainer');
    if ($container.length) $container.prepend(html);
    else $('#content_value').prepend(html);
  }

  const LS_KEY = `${SCRIPT.prefix}:selectedTags`;
  function loadSelectedTags() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch { return []; }
  }
  function saveSelectedTags(tags) {
    localStorage.setItem(LS_KEY, JSON.stringify(tags || []));
  }

  function normalizeTag(t) {
    return String(t || '')
      .replace(/^\uFEFF/, '')
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim()
      .toUpperCase()
      .replace(/[\[\]\s]/g, '')
      .replace(/[^A-Z0-9.\-]/g, '');
  }

  function displayTag(tagNormalized) {
    const t = normalizeTag(tagNormalized);
    return t ? `[${t}]` : '';
  }

  let selectedTags = loadSelectedTags().map(normalizeTag).filter(Boolean);

  function updateSelectedTagsUI() {
    const text = selectedTags.length ? selectedTags.map(displayTag).join(', ') : '(nenhuma)';
    $('#raEnemyTags').val(text);
    $('#raTribesPill').text(`tribos: ${selectedTags.length ? selectedTags.map(displayTag).join(', ') : '(nenhuma)'}`);
  }

  // ========= Overview reader =========
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

  function findVillageHeaderAbove(rows, idx) {
    for (let j = idx; j >= 0 && j >= idx - 12; j--) {
      const $r = rows[j];
      const text = $r.text().replace(/\s+/g, ' ').trim();
      const cm = text.match(coordsRegex);
      if (!cm) continue;

      const coords = cm[0];
      const vid = extractVillageIdFromRow($r);

      let name = '';
      const $bestLink = $r.find('a').filter((_, a) => {
        const h = $(a).attr('href') || '';
        return h.includes('village=') || h.includes('info_village');
      }).first();
      if ($bestLink.length) name = ($bestLink.text() || '').trim();
      if (!name) {
        name = text.split(coords)[0].trim();
        if (!name) name = `Vila ${coords}`;
      }
      return { id: vid || 0, name, coords };
    }
    return null;
  }

  // ✅ FIX DEFINITIVO: Header tem offset +1 em relação à linha "Na aldeia"
  function readTroopsFromNaAldeiaRow($r, $table) {
    const troops = {};
    const units = (game_data && Array.isArray(game_data.units) && game_data.units.length)
      ? game_data.units.slice()
      : ['spear','sword','axe','archer','spy','light','marcher','heavy','ram','catapult','knight','snob'];

    // Procura a linha de header com ícones de unidades
    const $headerRow = $table.find('tr').filter(function() {
      return $(this).find('img[src*="/graphic/unit/unit_"]').length >= 8;
    }).first();

    if (!$headerRow.length) {
      console.warn('Header não encontrado, usando fallback');
      return readTroopsFromNaAldeiaRow_FALLBACK($r, units);
    }

    // Mapeia cada unidade para sua coluna no HEADER
    const unitColumnMap = {};
    $headerRow.find('th, td').each(function(colIdx) {
      const $img = $(this).find('img[src*="/graphic/unit/unit_"]');
      if ($img.length) {
        const src = $img.attr('src') || '';
        // Aceita tanto .png quanto .webp
        const match = src.match(/unit_(\w+)\.(png|webp)/);
        if (match) {
          unitColumnMap[match[1]] = colIdx;
        }
      }
    });

    // CRITICAL: O header tem 1 coluna a mais no início
    // Header:    [Aldeia][vazio][spear][sword][axe]...
    // Na aldeia: [Na Aldeia][spear][sword][axe]...
    // Então spear está na col 2 do header, mas col 1 da linha "Na aldeia"
    
    const $cells = $r.children('td');
    
    for (const unit of units) {
      const headerCol = unitColumnMap[unit];
      if (headerCol !== undefined) {
        // Ajusta o offset: linha "Na aldeia" tem 1 coluna a menos no início
        const dataCol = headerCol - 1;
        if (dataCol >= 0 && dataCol < $cells.length) {
          const txt = $cells.eq(dataCol).text();
          troops[unit] = cleanInt(txt);
        } else {
          troops[unit] = 0;
        }
      } else {
        troops[unit] = 0;
      }
    }

    return troops;
  }

  // Método fallback: começa direto na col 1 (spear)
  function readTroopsFromNaAldeiaRow_FALLBACK($r, units) {
    const troops = {};
    const $cells = $r.children('td');
    
    // Estrutura: [Na Aldeia][spear][sword][axe][spy][light][heavy][ram][catapult][knight][snob][milicia][ação]
    const startCol = 1; // começa direto no spear
    
    for (let i = 0; i < units.length; i++) {
      const colIdx = startCol + i;
      const unit = units[i];
      if (colIdx < $cells.length) {
        const txt = $cells.eq(colIdx).text();
        troops[unit] = cleanInt(txt);
      } else {
        troops[unit] = 0;
      }
    }
    return troops;
  }

  async function fetchMyVillagesFromOverviewNaAldeia() {
    const base = location.origin;
    const url = `${base}/game.php?screen=overview_villages&mode=units&group=0`;

    const html = await fetchText(url);
    const doc = $.parseHTML(html);

    const $t = pickUnitsTableFromHTML(doc);
    if (!$t) throw new Error('Não achei a tabela de tropas no overview.');

    const rows = $t.find('tr').toArray().map((r) => $(r));
    const villagesByKey = new Map();

    for (let i = 0; i < rows.length; i++) {
      const $r = rows[i];
      if (!isNaAldeiaRow($r)) continue;

      const vh = findVillageHeaderAbove(rows, i);
      if (!vh) continue;

      const troops = readTroopsFromNaAldeiaRow($r, $t);

      // DEBUG: loga a primeira vila com tropas
      if (villagesByKey.size === 0 && (troops.spear > 0 || troops.sword > 0)) {
        console.log('DEBUG primeira vila:', vh.coords);
        console.log('  spear:', troops.spear);
        console.log('  sword:', troops.sword);
        console.log('  axe:', troops.axe);
        console.log('  heavy:', troops.heavy);
      }

      const key = vh.id ? `id:${vh.id}` : `c:${vh.coords}`;
      villagesByKey.set(key, {
        villageId: vh.id || 0,
        villageName: vh.name,
        villageCoords: vh.coords,
        troops,
      });
    }

    const villages = Array.from(villagesByKey.values());
    if (!villages.length) throw new Error('Não consegui ler suas vilas no overview.');
    return villages;
  }

  async function fetchWorldData() {
    const base = location.origin;
    const [villTxt, plyTxt, allyTxt] = await Promise.all([
      fetchText(`${base}/map/village.txt`),
      fetchText(`${base}/map/player.txt`),
      fetchText(`${base}/map/ally.txt`),
    ]);
    return { worldVillages: parseCSV(villTxt), players: parseCSV(plyTxt), allies: parseCSV(allyTxt) };
  }

  function tribeIdsFromSelectedTags(allies, tags) {
    const wanted = new Set((tags || []).map(normalizeTag).filter(Boolean));
    return allies
      .filter((a) => a[0] && a[2] && wanted.has(normalizeTag(a[2])))
      .map((a) => Number(a[0]))
      .filter(Boolean);
  }

  function playerIdsFromTribeIds(players, tribeIds) {
    const set = new Set(tribeIds.map(Number));
    return players
      .filter((p) => p[0] && set.has(Number(p[2])))
      .map((p) => Number(p[0]))
      .filter(Boolean);
  }

  function coordsFromPlayerIds(worldVillages, playerIds) {
    const set = new Set(playerIds.map(Number));
    return worldVillages
      .filter((v) => v[0] && set.has(Number(v[4])))
      .map((v) => `${v[2]}|${v[3]}`);
  }

  function calcPop(troops) {
    let total = 0;
    for (const [u, n] of Object.entries(troops || {})) {
      if (!n) continue;
      total += (UNITS_POP[u] != null ? UNITS_POP[u] : 0) * n;
    }
    return total;
  }

  function calculateMissingTroops(troops, req, fieldsAway, scaleDownK) {
    const missing = {};
    const distance = Math.max(0, Math.floor(fieldsAway) - 1);
    const scale = distance * (Number(scaleDownK) || 0) * 1000;

    for (const [unit, needRaw] of Object.entries(req)) {
      const need = Number(needRaw) || 0;
      if (need <= 0) continue;

      const nonScaling = (unit === 'spy' || unit === 'heavy');
      const effectiveNeed = nonScaling ? need : Math.max(0, need - scale);

      const have = Number(troops[unit]) || 0;
      missing[unit] = effectiveNeed > have ? (effectiveNeed - have) : 0;
    }
    return missing;
  }

  function shouldIncludeVillage(troops, req, stackLimitK) {
    const pop = calcPop(troops);
    const limit = (Number(stackLimitK) || 0) * 1000;

    let anyUnitBelow = false;
    for (const [u, need] of Object.entries(req)) {
      const n = Number(need) || 0;
      if (n <= 0) continue;
      if ((Number(troops[u]) || 0) < n) anyUnitBelow = true;
    }
    const belowPop = limit > 0 ? pop < limit : false;
    return anyUnitBelow || belowPop;
  }

  function missingString(missing) {
    const lines = [];
    for (const [u, v] of Object.entries(missing)) {
      if ((Number(v) || 0) > 0) lines.push(`${u}: ${v}`);
    }
    return lines.length ? lines.join('\n') : 'OK';
  }

  function renderTable(rows) {
    const body = rows.map((v, i) => {
      const miss = missingString(v.missingTroops);
      const link = v.villageId ? `/game.php?screen=info_village&id=${v.villageId}` : '#';
      return `
        <tr>
          <td class="right"><b>${i + 1}</b></td>
          <td>
            <div>${v.villageId ? `<a href="${link}" target="_blank" rel="noreferrer noopener"><b>${v.villageName}</b></a>` : `<b>${v.villageName}</b>`}</div>
            <div class="small">${v.villageCoords}</div>
          </td>
          <td class="right"><b>${intToK(v.pop)}</b></td>
          <td class="right">${v.fieldsAway}</td>
          <td class="mono">${miss}</td>
        </tr>
      `;
    }).join('');

    return `
      <table>
        <thead>
          <tr>
            <th style="width:56px;">#</th>
            <th>Village</th>
            <th style="width:110px;" class="right">Pop.</th>
            <th style="width:110px;" class="right">Distance</th>
            <th style="width:320px;">Missing Troops</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }

  function buildBBCode(rows) {
    let bb = `[table][**]#[||]Village[||]Missing Troops[||]Distance[/**]\n`;
    rows.forEach((r, idx) => {
      const miss = missingString(r.missingTroops).replace(/\n/g, ' / ');
      bb += `[*]${idx + 1}[|] ${r.villageCoords} [|]${miss}[|]${r.fieldsAway}\n`;
    });
    bb += `[/table]`;
    return bb;
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  function readInputs() {
    const distance = Math.max(0, Number($('#raDistance').val()) || 0);
    const stackLimitK = Math.max(0, Number($('#raStackLimit').val()) || 0);
    const scaleDownK = Math.max(0, Number($('#raScaleDown').val()) || 0);

    if (!selectedTags.length) return { error: 'Selecione ao menos 1 tribo inimiga (botão "Selecionar tribos").' };

    const req = {};
    $('.raReq').each(function () {
      const u = $(this).data('unit');
      req[u] = Math.max(0, Number($(this).val()) || 0);
    });

    return { tags: selectedTags.slice(), distance, stackLimitK, scaleDownK, req };
  }

  let cachedAllies = null;
  let alliesLoaded = false;

  function openModal() {
    $('#'+SCRIPT.prefix+'_modalMask').show();
    $('#'+SCRIPT.prefix+'_modal').show();
    $('#raTribeFilter').val('').focus();
    renderTribeList();
  }
  function closeModal() {
    $('#'+SCRIPT.prefix+'_modalMask').hide();
    $('#'+SCRIPT.prefix+'_modal').hide();
  }

  function renderTribeList() {
    if (!cachedAllies) {
      $('#raTribeList').html(`<div class="item">Carregando ally.txt...</div>`);
      return;
    }

    const qRaw = ($('#raTribeFilter').val() || '').trim();
    const q = normalizeTag(qRaw);
    const items = [];

    for (const a of cachedAllies) {
      const id = a[0];
      const name = a[1] || '';
      const tagRaw = a[2] || '';
      const tag = normalizeTag(tagRaw);
      if (!id || !tag) continue;

      if (q) {
        const hay = `${tag} ${String(name).toUpperCase()}`;
        if (!hay.includes(q)) continue;
      }

      const checked = selectedTags.includes(tag) ? 'checked' : '';
      items.push(`
        <div class="item">
          <input type="checkbox" class="raTribeChk" data-tag="${tag}" ${checked}/>
          <div class="tag">${displayTag(tag)}</div>
          <div class="name">${name}</div>
        </div>
      `);
    }

    if (!items.length) {
      $('#raTribeList').html(`<div class="item">Nada encontrado.</div>`);
      return;
    }

    $('#raTribeList').html(items.join(''));
  }

  async function ensureAlliesLoaded() {
    if (alliesLoaded) return;
    const base = location.origin;
    const allyTxt = await fetchText(`${base}/map/ally.txt`);
    cachedAllies = parseCSV(allyTxt);
    alliesLoaded = true;
  }

  let lastRows = [];

  async function calculate() {
    const input = readInputs();
    if (input.error) return msgErr(input.error);

    msgInfo('Lendo suas vilas no overview (Na aldeia)...');
    const myVillages = await fetchMyVillagesFromOverviewNaAldeia();

    msgInfo('Carregando dados do mundo (tribos/jogadores/vilas)...');
    const { worldVillages, players, allies } = await fetchWorldData();

    const tribeIds = tribeIdsFromSelectedTags(allies, input.tags);
    if (!tribeIds.length) {
      msgErr('Nenhuma das tribos selecionadas foi encontrada no ally.txt. Abra o seletor e escolha novamente.');
      await ensureAlliesLoaded();
      openModal();
      return;
    }

    const enemyPlayers = playerIdsFromTribeIds(players, tribeIds);
    const enemyCoords = coordsFromPlayerIds(worldVillages, enemyPlayers);
    if (!enemyCoords.length) {
      msgErr('Não consegui obter coords das vilas inimigas (tribos selecionadas).');
      return;
    }

    const rows = [];
    for (const v of myVillages) {
      let minD = Infinity;
      for (const ec of enemyCoords) {
        const d = dist(ec, v.villageCoords);
        if (d < minD) minD = d;
      }
      if (!(minD <= input.distance)) continue;

      const troops = v.troops || {};
      const pop = calcPop(troops);

      if (!shouldIncludeVillage(troops, input.req, input.stackLimitK)) continue;

      const missingTroops = calculateMissingTroops(troops, input.req, minD, input.scaleDownK);

      rows.push({
        ...v,
        fieldsAway: Math.round(minD * 100) / 100,
        troops,
        pop,
        missingTroops,
      });
    }

    rows.sort((a, b) => a.fieldsAway - b.fieldsAway);

    if (!rows.length) {
      lastRows = [];
      $('#raOut').hide().empty();
      return msgOk('Nenhuma vila dentro do raio precisando stack (pelos parâmetros atuais).');
    }

    lastRows = rows;
    $('#raOut').html(renderTable(rows)).show();
    msgOk(`OK — ${rows.length} vilas para revisar.`);
  }

  function bind() {
    $('#raCalc').on('click', async (e) => {
      e.preventDefault();
      try { await calculate(); }
      catch (err) {
        console.error(err);
        msgErr(err && err.message ? err.message : 'Erro ao calcular.');
      }
    });

    $('#raExport').on('click', (e) => {
      e.preventDefault();
      if (!lastRows.length) return msgErr('Nada para exportar.');
      copyToClipboard(buildBBCode(lastRows));
      msgOk('BBCode copiado!');
    });

    $('#raPickTribes').on('click', async (e) => {
      e.preventDefault();
      try {
        await ensureAlliesLoaded();
        openModal();
      } catch (err) {
        console.error(err);
        msgErr('Falha ao carregar ally.txt.');
      }
    });

    $('#raCloseModal, #'+SCRIPT.prefix+'_modalMask').on('click', (e) => {
      e.preventDefault();
      closeModal();
    });

    $('#raTribeFilter').on('input', () => renderTribeList());

    $('#raSelectAllShown').on('click', (e) => {
      e.preventDefault();
      $('#raTribeList .raTribeChk').each(function () { $(this).prop('checked', true); });
    });

    $('#raClearAll').on('click', (e) => {
      e.preventDefault();
      $('#raTribeList .raTribeChk').each(function () { $(this).prop('checked', false); });
    });

    $('#raApplyTribes').on('click', (e) => {
      e.preventDefault();
      const tags = [];
      $('#raTribeList .raTribeChk:checked').each(function () {
        tags.push(normalizeTag($(this).data('tag') || ''));
      });
      selectedTags = Array.from(new Set(tags)).filter(Boolean).sort();
      saveSelectedTags(selectedTags);
      updateSelectedTagsUI();
      closeModal();
      msgOk(`Tribos aplicadas: ${selectedTags.length ? selectedTags.map(displayTag).join(', ') : '(nenhuma)'}`);
    });
  }

  try {
    mountUI();
    updateSelectedTagsUI();
    bind();
    msgInfo('Pronto. Selecione as tribos e clique em "Calculate Stacks".');
  } catch (e) {
    console.error(e);
    msgErr('Falha ao iniciar o script.');
  }
})();
