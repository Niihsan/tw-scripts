/* 
 * Frontline Stacks Planner (Member Edition) — BR138
 * Fixes:
 *  - Lê overview por ícones (sem colunas puladas)
 *  - Lê "Na aldeia" (inclui apoios)
 *  - Robustez: tenta /overview_villages e /overview, e resolve vila via "linha Na aldeia" + header acima
 */

(function () {
  'use strict';

  const SCRIPT = {
    name: 'Frontline Stacks Planner',
    version: 'v.member-BR138-overview-fallback',
    prefix: 'ra_frontline_member_br138',
  };

  const $ = window.jQuery;
  if (!$) {
    alert('Este script precisa do jQuery (normalmente o TW já tem).');
    return;
  }

  const coordsRegex = /\d{1,3}\|\d{1,3}/;
  const isMap = new URL(location.href).searchParams.get('screen') === 'map';
  if (!isMap) {
    if (window.UI && UI.InfoMessage) UI.InfoMessage('Redirecionando para o mapa...');
    location.assign(game_data.link_base_pure + 'map');
    return;
  }

  // ======= Configs =======
  const UNITS_POP = {
    spear: 1,
    sword: 1,
    axe: 1,
    archer: 1,
    spy: 2,
    light: 4,
    marcher: 5,
    heavy: 6,
    ram: 5,
    catapult: 8,
    knight: 10,
    snob: 100,
  };

  const DEFAULT = {
    distance: 5,
    stackLimitK: 100,
    scaleDownPerFieldK: 5,
    req: {
      spear: 15000,
      sword: 15000,
      heavy: 500,
      spy: 0,
    },
  };

  // ======= Helpers =======
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
    return text.trim().split('\n').map((l) => l.split(','));
  }

  async function fetchText(url) {
    return $.ajax({ url, method: 'GET' });
  }

  // ======= UI =======
  const style = `
    #${SCRIPT.prefix}{ border:1px solid #603000; background:#f4e4bc; margin:10px 0 15px; }
    #${SCRIPT.prefix} *{ box-sizing:border-box; }
    #${SCRIPT.prefix} .hdr{ background:#c1a264 url(/graphic/screen/tableheader_bg3.png) repeat-x; padding:10px; display:flex; align-items:center; justify-content:space-between; }
    #${SCRIPT.prefix} .hdr h3{ margin:0; padding:0; font-size:18px; }
    #${SCRIPT.prefix} .sub{ padding:8px 10px; font-size:13px; opacity:.9; }
    #${SCRIPT.prefix} .body{ padding:10px; }
    #${SCRIPT.prefix} label{ display:block; font-weight:700; margin:0 0 6px; font-size:14px; }
    #${SCRIPT.prefix} input[type="text"], #${SCRIPT.prefix} input[type="number"]{
      width:100%; padding:7px 8px; font-size:14px; line-height:1.1;
    }
    #${SCRIPT.prefix} .grid4{ display:grid; grid-template-columns: 1.4fr .6fr .6fr .8fr; gap:12px; }
    #${SCRIPT.prefix} .gridReq{ display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; align-items:end; }
    #${SCRIPT.prefix} .unitBox{ display:flex; gap:8px; align-items:center; }
    #${SCRIPT.prefix} .unitBox img{ width:20px; height:20px; }
    #${SCRIPT.prefix} .btnRow{ margin-top:10px; display:flex; gap:10px; }
    #${SCRIPT.prefix} .btn{ display:inline-block; padding:4px 10px; font-size:13px; }
    #${SCRIPT.prefix} .tblWrap{ margin-top:12px; max-height:520px; overflow:auto; border:1px solid #bd9c5a; }
    #${SCRIPT.prefix} table{ width:100%; border-collapse:collapse; font-size:14px; }
    #${SCRIPT.prefix} thead th{ position:sticky; top:0; background:#e9d6a9; border-bottom:2px solid #bd9c5a; padding:6px; text-align:left; }
    #${SCRIPT.prefix} tbody td{ border-bottom:2px solid #bd9c5a; padding:8px 6px; vertical-align:top; }
    #${SCRIPT.prefix} .mono{ white-space:pre; font-family:monospace; font-size:12.5px; }
    #${SCRIPT.prefix} .right{ text-align:right; }
    #${SCRIPT.prefix} .small{ font-size:12px; opacity:.9; }
    @media (max-width: 900px){ #${SCRIPT.prefix} .grid4{ grid-template-columns:1fr; } #${SCRIPT.prefix} .gridReq{ grid-template-columns:1fr 1fr; } }
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
        <div class="sub">member • lendo <b>"Na aldeia"</b> do overview (inclui apoios) • leitura por ícones • fallback para overview alternativo</div>
        <div class="body">
          <div class="grid4">
            <div>
              <label>Select enemy tribes</label>
              <input id="raEnemyTags" type="text" placeholder="Ex: [BO], [TAG2]" />
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
      <style>${style}</style>
    `;

    const $container = $('#contentContainer');
    if ($container.length) $container.prepend(html);
    else $('#content_value').prepend(html);
  }

  function readInputs() {
    const tagsRaw = ($('#raEnemyTags').val() || '').trim();
    const distance = Math.max(0, Number($('#raDistance').val()) || 0);
    const stackLimitK = Math.max(0, Number($('#raStackLimit').val()) || 0);
    const scaleDownK = Math.max(0, Number($('#raScaleDown').val()) || 0);

    if (!tagsRaw) return { error: 'Você precisa informar ao menos uma tag inimiga (ex: BO).' };

    const tags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => t.replace(/^\[|\]$/g, '').replace(/[\[\]]/g, '').trim());

    const req = {};
    $('.raReq').each(function () {
      const u = $(this).data('unit');
      req[u] = Math.max(0, Number($(this).val()) || 0);
    });

    return { tags, distance, stackLimitK, scaleDownK, req };
  }

  // ======= Core: ler overview robusto =======
  function pickUnitsTableFromHTML(doc) {
    // Pega a tabela "mais provável": tem thead com ícones de unidades.
    const $tables = $(doc).find('table.vis');
    if (!$tables.length) return null;

    let best = null;
    let bestScore = -1;

    $tables.each(function () {
      const $t = $(this);
      const iconCount = $t.find('thead img[src*="/graphic/unit/unit_"]').length;
      const hasBody = $t.find('tbody tr').length;
      const score = iconCount * 10 + hasBody;
      if (score > bestScore && iconCount >= 6) {
        best = $t;
        bestScore = score;
      }
    });

    return best;
  }

  function buildUnitColumnMap($t) {
    const unitColIdx = {};
    const headerCells = $t.find('thead tr').first().children();
    headerCells.each(function (i) {
      const $img = $(this).find('img[src*="/graphic/unit/unit_"]').first();
      if ($img.length) {
        const src = $img.attr('src') || '';
        const m = src.match(/unit_([a-z_]+)\.(png|webp)/i);
        if (m) unitColIdx[m[1]] = i;
      }
    });
    return unitColIdx;
  }

  function isNaAldeiaRow($r) {
    // Checa a PRIMEIRA célula de texto (muda conforme mundo/idioma)
    const txt = ($r.children('td').first().text() || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (txt === 'na aldeia') return true;
    // fallback: qualquer célula contendo "na aldeia"
    return $r.text().toLowerCase().includes('na aldeia');
  }

  function findVillageHeaderAbove(rows, idx) {
    // Sobe procurando um <a ... screen=info_village ...> com coords na mesma linha
    for (let j = idx; j >= 0 && j >= idx - 8; j--) {
      const $r = rows[j];
      const $link =
        $r.find('a[href*="screen=info_village"]').first().length
          ? $r.find('a[href*="screen=info_village"]').first()
          : $r.find('a[href*="info_village"]').first();

      if ($link.length) {
        const href = $link.attr('href') || '';
        let id = 0;
        try { id = Number(new URL(href, location.origin).searchParams.get('id') || 0); } catch {}
        const text = $r.text().replace(/\s+/g, ' ').trim();
        const cm = text.match(coordsRegex);
        if (id && cm) {
          const coords = cm[0];
          const name = ($link.text() || '').trim() || `Vila ${coords}`;
          return { id, name, coords };
        }
      }
    }
    return null;
  }

  function readTroopsFromRow($r, unitColIdx) {
    const tds = $r.children('td');
    const troops = {};
    Object.keys(unitColIdx).forEach((unit) => {
      const idx = unitColIdx[unit];
      const $cell = tds.eq(idx);
      troops[unit] = cleanInt($cell.text());
    });
    return troops;
  }

  async function fetchOverviewDocTry(url) {
    const html = await fetchText(url);
    return $.parseHTML(html);
  }

  async function fetchMyVillagesFromOverviewNaAldeia() {
    // tenta os 2 overviews (porque o TW alterna)
    // também força group=0 (todas) pra evitar vir vazio
    const sitterParam = (game_data.player && game_data.player.sitter > 0) ? `&t=${game_data.player.id}` : '';

    const candidates = [
      `/game.php?screen=overview_villages&mode=units&group=0${sitterParam}`,
      `/game.php?screen=overview&mode=units&group=0${sitterParam}`,
      `/game.php?screen=overview_villages&mode=units${sitterParam}`,
      `/game.php?screen=overview&mode=units${sitterParam}`,
    ];

    let lastErr = null;

    for (const url of candidates) {
      try {
        const doc = await fetchOverviewDocTry(url);
        const $t = pickUnitsTableFromHTML(doc);
        if (!$t) throw new Error('Não achei tabela vis com ícones de unidades.');

        const unitColIdx = buildUnitColumnMap($t);

        // precisamos destas unidades no cabeçalho
        const must = ['spear', 'sword', 'heavy'];
        const miss = must.filter((u) => unitColIdx[u] == null);
        if (miss.length) throw new Error(`Cabeçalho sem colunas: ${miss.join(', ')}`);

        const rows = $t.find('tbody tr').toArray().map((r) => $(r));
        const villagesById = new Map();

        for (let i = 0; i < rows.length; i++) {
          const $r = rows[i];
          if (!isNaAldeiaRow($r)) continue;

          const vh = findVillageHeaderAbove(rows, i);
          if (!vh) continue;

          const troops = readTroopsFromRow($r, unitColIdx);
          if (!troops || (Object.values(troops).reduce((a, b) => a + b, 0) === 0)) {
            // ainda assim pode ser vila vazia; aceita (mas evita duplicates)
          }

          villagesById.set(vh.id, {
            villageId: vh.id,
            villageName: vh.name,
            villageCoords: vh.coords,
            troops,
          });
        }

        const villages = Array.from(villagesById.values());
        if (!villages.length) throw new Error('Não encontrei nenhuma linha "Na aldeia" associada a uma vila.');

        return villages;
      } catch (e) {
        lastErr = e;
        // tenta o próximo
      }
    }

    throw new Error(`Não consegui ler suas vilas no overview. (${lastErr ? lastErr.message : 'sem detalhes'})`);
  }

  // ======= World data =======
  async function fetchWorldData() {
    const base = location.origin;
    const [villTxt, plyTxt, allyTxt] = await Promise.all([
      fetchText(`${base}/map/village.txt`),
      fetchText(`${base}/map/player.txt`),
      fetchText(`${base}/map/ally.txt`),
    ]);
    return { villages: parseCSV(villTxt), players: parseCSV(plyTxt), allies: parseCSV(allyTxt) };
  }

  function tribeIdsFromTags(allies, tags) {
    const wanted = new Set(tags.map((t) => t.toLowerCase()));
    return allies
      .filter((a) => a[0] && a[2] && wanted.has(String(a[2]).toLowerCase()))
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

  // ======= Stack logic =======
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

      const effectiveNeed = (unit === 'spy') ? need : Math.max(0, need - scale);
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
      return `
        <tr>
          <td class="right"><b>${i + 1}</b></td>
          <td>
            <div><a href="/game.php?screen=info_village&id=${v.villageId}" target="_blank" rel="noreferrer noopener"><b>${v.villageName}</b></a></div>
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

  // ======= Main =======
  let lastRows = [];

  async function calculate() {
    const input = readInputs();
    if (input.error) return msgErr(input.error);

    msgInfo('Lendo suas vilas no overview (Na aldeia)...');
    const myVillages = await fetchMyVillagesFromOverviewNaAldeia();

    msgInfo('Carregando dados do mundo (tribos/jogadores/vilas)...');
    const { villages: worldVillages, players, allies } = await fetchWorldData();

    const tribeIds = tribeIdsFromTags(allies, input.tags);
    if (!tribeIds.length) return msgErr('Não encontrei nenhuma tribo com essas tags no ally.txt.');

    const enemyPlayers = playerIdsFromTribeIds(players, tribeIds);
    const enemyCoords = coordsFromPlayerIds(worldVillages, enemyPlayers);
    if (!enemyCoords.length) return msgErr('Não consegui obter coordenadas das vilas inimigas (village.txt).');

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
  }

  // init
  try {
    mountUI();
    bind();
    msgInfo('Pronto. Configure e clique em "Calculate Stacks".');
  } catch (e) {
    console.error(e);
    msgErr('Falha ao iniciar o script.');
  }
})();
