/*
 * Frontline Stacks Planner — Member (BR138)
 * Lê OVERVIEW Tropas -> linha "Na aldeia" (inclui apoios dentro da vila)
 * UI: fonte um pouco maior + linhas separando cada aldeia
 * FIX: mapeamento correto das colunas de unidades (spear/sword/heavy etc.)
 */

if (typeof DEBUG !== 'boolean') DEBUG = false;
if (typeof HC_AMOUNT === 'undefined') HC_AMOUNT = null;

(function () {
  const script = {
    name: 'Frontline Stacks Planner',
    version: 'member-NA-ALDEIA-UI-lite+fix-cols',
    prefix: 'frontlineStacksPlanner_member_ui_lite',
  };

  const coordsRegex = /\d{1,3}\|\d{1,3}/g;

  const unitsPop = {
    spear: 1, sword: 1, axe: 1, archer: 1,
    spy: 2, light: 4, marcher: 5, heavy: 6,
    ram: 5, catapult: 8, knight: 10, snob: 100,
  };

  const DEFAULT_VALUES = { DISTANCE: 5, STACK: 100, SCALE_PER_FIELD: 5 };

  function bootOk() {
    return window.jQuery && window.game_data && window.UI;
  }

  function waitBoot() {
    if (bootOk()) return main().catch(console.error);
    setTimeout(waitBoot, 80);
  }
  waitBoot();

  async function main() {
    const screen = new URL(location.href).searchParams.get('screen');
    if (screen !== 'map') {
      UI.InfoMessage(`[${script.name}] Redirecionando para o mapa...`);
      location.assign(game_data.link_base_pure + 'map');
      return;
    }

    const [txtVillages, txtPlayers, txtTribes] = await Promise.all([
      jQuery.get('/map/village.txt'),
      jQuery.get('/map/player.txt'),
      jQuery.get('/map/ally.txt'),
    ]);

    const villages = parseWorldVillage(txtVillages);
    const players = parseWorldPlayers(txtPlayers);
    const tribes = parseWorldTribes(txtTribes);

    renderUI(tribes);

    jQuery('#raPlanStacks').on('click', async (e) => {
      e.preventDefault();

      const input = collectUserInput();
      if (!input.chosenTribes.length) return;

      const tribeIds = getTribeIdsByTag(input.chosenTribes, tribes);
      if (!tribeIds.length) {
        UI.ErrorMessage('Tribo(s) não encontrada(s).');
        return;
      }

      const enemyPlayerIds = players
        .filter(p => tribeIds.includes(p.allyId))
        .map(p => p.id);

      const enemyCoords = villages
        .filter(v => enemyPlayerIds.includes(v.playerId))
        .map(v => v.coords);

      if (!enemyCoords.length) {
        UI.ErrorMessage('Não consegui obter aldeias das tribos selecionadas.');
        return;
      }

      UI.InfoMessage('Lendo overview: Tropas → "Na aldeia" (inclui apoios)…');
      let overview;
      try {
        overview = await fetchOverviewUnitsNaAldeia_SIMPLE();
      } catch (err) {
        console.error('[FSP] erro overview:', err);
        UI.ErrorMessage('Não consegui ler suas vilas no overview.');
        return;
      }

      const myVillages = overview.myVillages;
      const troopsById = overview.troopsById;

      if (!myVillages.length) {
        UI.ErrorMessage('Não consegui ler suas vilas no overview.');
        return;
      }

      const candidates = [];
      for (const v of myVillages) {
        let best = Infinity;
        for (const ec of enemyCoords) {
          const d = dist(ec, v.coords);
          if (d < best) best = d;
          if (best <= input.distance) break;
        }
        if (best <= input.distance) {
          candidates.push({ ...v, fieldsAway: Math.round(best * 100) / 100 });
        }
      }

      if (!candidates.length) {
        UI.SuccessMessage('Nenhuma aldeia sua está dentro do raio informado.');
        jQuery('#raStacks').hide().empty();
        jQuery('#raExport').attr('data-stack-plans', '');
        return;
      }

      const stackPopLimit = input.stackLimit * 1000;
      const need = [];

      for (const v of candidates.sort((a, b) => a.fieldsAway - b.fieldsAway)) {
        const troops = troopsById[v.villageId] || {};
        const pop = calcPop(troops);

        let shouldAdd = pop < stackPopLimit;

        for (const [unit, amt] of Object.entries(input.unitAmounts)) {
          if ((troops[unit] || 0) < amt) shouldAdd = true;
        }

        if (shouldAdd) {
          const missingTroops = calcMissingTroops(
            troops,
            input.unitAmounts,
            Math.floor(v.fieldsAway),
            input.scaleDownPerField
          );
          need.push({ ...v, troops, pop, missingTroops });
        }
      }

      if (!need.length) {
        UI.SuccessMessage('Todas as aldeias já estão stackadas no critério.');
        jQuery('#raStacks').hide().empty();
        jQuery('#raExport').attr('data-stack-plans', '');
        return;
      }

      const tableHtml = buildVillagesTableSimple(need);
      jQuery('#raStacks').show().html(tableHtml);
      jQuery('#raExport').attr('data-stack-plans', JSON.stringify(need));
      UI.SuccessMessage(`OK: ${need.length} aldeias precisam stack.`);
    });

    jQuery('#raExport').on('click', (e) => {
      e.preventDefault();
      const data = jQuery('#raExport').attr('data-stack-plans');
      if (!data) return UI.ErrorMessage('Nada para exportar ainda.');
      const arr = JSON.parse(data);
      if (!arr.length) return UI.ErrorMessage('Nada para exportar ainda.');

      let bb = `[table][**]#[||]Village[||]Missing Troops[||]Distance[/**]\n`;
      arr.forEach((sp, i) => {
        bb += `[*]${i + 1}[|] ${sp.coords} [|]${missingToText(sp.missingTroops)}[|]${sp.fieldsAway}\n`;
      });
      bb += `[/table]`;

      navigator.clipboard.writeText(bb);
      UI.SuccessMessage('Copiado para a área de transferência!');
    });

    // ============================================================
    // OVERVIEW PARSER “SIMPLES” — lê "Na aldeia"
    // FIX: mapeia unidades por ORDEM dos ícones no cabeçalho
    // ============================================================
    async function fetchOverviewUnitsNaAldeia_SIMPLE() {
      const url =
        `/game.php?screen=overview_villages&mode=units&village=${game_data.village.id}` +
        (game_data.player.sitter != '0' ? `&t=${game_data.player.id}` : '');

      const html = await jQuery.get(url);
      const $doc = jQuery(jQuery.parseHTML(html));

      const $tables = $doc.find('table.vis');
      if (!$tables.length) throw new Error('Sem table.vis');

      let $table = null;
      $tables.each(function () {
        const txt = jQuery(this).text();
        if (coordsRegex.test(txt)) {
          $table = jQuery(this);
          return false;
        }
      });
      if (!$table || !$table.length) $table = $tables.eq(0);

      // ✅ pega a ORDEM das unidades no thead (não usa .index() do th)
      const unitOrder = [];
      const $headRow = $table.find('thead tr').last();

      $headRow.find('th').each(function () {
        const $img = jQuery(this).find('img[src*="/graphic/unit/unit_"]').first();
        if (!$img.length) return;
        const src = $img.attr('src') || '';
        const m = src.match(/unit_([a-z0-9_]+)\./i);
        if (!m) return;

        const unit = m[1];
        // só unidades do mundo atual
        if (game_data.units.includes(unit)) unitOrder.push(unit);
      });

      if (!unitOrder.length) {
        throw new Error('Não encontrei ícones de unidades no thead');
      }

      const myVillages = [];
      const troopsById = {};

      const $rows = $table.find('tbody tr');
      let currentVillage = null;

      $rows.each(function () {
        const $tr = jQuery(this);
        const txt = $tr.text().trim();
        const coords = (txt.match(coordsRegex) || [null])[0];

        // Linha “título” da aldeia
        const $a = $tr.find('a[href*="village="], a[href*="info_village"]').first();
        if ($a.length && coords) {
          const href = $a.attr('href') || '';
          const full = new URL(href, location.origin);
          const vid = parseInt(full.searchParams.get('village') || full.searchParams.get('id'), 10);

          if (Number.isFinite(vid)) {
            const name = ($a.text() || '').trim() || `Aldeia ${coords}`;
            currentVillage = { villageId: vid, villageName: name, coords };
            myVillages.push(currentVillage);
            if (!troopsById[vid]) troopsById[vid] = {};
          }
          return;
        }

        if (!currentVillage) return;

        const $tds = $tr.find('td');
        if (!$tds.length) return;

        const first = ($tds.eq(0).text() || '').trim().toLowerCase();

        // ✅ alvo: "na aldeia"
        if (first === 'na aldeia') {
          const vid = currentVillage.villageId;
          const troops = {};

          // Os valores começam logo após o label ("Na aldeia")
          const base = 1;

          for (let i = 0; i < unitOrder.length; i++) {
            const unit = unitOrder[i];
            const raw = ($tds.eq(base + i).text() || '').trim();
            const n = parseInt(raw.replace(/[^\d]/g, '') || '0', 10);
            troops[unit] = Number.isFinite(n) ? n : 0;
          }

          troopsById[vid] = troops;
        }
      });

      return { myVillages, troopsById };
    }

    // ----------------- UI -----------------
    function renderUI(tribesArr) {
      const tribeDatalist = tribesArr
        .map(t => `<option value="${escapeHtml(t.tag)}">`)
        .join('');

      const defUnits = ['spear', 'sword', 'archer', 'spy', 'heavy']
        .filter(u => game_data.units.includes(u));

      const unitHeaders = defUnits
        .map(u => `
          <th class="ra-u-th">
            <img src="/graphic/unit/unit_${u}.png" class="ra-unit-img">
          </th>
        `).join('');

      const unitRow = defUnits
        .map(u => `
          <td class="ra-u-td">
            <input class="ra-input ra-u" data-unit="${u}" value="0">
          </td>
        `).join('');

      const html = `
        <div id="${script.prefix}" class="ra-wrap">
          <div class="ra-head">
            <div class="ra-title">${script.name}</div>
            <div class="ra-sub">v.${script.version} — lendo <b>"Na aldeia"</b> do overview (inclui apoios)</div>
          </div>

          <div class="ra-body">
            <div class="ra-grid">
              <div class="ra-field">
                <label class="ra-label">Select enemy tribes</label>
                <input type="text" class="ra-input" list="raTribeList" id="raTribes" placeholder="Ex: [BO]">
                <datalist id="raTribeList">${tribeDatalist}</datalist>
              </div>

              <div class="ra-field">
                <label class="ra-label">Distance</label>
                <input type="number" class="ra-input" id="raDistance" value="${DEFAULT_VALUES.DISTANCE}">
              </div>

              <div class="ra-field">
                <label class="ra-label">Stack Limit (k)</label>
                <input type="number" class="ra-input" id="raStack" value="${DEFAULT_VALUES.STACK}">
              </div>

              <div class="ra-field">
                <label class="ra-label">Scale down per field (k)</label>
                <input type="number" class="ra-input" id="raScalePerField" value="${DEFAULT_VALUES.SCALE_PER_FIELD}">
              </div>
            </div>

            <div class="ra-block">
              <div class="ra-block-title">Required Stack Amount</div>
              <table class="vis ra-units-table" width="100%">
                <thead><tr>${unitHeaders}</tr></thead>
                <tbody><tr>${unitRow}</tr></tbody>
              </table>
            </div>

            <div class="ra-actions">
              <a href="javascript:void(0);" id="raPlanStacks" class="btn ra-btn">Calculate Stacks</a>
              <a href="javascript:void(0);" id="raExport" class="btn ra-btn" data-stack-plans="">Export</a>
            </div>

            <div id="raStacks" class="ra-results" style="display:none;"></div>
          </div>
        </div>

        <style>
          #${script.prefix}.ra-wrap{
            border: 1px solid #603000;
            background: #f4e4bc;
            margin: 10px 0 15px;
            font-size: 14px;
          }
          #${script.prefix} *{ box-sizing:border-box; }

          #${script.prefix} .ra-head{
            background: #c1a264 url(/graphic/screen/tableheader_bg3.png) repeat-x;
            padding: 10px 12px;
            border-bottom: 1px solid #603000;
          }
          #${script.prefix} .ra-title{
            font-size: 17px;
            font-weight: 700;
            line-height: 1.1;
          }
          #${script.prefix} .ra-sub{
            font-size: 13px;
            margin-top: 4px;
            opacity: .95;
          }

          #${script.prefix} .ra-body{ padding: 12px; }

          #${script.prefix} .ra-grid{
            display:grid;
            grid-template-columns: 1.2fr .7fr .7fr .8fr;
            gap: 10px;
            align-items:end;
            margin-bottom: 10px;
          }
          #${script.prefix} .ra-label{
            display:block;
            font-weight:700;
            margin-bottom: 6px;
            font-size: 14px;
          }
          #${script.prefix} .ra-input{
            width:100%;
            padding: 6px 8px;
            font-size: 14px;
            line-height: 1.1;
          }

          #${script.prefix} .ra-block{
            margin-top: 6px;
            padding: 8px;
            border: 1px solid #bd9c5a;
            background: rgba(255,255,255,0.15);
          }
          #${script.prefix} .ra-block-title{
            font-weight: 800;
            font-size: 14px;
            margin-bottom: 8px;
          }
          #${script.prefix} .ra-unit-img{
            max-width: 20px;
            vertical-align: middle;
          }
          #${script.prefix} .ra-u-th, #${script.prefix} .ra-u-td{
            text-align:center;
            padding: 6px;
          }

          #${script.prefix} .ra-actions{
            margin-top: 10px;
            display:flex;
            gap: 8px;
            align-items:center;
            flex-wrap: wrap;
          }
          #${script.prefix} .ra-btn{
            font-size: 13px;
            padding: 4px 8px;
          }

          #${script.prefix} .ra-results{
            margin-top: 12px;
          }
          #${script.prefix} .ra-table{
            width:100%;
            border-collapse: collapse;
            border: 2px solid #bd9c5a;
            font-size: 14px;
          }
          #${script.prefix} .ra-table th,
          #${script.prefix} .ra-table td{
            border: 1px solid #bd9c5a;
            padding: 7px 8px;
            vertical-align: top;
          }
          #${script.prefix} .ra-table th{
            background: #f0e2be;
            font-weight: 800;
          }

          /* separador por aldeia */
          #${script.prefix} .ra-table tbody tr{
            border-bottom: 3px solid #7d510f;
          }
          #${script.prefix} .ra-table tbody tr:last-child{
            border-bottom: none;
          }

          #${script.prefix} .ra-tal{ text-align:left; }
          #${script.prefix} .ra-tac{ text-align:center; }
          #${script.prefix} .ra-missing{
            white-space: pre-line;
            font-family: monospace;
            font-size: 13px;
          }

          @media (max-width: 900px){
            #${script.prefix} .ra-grid{ grid-template-columns: 1fr 1fr; }
          }
          @media (max-width: 520px){
            #${script.prefix} .ra-grid{ grid-template-columns: 1fr; }
          }
        </style>
      `;

      if (!document.getElementById(script.prefix)) {
        jQuery('#contentContainer').prepend(html);
        jQuery('#mobileContent').prepend(html);
      }
    }

    function buildVillagesTableSimple(arr) {
      let rows = arr.map((v, i) => {
        const [x, y] = v.coords.split('|');
        return `
          <tr>
            <td class="ra-tac"><b>${i + 1}</b></td>
            <td class="ra-tal">
              <a href="/game.php?screen=info_village&id=${v.villageId}" target="_blank" rel="noreferrer noopener">
                ${escapeHtml(v.villageName)}
              </a>
              <div style="opacity:.9;margin-top:2px;">
                <a href="javascript:TWMap.focus(${x},${y});">${v.coords}</a>
              </div>
            </td>
            <td class="ra-tac"><b>${formatK(v.pop)}</b></td>
            <td class="ra-tac">${v.fieldsAway}</td>
            <td class="ra-tal ra-missing">${escapeHtml(missingToText(v.missingTroops) || '-')}</td>
          </tr>
        `;
      }).join('');

      return `
        <table class="ra-table">
          <thead>
            <tr>
              <th style="width:50px;">#</th>
              <th class="ra-tal">Village</th>
              <th style="width:90px;" class="ra-tac">Pop.</th>
              <th style="width:90px;" class="ra-tac">Distance</th>
              <th class="ra-tal">Missing Troops</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `;
    }

    function calcPop(troops) {
      let total = 0;
      for (const [unit, amount] of Object.entries(troops || {})) {
        const a = Number(amount || 0);
        if (!a) continue;
        const pop = unit !== 'heavy'
          ? (unitsPop[unit] || 1)
          : (HC_AMOUNT ?? unitsPop.heavy);
        total += pop * a;
      }
      return total;
    }

    function calcMissingTroops(troops, unitAmounts, distanceInt, scaleDownPerField) {
      const missing = {};
      const nonScaling = ['spy', 'heavy'];
      const d = Math.max(0, (distanceInt || 0) - 1);

      for (const [unit, value] of Object.entries(unitAmounts || {})) {
        if (nonScaling.includes(unit)) continue;
        const need = value - d * scaleDownPerField * 1000;
        if (need <= 0) continue;

        const have = Number(troops?.[unit] ?? 0);
        missing[unit] = Math.max(0, Math.trunc(need - have));
      }
      return missing;
    }

    function missingToText(missing) {
      let s = '';
      for (const [k, v] of Object.entries(missing || {})) s += `${k}: ${v}\n`;
      return s.trim();
    }

    function collectUserInput() {
      let chosenTribes = (jQuery('#raTribes').val() || '').trim();
      let distance = parseInt(jQuery('#raDistance').val(), 10);
      let stackLimit = parseInt(jQuery('#raStack').val(), 10);
      let scaleDownPerField = parseInt(jQuery('#raScalePerField').val(), 10);

      if (!chosenTribes) {
        UI.ErrorMessage('Selecione uma tribo inimiga.');
        return { chosenTribes: [], distance, unitAmounts: {}, stackLimit, scaleDownPerField };
      }
      chosenTribes = chosenTribes.split(',').map(s => s.trim()).filter(Boolean);

      const unitAmounts = {};
      jQuery('.ra-u').each(function () {
        const unit = jQuery(this).attr('data-unit');
        const val = parseInt(jQuery(this).val(), 10) || 0;
        if (val > 0) unitAmounts[unit] = val;
      });

      return { chosenTribes, distance, unitAmounts, stackLimit, scaleDownPerField };
    }

    function getTribeIdsByTag(tags, tribeArr) {
      const wanted = new Set(tags.map(s => s.trim()));
      return tribeArr.filter(t => wanted.has(t.tag)).map(t => t.id);
    }

    function dist(a, b) {
      const [x1, y1] = a.split('|').map(Number);
      const [x2, y2] = b.split('|').map(Number);
      const dx = x1 - x2;
      const dy = y1 - y2;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function formatK(num) {
      const n = Number(num || 0);
      if (n < 1000) return String(n);
      return (n / 1000).toFixed(2).replace(/\.0+$/, '') + 'K';
    }

    function escapeHtml(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function parseCSV(str) {
      return str.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split(','));
    }

    function parseWorldVillage(txt) {
      return parseCSV(txt).map(r => ({
        id: parseInt(r[0], 10),
        name: decodeURIComponent((r[1] || '').replace(/\+/g, ' ')),
        x: parseInt(r[2], 10),
        y: parseInt(r[3], 10),
        coords: `${r[2]}|${r[3]}`,
        playerId: parseInt(r[4], 10),
        points: parseInt(r[5], 10),
      }));
    }

    function parseWorldPlayers(txt) {
      return parseCSV(txt).map(r => ({
        id: parseInt(r[0], 10),
        name: decodeURIComponent((r[1] || '').replace(/\+/g, ' ')),
        allyId: parseInt(r[2], 10),
        villages: parseInt(r[3], 10),
        points: parseInt(r[4], 10),
        rank: parseInt(r[5], 10),
      }));
    }

    function parseWorldTribes(txt) {
      return parseCSV(txt).map(r => ({
        id: parseInt(r[0], 10),
        name: decodeURIComponent((r[1] || '').replace(/\+/g, ' ')),
        tag: decodeURIComponent((r[2] || '').replace(/\+/g, ' ')),
        members: parseInt(r[3], 10),
        villages: parseInt(r[4], 10),
        points: parseInt(r[5], 10),
        allPoints: parseInt(r[6], 10),
        rank: parseInt(r[7], 10),
      }));
    }
  }
})();
