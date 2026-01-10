/*
 * Frontline Stacks Planner — MEMBER version (BR138)
 * FIX: agora lê as tropas "Na aldeia" do overview_villages&mode=units
 * => Isso inclui SUAS tropas + TODOS os apoios estacionados na aldeia.
 */

if (typeof DEBUG !== 'boolean') DEBUG = false;
if (typeof HC_AMOUNT === 'undefined') HC_AMOUNT = null;

(function () {
  const START_TS = Date.now();

  function ready() {
    return window.jQuery && window.game_data && window.UI;
  }
  function waitBoot() {
    if (ready()) return main().catch(console.error);
    if (Date.now() - START_TS > 10000) {
      console.error('[FSP] Falha no boot: jQuery/UI/game_data ausentes.');
      return;
    }
    setTimeout(waitBoot, 100);
  }
  waitBoot();

  async function main() {
    const scriptData = {
      prefix: 'frontlineStacksPlanner',
      name: 'Frontline Stacks Planner',
      version: 'BR138-member-overviewNAaldeia-v1',
    };

    const T = (s) => s; // simples, sem i18n aqui (mantém enxuto)

    const coordsRegex = /\d{1,3}\|\d{1,3}/g;
    const unitsPop = {
      spear: 1, sword: 1, axe: 1, archer: 1,
      spy: 2, light: 4, marcher: 5, heavy: 6,
      ram: 5, catapult: 8, knight: 10, snob: 100,
    };

    const DEFAULT_VALUES = { DISTANCE: 5, STACK: 100, SCALE_PER_FIELD: 5 };

    const screen = new URL(location.href).searchParams.get('screen');
    if (screen !== 'map') {
      UI.InfoMessage(`[${scriptData.name}] Redirecionando para o mapa...`);
      location.assign(game_data.link_base_pure + 'map');
      return;
    }

    UI.SuccessMessage(`[${scriptData.name}] carregado.`);

    // World data (inimigos por tribo) — continua igual
    const worldVillages = await jQuery.get('/map/village.txt');
    const worldPlayers = await jQuery.get('/map/player.txt');
    const worldTribes = await jQuery.get('/map/ally.txt');

    const villages = parseWorldVillage(worldVillages);
    const players = parseWorldPlayers(worldPlayers);
    const tribes = parseWorldTribes(worldTribes);

    // UI
    renderUI();

    // Events
    jQuery('#raPlanStacks').on('click', async (e) => {
      e.preventDefault();

      const input = collectUserInput();
      if (!input.chosenTribes.length) return;

      // 1) inimigos (coords)
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
        UI.ErrorMessage('Não consegui obter aldeias das tribos selecionadas (map data).');
        return;
      }

      // 2) LER overview UNA VEZ: (a) lista de aldeias + (b) tropas "Na aldeia"
      UI.InfoMessage('Lendo overview (Tropas → "Na aldeia") para incluir apoios…');
      const overview = await fetchOverviewUnitsNaAldeia();
      const myVillages = overview.myVillages;        // [{villageId, villageName, coords}]
      const troopsByVillageId = overview.troopsById; // { [id]: {unit: amount} }

      if (!myVillages.length) {
        UI.ErrorMessage('Não consegui ler sua lista de aldeias no overview.');
        return;
      }

      // 3) selecionar suas aldeias perto do front
      const distanceLimit = input.distance;
      const candidates = [];

      for (const v of myVillages) {
        let best = Infinity;
        for (const ec of enemyCoords) {
          const d = dist(ec, v.coords);
          if (d < best) best = d;
          if (best <= distanceLimit) break;
        }
        if (best <= distanceLimit) {
          candidates.push({ ...v, fieldsAway: Math.round(best * 100) / 100 });
        }
      }

      if (!candidates.length) {
        UI.SuccessMessage('Nenhuma aldeia no raio informado.');
        jQuery('#raStacks').hide().empty();
        jQuery('#raExport').attr('data-stack-plans', '');
        return;
      }

      // 4) avaliar stack usando tropas "Na aldeia" (inclui apoios)
      const stackPopLimit = (input.stackLimit * 1000);
      const need = [];

      for (const v of candidates.sort((a, b) => a.fieldsAway - b.fieldsAway)) {
        const troops = troopsByVillageId[v.villageId] || {};
        const pop = calcPop(troops);

        let should = pop < stackPopLimit;

        // também checa mínimos exigidos de unidades
        for (const [unit, amt] of Object.entries(input.unitAmounts)) {
          if ((troops[unit] || 0) < amt) should = true;
        }

        if (should) {
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
        UI.SuccessMessage('Todas as aldeias já estão stackadas dentro do critério.');
        jQuery('#raStacks').hide().empty();
        jQuery('#raExport').attr('data-stack-plans', '');
        return;
      }

      // render table
      jQuery('#raStacks').show().html(buildTable(need));
      jQuery('#raExport').attr('data-stack-plans', JSON.stringify(need));
      UI.SuccessMessage(`OK: ${candidates.length} aldeias no raio; ${need.length} precisando stack.`);
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

    // ---------------- UI helpers ----------------

    function renderUI() {
      const tribeDatalist = tribes
        .map(t => `<option value="${escapeHtml(t.tag)}">`)
        .join('');

      const unitInputs = ['spear', 'sword', 'archer', 'spy', 'heavy']
        .filter(u => game_data.units.includes(u))
        .map(u => `<th><img src="/graphic/unit/unit_${u}.png" style="max-width:18px"></th>`)
        .join('');

      const unitRow = ['spear', 'sword', 'archer', 'spy', 'heavy']
        .filter(u => game_data.units.includes(u))
        .map(u => `<td><input class="ra-input ra-u" data-unit="${u}" value="0" style="text-align:center"></td>`)
        .join('');

      const html = `
        <div id="${scriptData.prefix}" style="border:1px solid #603000;background:#f4e4bc;margin:10px 0 15px;">
          <div style="background:#c1a264 url(/graphic/screen/tableheader_bg3.png) repeat-x;padding:10px;">
            <h3 style="margin:0;line-height:1;">${scriptData.name}</h3>
            <small><strong>${scriptData.version}</strong> — lê "Na aldeia" do overview (inclui apoios)</small>
          </div>
          <div style="padding:10px;">
            <div style="display:grid;grid-template-columns: 1.3fr .9fr .8fr .8fr;gap:15px;align-items:start;">
              <div>
                <label style="display:block;font-weight:600;margin-bottom:6px;">Select enemy tribes</label>
                <input type="text" class="ra-input" list="raTribeList" id="raTribes" placeholder="Ex: [BO]" style="width:100%;padding:5px;">
                <datalist id="raTribeList">${tribeDatalist}</datalist>
                <small style="display:block;margin-top:6px;opacity:.85;">
                  Dica: você pode colar várias, separadas por vírgula. Ex: [BO], [XYZ]
                </small>
              </div>
              <div>
                <label style="display:block;font-weight:600;margin-bottom:6px;">Distance</label>
                <input type="number" class="ra-input" id="raDistance" value="${DEFAULT_VALUES.DISTANCE}" style="width:100%;padding:5px;">
              </div>
              <div>
                <label style="display:block;font-weight:600;margin-bottom:6px;">Stack Limit</label>
                <input type="number" class="ra-input" id="raStack" value="${DEFAULT_VALUES.STACK}" style="width:100%;padding:5px;">
              </div>
              <div>
                <label style="display:block;font-weight:600;margin-bottom:6px;">Scale down per field (k)</label>
                <input type="number" class="ra-input" id="raScalePerField" value="${DEFAULT_VALUES.SCALE_PER_FIELD}" style="width:100%;padding:5px;">
              </div>
            </div>

            <div style="margin-top:12px;">
              <label style="display:block;font-weight:600;margin-bottom:6px;">Required Stack Amount</label>
              <table class="vis" style="width:100%;border:2px solid #bd9c5a;">
                <thead><tr>${unitInputs}</tr></thead>
                <tbody><tr>${unitRow}</tr></tbody>
              </table>
            </div>

            <div style="margin-top:12px;">
              <a href="javascript:void(0);" id="raPlanStacks" class="btn">Calculate Stacks</a>
              <a href="javascript:void(0);" id="raExport" class="btn" data-stack-plans="">Export</a>
            </div>

            <div id="raStacks" style="display:none;margin-top:12px;max-height:400px;overflow:auto;"></div>
          </div>
        </div>
      `;

      // injeta
      if (!document.getElementById(scriptData.prefix)) {
        jQuery('#contentContainer').prepend(html);
        jQuery('#mobileContent').prepend(html);
      }
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

    // ---------------- parsing overview "Na aldeia" ----------------

    async function fetchOverviewUnitsNaAldeia() {
      const url =
        `/game.php?screen=overview_villages&mode=units&village=${game_data.village.id}` +
        (game_data.player.sitter != '0' ? `&t=${game_data.player.id}` : '');

      const html = await jQuery.get(url);
      const doc = jQuery(jQuery.parseHTML(html));

      // A tabela principal costuma ser .vis (a que contém "Aldeia (xxx)" no cabeçalho)
      const $table = doc.find('table.vis').first();
      if (!$table.length) throw new Error('Tabela overview não encontrada.');

      // mapear colunas por unidade usando o cabeçalho com ícones
      const unitColIndex = {};
      $table.find('thead tr').each(function () {
        jQuery(this).find('th').each(function (i) {
          const $img = jQuery(this).find('img[src*="/graphic/unit/unit_"]');
          if (!$img.length) return;
          const src = $img.attr('src') || '';
          const m = src.match(/unit_([a-z0-9_]+)\./i);
          if (!m) return;
          unitColIndex[m[1]] = i;
        });
      });

      // Para identificar cada aldeia:
      // - existe um "row de título" com link/ícone e nome da aldeia na primeira coluna,
      // - em seguida vêm as linhas: "suas próprias", "Na aldeia", "fora", "em trânsito", "total"
      const myVillages = [];
      const troopsById = {};

      const $rows = $table.find('tbody tr');
      let currentVillage = null;

      $rows.each(function () {
        const $tr = jQuery(this);
        const $tds = $tr.find('td');

        // detectar "header da aldeia" (primeira coluna com link contendo village=ID e coords)
        const $a = $tr.find('a[href*="village="], a[href*="info_village"]').first();
        const rowText = $tr.text().trim();

        const coords = (rowText.match(coordsRegex) || [null])[0];

        // Se tem link e coords na linha, tratamos como início de bloco de aldeia
        if ($a.length && coords) {
          // tenta pegar villageId de href ?village=...
          const href = $a.attr('href') || '';
          const full = new URL(href, location.origin);
          const vid = parseInt(full.searchParams.get('village') || full.searchParams.get('id'), 10);

          if (Number.isFinite(vid)) {
            const name = $a.text().trim() || `Aldeia ${coords}`;
            currentVillage = { villageId: vid, villageName: name, coords };
            myVillages.push(currentVillage);
            if (!troopsById[vid]) troopsById[vid] = {};
          }
          return; // segue próxima linha
        }

        if (!currentVillage) return;

        // localizar a linha "Na aldeia"
        // No seu print, a primeira célula da linha é exatamente "Na aldeia"
        const firstCell = ($tds.eq(0).text() || '').trim().toLowerCase();
        if (firstCell === 'na aldeia') {
          const vid = currentVillage.villageId;
          const troops = {};

          for (const unit of Object.keys(unitColIndex)) {
            if (!game_data.units.includes(unit)) continue;
            const idx = unitColIndex[unit];
            const raw = ($tds.eq(idx).text() || '').trim();
            const n = parseInt(raw.replace(/[^\d]/g, '') || '0', 10);
            troops[unit] = Number.isFinite(n) ? n : 0;
          }

          troopsById[vid] = troops;
        }
      });

      return { myVillages, troopsById };
    }

    // ---------------- core math ----------------

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
      return s || '-';
    }

    function buildTable(arr) {
      let html = `
        <table class="vis" style="width:100%;border:2px solid #bd9c5a;">
          <thead>
            <tr>
              <th>#</th>
              <th style="text-align:left;">Village</th>
              <th>Map</th>
              <th>Pop.</th>
              <th>Distance</th>
              <th>Missing Troops</th>
            </tr>
          </thead>
          <tbody>
      `;

      arr.forEach((v, i) => {
        const [x, y] = v.coords.split('|');
        html += `
          <tr>
            <td>${i + 1}</td>
            <td style="text-align:left;">
              <a href="/game.php?screen=info_village&id=${v.villageId}" target="_blank" rel="noreferrer noopener">${escapeHtml(v.villageName)}</a>
            </td>
            <td><a href="javascript:TWMap.focus(${x},${y});">${v.coords}</a></td>
            <td>${formatK(v.pop)}</td>
            <td>${v.fieldsAway}</td>
            <td style="white-space:pre-line;">${escapeHtml(missingToText(v.missingTroops))}</td>
          </tr>
        `;
      });

      html += `</tbody></table>`;
      return html;
    }

    // ---------------- utilities ----------------

    function getTribeIdsByTag(tags, tribeArr) {
      const wanted = new Set(tags.map(s => s.trim()));
      return tribeArr
        .filter(t => wanted.has(t.tag))
        .map(t => t.id);
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

    // ---------------- world parsers ----------------

    function parseCSV(str) {
      return str.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split(','));
    }

    function parseWorldVillage(txt) {
      // id,name,x,y,player_id,points
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
      // id,name,ally_id,villages,points,rank
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
      // id,name,tag,members,villages,points,all_points,rank
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
