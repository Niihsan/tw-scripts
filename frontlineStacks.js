/* 
 * Frontline Stacks Planner (Member Edition) — BR138
 * Fix: leitura do overview por ÍCONES (evita colunas deslocadas)
 * Lê "Na aldeia" (inclui apoios) e inclui heavy (cav. pesada) nos cálculos
 *
 * Como usar:
 * 1) Vá no MAPA
 * 2) Cole e execute
 */

(function () {
  'use strict';

  const SCRIPT = {
    name: 'Frontline Stacks Planner',
    version: 'v.member-BR138-fix-columns+heavy',
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
      heavy: 500, // você estava usando 500 no print — pode mudar
      spy: 0,
    },
  };

  // ======= Helpers =======
  const tt = (s) => s; // PT-BR direto

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
    // simples (map/*.txt do TW é CSV separado por vírgula, sem aspas complexas)
    return text
      .trim()
      .split('\n')
      .map((l) => l.split(','));
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

  function mountUI() {
    const html = `
      <div id="${SCRIPT.prefix}">
        <div class="hdr">
          <h3>${SCRIPT.name}</h3>
          <div class="small"><b>${SCRIPT.version}</b></div>
        </div>
        <div class="sub">member • lendo <b>"Na aldeia"</b> do overview (inclui apoios) • leitura por ícones (sem colunas puladas)</div>
        <div class="body">
          <div class="grid4">
            <div>
              <label>${tt('Select enemy tribes')}</label>
              <input id="raEnemyTags" type="text" placeholder="Ex: [BO], [TAG2]" />
            </div>
            <div>
              <label>${tt('Distance')}</label>
              <input id="raDistance" type="number" value="${DEFAULT.distance}" />
            </div>
            <div>
              <label>${tt('Stack Limit (k)')}</label>
              <input id="raStackLimit" type="number" value="${DEFAULT.stackLimitK}" />
            </div>
            <div>
              <label>${tt('Scale down per field (k)')}</label>
              <input id="raScaleDown" type="number" value="${DEFAULT.scaleDownPerFieldK}" />
            </div>
          </div>

          <div style="margin-top:12px;">
            <label>${tt('Required Stack Amount')}</label>
            <div class="gridReq">
              ${unitInput('spear', DEFAULT.req.spear)}
              ${unitInput('sword', DEFAULT.req.sword)}
              ${unitInput('heavy', DEFAULT.req.heavy)}
              ${unitInput('spy', DEFAULT.req.spy)}
            </div>
          </div>

          <div class="btnRow">
            <a class="btn" href="javascript:void(0)" id="raCalc">${tt('Calculate Stacks')}</a>
            <a class="btn" href="javascript:void(0)" id="raExport">${tt('Export')}</a>
          </div>

          <div class="tblWrap" id="raOut" style="display:none;"></div>
        </div>
      </div>
      <style>${style}</style>
    `;

    const $container = $('#contentContainer');
    if ($container.length) {
      $container.prepend(html);
    } else {
      $('#content_value').prepend(html);
    }
  }

  function unitInput(unit, val) {
    const img = unitImg(unit);
    return `
      <div>
        <div class="unitBox">
          <img src="${img}" alt="${unit}" />
          <div style="font-weight:700;">${unit.toUpperCase()}</div>
        </div>
        <input type="number" class="raReq" data-unit="${unit}" value="${val}" />
      </div>
    `;
  }

  function unitImg(unit) {
    // TW pode usar png/webp; tentamos webp primeiro, mas png quase sempre existe.
    return `/graphic/unit/unit_${unit}.png`;
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

  // ======= Core: ler overview corretamente =======
  async function fetchMyVillagesFromOverviewNaAldeia() {
    // Pega a página overview unidades (a que você mostrou)
    const url = `/game.php?screen=overview_villages&mode=units${game_data.player.sitter > 0 ? `&t=${game_data.player.id}` : ''}`;
    const html = await fetchText(url);
    const doc = $.parseHTML(html);

    // localizar um table.vis grande
    const $tables = $(doc).find('table.vis');
    if (!$tables.length) throw new Error('Não encontrei a tabela do overview.');

    // encontrar uma tabela que tenha ícones de unidade no header
    let $t = null;
    $tables.each(function () {
      const hasUnitIcons = $(this).find('thead img[src*="/graphic/unit/"]').length > 0;
      if (hasUnitIcons && !$t) $t = $(this);
    });
    if (!$t) throw new Error('Não encontrei cabeçalho com ícones de unidades no overview.');

    // Mapa de coluna: index do <td> pelo unit do cabeçalho
    // Importante: a linha de dados tem tds, e o cabeçalho tem ths; vamos mapear pela POSIÇÃO relativa.
    const unitColIdx = {}; // unit -> tdIndex
    const headerCells = $t.find('thead tr').first().children(); // th/td
    headerCells.each(function (i) {
      const $img = $(this).find('img[src*="/graphic/unit/unit_"]').first();
      if ($img.length) {
        const src = $img.attr('src');
        const m = src.match(/unit_([a-z_]+)\.(png|webp)/i);
        if (m) unitColIdx[m[1]] = i;
      }
    });

    // segurança: precisamos pelo menos spear/sword/heavy aparecerem no header
    // heavy pode existir mesmo se 0 na aldeia.
    // Se heavy não existir no header do mundo, ainda assim não dá pra ler.
    // (No seu mundo aparece heavy no overview)
    const must = ['spear', 'sword', 'heavy'];
    const missingHeaders = must.filter((u) => unitColIdx[u] == null);
    if (missingHeaders.length) {
      throw new Error(`No overview, não achei colunas para: ${missingHeaders.join(', ')}.`);
    }

    const rows = $t.find('tbody tr').toArray().map((r) => $(r));

    // Estrutura comum:
    // - uma linha "vila" (contém link info_village&id=xxx e coords)
    // - depois linhas: "suas próprias", "Na aldeia", "fora", "em trânsito", "total"
    // Vamos iterar sequencialmente.
    const villages = [];
    let current = null;

    function parseVillageHeaderRow($r) {
      const $link = $r.find('a[href*="screen=info_village"]').first();
      if (!$link.length) return null;
      const href = $link.attr('href') || '';
      const id = Number(new URL(href, location.origin).searchParams.get('id') || 0);
      const text = $r.text().replace(/\s+/g, ' ').trim();
      const cm = text.match(coordsRegex);
      if (!id || !cm) return null;

      const coords = cm[0];
      // nome: pega o texto do link
      const name = ($link.text() || '').trim() || `Vila ${coords}`;
      return { id, name, coords };
    }

    function isNaAldeiaRow($r) {
      // no seu print aparece "Na aldeia" exatamente
      const t = $r.text().toLowerCase();
      return t.includes('na aldeia');
    }

    function readTroopsFromRow($r) {
      const tds = $r.children('td');
      const troops = {};

      Object.keys(unitColIdx).forEach((unit) => {
        const idx = unitColIdx[unit];
        const $cell = tds.eq(idx);
        const val = cleanInt($cell.text());
        troops[unit] = val;
      });

      return troops;
    }

    for (let i = 0; i < rows.length; i++) {
      const $r = rows[i];

      // detect header row of a village
      const vh = parseVillageHeaderRow($r);
      if (vh) {
        // finalize previous if exists
        if (current && current.troops) villages.push(current);
        current = { villageId: vh.id, villageName: vh.name, villageCoords: vh.coords, troops: null };
        continue;
      }

      if (current && isNaAldeiaRow($r)) {
        current.troops = readTroopsFromRow($r);
        continue;
      }
    }
    if (current && current.troops) villages.push(current);

    if (!villages.length) throw new Error('Não consegui ler suas vilas no overview (linha "Na aldeia").');

    return villages;
  }

  // ======= World data (enemy tribes/villages) =======
  async function fetchWorldData() {
    const base = location.origin;
    const [villTxt, plyTxt, allyTxt] = await Promise.all([
      fetchText(`${base}/map/village.txt`),
      fetchText(`${base}/map/player.txt`),
      fetchText(`${base}/map/ally.txt`),
    ]);
    const villages = parseCSV(villTxt);
    const players = parseCSV(plyTxt);
    const allies = parseCSV(allyTxt);
    return { villages, players, allies };
  }

  function tribeIdsFromTags(allies, tags) {
    // ally.txt: id,name,tag,players,villages,points,all_points,rank (geralmente)
    const wanted = new Set(tags.map((t) => t.toLowerCase()));
    return allies
      .filter((a) => a[0] && a[2] && wanted.has(String(a[2]).toLowerCase()))
      .map((a) => Number(a[0]))
      .filter(Boolean);
  }

  function playerIdsFromTribeIds(players, tribeIds) {
    const set = new Set(tribeIds.map(Number));
    // player.txt: id,name,ally_id,villages,points,rank
    return players
      .filter((p) => p[0] && set.has(Number(p[2])))
      .map((p) => Number(p[0]))
      .filter(Boolean);
  }

  function coordsFromPlayerIds(worldVillages, playerIds) {
    const set = new Set(playerIds.map(Number));
    // village.txt: id,name,x,y,player_id,points,type
    return worldVillages
      .filter((v) => v[0] && set.has(Number(v[4])))
      .map((v) => `${v[2]}|${v[3]}`);
  }

  // ======= Stack logic =======
  function calcPop(troops) {
    let total = 0;
    for (const [u, n] of Object.entries(troops || {})) {
      if (!n) continue;
      const pop = UNITS_POP[u] != null ? UNITS_POP[u] : 0;
      total += pop * n;
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

      // spy não escala (mas pode entrar no missing)
      const effectiveNeed = (unit === 'spy') ? need : Math.max(0, need - scale);

      const have = Number(troops[unit]) || 0;
      if (effectiveNeed > 0 && have < effectiveNeed) {
        missing[unit] = (effectiveNeed - have);
      } else if (effectiveNeed > 0) {
        missing[unit] = 0;
      }
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
    const body = rows.map((r, i) => {
      const v = r;
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
            <th>${tt('Village')}</th>
            <th style="width:110px;" class="right">${tt('Pop.')}</th>
            <th style="width:110px;" class="right">${tt('Distance')}</th>
            <th style="width:320px;">${tt('Missing Troops')}</th>
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
      // distancia mínima até qualquer vila inimiga
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
      const bb = buildBBCode(lastRows);
      copyToClipboard(bb);
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
