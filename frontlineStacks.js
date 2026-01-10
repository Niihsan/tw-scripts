/* 
 * Frontline Stacks Planner — MEMBER version (BR138) — SUPPORT INCLUDED (info_village parser)
 * Agora soma TODA a tropa estacionada na aldeia (em casa + apoios) lendo:
 *   /game.php?screen=info_village&id=VILLAGE_ID   => tabela "Defesas"
 *
 * Rodar no mapa (screen=map).
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
    const scriptConfig = {
      scriptData: {
        prefix: 'frontlineStacksPlanner',
        name: 'Frontline Stacks Planner',
        version: 'BR138-member-support-v3',
      },
      translations: {
        en_DK: {
          'Frontline Stacks Planner': 'Frontline Stacks Planner',
          'Redirecting...': 'Redirecting...',
          'Select enemy tribes': 'Select enemy tribes',
          'Start typing and suggestions will show ...': 'Start typing and suggestions will show ...',
          Distance: 'Distance',
          'Stack Limit': 'Stack Limit',
          'Scale down per field (k)': 'Scale down per field (k)',
          'Required Stack Amount': 'Required Stack Amount',
          'Calculate Stacks': 'Calculate Stacks',
          Export: 'Export',
          Village: 'Village',
          Map: 'Map',
          'Pop.': 'Pop.',
          Distance2: 'Distance',
          'Missing Troops': 'Missing Troops',
          'All villages have been properly stacked!': 'All villages have been properly stacked!',
          'No stack plans have been prepared!': 'No stack plans have been prepared!',
          'Copied on clipboard!': 'Copied on clipboard!',
          'Reading stationed troops (home + supports)...': 'Reading stationed troops (home + supports)...',
          'Could not read defense table.': 'Could not read defense table.',
        },
      },
      allowedScreens: ['map'],
      isDebug: DEBUG,
    };

    const twSDK = {
      scriptData: {},
      translations: {},
      allowedScreens: [],
      isDebug: false,
      coordsRegex: /\d{1,3}\|\d{1,3}/g,

      unitsFarmSpace: {
        spear: 1, sword: 1, axe: 1, archer: 1,
        spy: 2, light: 4, marcher: 5, heavy: 6,
        ram: 5, catapult: 8, knight: 10, snob: 100,
      },

      worldDataVillages: '/map/village.txt',
      worldDataPlayers: '/map/player.txt',
      worldDataTribes: '/map/ally.txt',

      init: async function (cfg) {
        this.scriptData = cfg.scriptData;
        this.translations = cfg.translations;
        this.allowedScreens = cfg.allowedScreens;
        this.isDebug = cfg.isDebug;
        if (this.isDebug) console.debug(this.scriptInfo(), 'DEBUG ON');
      },

      scriptInfo: function () {
        return `[${this.scriptData.name} ${this.scriptData.version}]`;
      },

      tt: function (s) {
        return (this.translations[game_data.locale] && this.translations[game_data.locale][s]) ||
          (this.translations['en_DK'] && this.translations['en_DK'][s]) || s;
      },

      getParameterByName: function (name, url = window.location.href) {
        return new URL(url).searchParams.get(name);
      },

      cleanString: function (string) {
        try { return decodeURIComponent(string).replace(/\+/g, ' '); } catch (_) { return string; }
      },

      copyToClipboard: function (string) {
        navigator.clipboard.writeText(string);
      },

      calculateDistance: function (from, to) {
        const [x1, y1] = from.split('|').map(Number);
        const [x2, y2] = to.split('|').map(Number);
        const dx = Math.abs(x1 - x2);
        const dy = Math.abs(y1 - y2);
        return Math.sqrt(dx * dx + dy * dy);
      },

      csvToArray: function (strData, strDelimiter = ',') {
        const objPattern = new RegExp(
          '(\\' + strDelimiter + '|\\r?\\n|\\r|^)' +
          '(?:"([^"]*(?:""[^"]*)*)"|' +
          '([^"\\' + strDelimiter + '\\r\\n]*))',
          'gi'
        );
        const arrData = [[]];
        let arrMatches = null;
        while ((arrMatches = objPattern.exec(strData))) {
          const delim = arrMatches[1];
          if (delim.length && delim !== strDelimiter) arrData.push([]);
          let val = arrMatches[2] ? arrMatches[2].replace(/""/g, '"') : arrMatches[3];
          arrData[arrData.length - 1].push(val);
        }
        return arrData;
      },

      checkScreen: function () {
        return this.allowedScreens.includes(this.getParameterByName('screen'));
      },

      redirectTo: function (location) {
        window.location.assign(game_data.link_base_pure + location);
      },

      addGlobalStyle: function () {
        return `
          .ra-table-container { overflow-y:auto; max-height: 400px; }
          .ra-table th, .ra-table td { padding: 5px; text-align:center; white-space: pre-line; }
          .ra-table tr:nth-of-type(2n) td { background:#f0e2be }
          .ra-table tr:nth-of-type(2n+1) td { background:#fff5da }
          .ra-table-v3 { border:2px solid #bd9c5a; }
          .ra-table-v3 th, .ra-table-v3 td { border:1px solid #bd9c5a; }
          .ra-tal { text-align:left !important; }
          .ra-mb15 { margin-bottom:15px !important; }
          .ra-mt15 { margin-top:15px !important; }
        `;
      },

      renderBoxWidget: function (body, id, mainClass, customStyle) {
        const globalStyle = this.addGlobalStyle();
        const content = `
          <div class="${mainClass} ra-box-widget" id="${id}">
            <div class="${mainClass}-header"><h3>${this.tt(this.scriptData.name)}</h3></div>
            <div class="${mainClass}-body">${body}</div>
            <div class="${mainClass}-footer"><small><strong>${this.tt(this.scriptData.name)} ${this.scriptData.version}</strong></small></div>
          </div>
          <style>
            .${mainClass}{display:block;width:100%;margin:10px 0 15px;border:1px solid #603000;background:#f4e4bc;}
            .${mainClass} > div{padding:10px;}
            .${mainClass}-header{background:#c1a264 url(/graphic/screen/tableheader_bg3.png) repeat-x;}
            .${mainClass}-header h3{margin:0;line-height:1;}
            ${globalStyle}
            ${customStyle}
          </style>
        `;
        if (jQuery(`#${id}`).length < 1) {
          jQuery('#contentContainer').prepend(content);
          jQuery('#mobileContent').prepend(content);
        } else {
          jQuery(`#${id} .${mainClass}-body`).html(body);
        }
      },

      worldDataAPI: async function (entity) {
        const url = entity === 'village' ? this.worldDataVillages :
          entity === 'player' ? this.worldDataPlayers :
            entity === 'ally' ? this.worldDataTribes : null;
        if (!url) throw new Error('invalid entity: ' + entity);

        const raw = await jQuery.get(url);
        const rows = this.csvToArray(raw).filter(r => r[0] !== '');

        if (entity === 'village') return rows.map(r => [parseInt(r[0], 10), this.cleanString(r[1]), r[2], r[3], parseInt(r[4], 10), parseInt(r[5], 10)]);
        if (entity === 'player') return rows.map(r => [parseInt(r[0], 10), this.cleanString(r[1]), parseInt(r[2], 10), parseInt(r[3], 10), parseInt(r[4], 10), parseInt(r[5], 10)]);
        if (entity === 'ally') return rows.map(r => [parseInt(r[0], 10), this.cleanString(r[1]), this.cleanString(r[2]), parseInt(r[3], 10), parseInt(r[4], 10), parseInt(r[5], 10), parseInt(r[6], 10), parseInt(r[7], 10)]);
      },
    };

    await twSDK.init(scriptConfig);
    const scriptInfo = twSDK.scriptInfo();

    if (!twSDK.checkScreen()) {
      UI.InfoMessage(twSDK.tt('Redirecting...'));
      twSDK.redirectTo('map');
      return;
    }

    UI.InfoMessage(`${scriptInfo} rodando…`);

    const hcPopAmount = HC_AMOUNT ?? twSDK.unitsFarmSpace['heavy'];
    const DEFAULT_VALUES = { DISTANCE: 5, STACK: 100, SCALE_PER_FIELD: 5 };

    let villages, players, tribes;
    try {
      [villages, players, tribes] = await Promise.all([
        twSDK.worldDataAPI('village'),
        twSDK.worldDataAPI('player'),
        twSDK.worldDataAPI('ally'),
      ]);
    } catch (e) {
      UI.ErrorMessage(`${scriptInfo} erro ao carregar /map data: ${e?.message || e}`);
      console.error(e);
      return;
    }

    // =========================
    // LISTA DAS SUAS ALDEIAS
    // =========================
    const myVillagesList = await fetchMyVillagesList();
    if (!myVillagesList.length) {
      UI.ErrorMessage(`${scriptInfo}: não consegui ler sua lista de aldeias.`);
      return;
    }

    const playersData = [{
      id: game_data.player.id,
      name: game_data.player.name,
      villagesData: myVillagesList.map(v => ({ ...v, troops: {} })) // troops será preenchido sob demanda
    }];

    buildUI();
    handleCalculateStackPlans(playersData);
    handleExport();

    UI.SuccessMessage(`${scriptInfo}: pronto! (suas aldeias: ${myVillagesList.length})`);

    // ======================
    // UI
    // ======================

    function buildUI() {
      const enemyTribePickerHtml = buildEnemyTribePicker(tribes, 'Tribes');
      const troopAmountsHtml = buildUnitsChooserTable();

      const content = `
        <div class="ra-mb15">
          <div class="ra-grid">
            <div>${enemyTribePickerHtml}</div>
            <div>
              <label for="raDistance" class="ra-label">${twSDK.tt('Distance')}</label>
              <input type="number" class="ra-input" id="raDistance" value="${DEFAULT_VALUES.DISTANCE}">
              <small style="display:block;margin-top:6px;opacity:.85">
                Troops = estacionadas (em casa + apoio) via Info da aldeia → Defesas.
              </small>
            </div>
            <div>
              <label for="raStack" class="ra-label">${twSDK.tt('Stack Limit')}</label>
              <input type="number" class="ra-input" id="raStack" value="${DEFAULT_VALUES.STACK}">
            </div>
            <div>
              <label for="raScalePerField" class="ra-label">${twSDK.tt('Scale down per field (k)')}</label>
              <input type="number" class="ra-input" id="raScalePerField" value="${DEFAULT_VALUES.SCALE_PER_FIELD}">
            </div>
          </div>
        </div>

        <div class="ra-mb15">
          <label class="ra-label">${twSDK.tt('Required Stack Amount')}</label>
          ${troopAmountsHtml}
        </div>

        <div>
          <a href="javascript:void(0);" id="raPlanStacks" class="btn">${twSDK.tt('Calculate Stacks')}</a>
          <a href="javascript:void(0);" id="raExport" class="btn" data-stack-plans="">${twSDK.tt('Export')}</a>
        </div>

        <div class="ra-mt15 ra-table-container" id="raStacks" style="display:none;"></div>
      `;

      const customStyle = `
        .ra-grid { display:grid; grid-template-columns: 1.3fr .9fr .8fr .8fr; grid-gap: 15px; align-items:start; }
        .ra-input { width:100% !important; padding:5px; font-size:14px; }
        .ra-label { margin-bottom:6px; font-weight:600; display:block; }
        @media(max-width: 900px){ .ra-grid{grid-template-columns:1fr;} }
      `;

      twSDK.renderBoxWidget(content, scriptConfig.scriptData.prefix, 'ra-frontline-stacks', customStyle);
    }

    function buildEnemyTribePicker(array, entity) {
      array.sort((a, b) => parseInt(a[7], 10) - parseInt(b[7], 10));
      let dropdown = `
        <label for="ra${entity}" class="ra-label">${twSDK.tt('Select enemy tribes')}</label>
        <input type="text" class="ra-input" list="raSelect${entity}" placeholder="${twSDK.tt('Start typing and suggestions will show ...')}" id="ra${entity}">
        <datalist id="raSelect${entity}">
      `;
      array.forEach(item => { if (item[0]) dropdown += `<option value="${twSDK.cleanString(item[2])}">`; });
      dropdown += `</datalist>`;
      return dropdown;
    }

    function buildUnitsChooserTable() {
      const preferred = ['spear', 'sword', 'archer', 'spy', 'heavy'];
      const units = preferred.filter(u => game_data.units.includes(u));
      let th = '', row = '';

      units.forEach((unit) => {
        th += `<th><img src="/graphic/unit/unit_${unit}.png" style="max-width:18px"></th>`;
        row += `<td><input class="ra-input" style="text-align:center" data-unit="${unit}" value="0"></td>`;
      });

      return `
        <table class="ra-table ra-table-v3 vis" width="100%" id="raUnitSelector">
          <thead><tr>${th}</tr></thead>
          <tbody><tr>${row}</tr></tbody>
        </table>
      `;
    }

    // ======================
    // CORE
    // ======================

    function collectUserInput() {
      let chosenTribes = (jQuery('#raTribes').val() || '').trim();
      let distance = parseInt(jQuery('#raDistance').val(), 10);
      let stackLimit = parseInt(jQuery('#raStack').val(), 10);
      let scaleDownPerField = parseInt(jQuery('#raScalePerField').val(), 10);
      let unitAmounts = {};

      if (!chosenTribes) {
        UI.ErrorMessage('Selecione uma tribo inimiga.');
        return { chosenTribes: [], distance, unitAmounts, stackLimit, scaleDownPerField };
      }

      chosenTribes = chosenTribes.split(',').map(s => s.trim()).filter(Boolean);

      jQuery('#raUnitSelector input').each(function () {
        const unit = jQuery(this).attr('data-unit');
        const amount = parseInt(jQuery(this).val(), 10) || 0;
        if (amount > 0) unitAmounts[unit] = amount;
      });

      return { chosenTribes, distance, unitAmounts, stackLimit, scaleDownPerField };
    }

    function getEntityIdsByArrayIndex(chosenItems, items, index) {
      const ids = [];
      chosenItems.forEach((chosen) => {
        items.forEach((it) => {
          if (twSDK.cleanString(it[index]) === twSDK.cleanString(chosen)) ids.push(parseInt(it[0], 10));
        });
      });
      return ids;
    }

    function getTribeMembersById(tribeIds) {
      return players
        .filter(p => tribeIds.includes(parseInt(p[2], 10)))
        .map(p => parseInt(p[0], 10));
    }

    function filterVillagesByPlayerIds(playerIds) {
      return villages
        .filter(v => playerIds.includes(parseInt(v[4], 10)))
        .map(v => v[2] + '|' + v[3]);
    }

    function calculatePop(units) {
      let total = 0;
      for (let [key, value] of Object.entries(units || {})) {
        const amount = Number(value || 0);
        if (!amount) continue;
        const pop = key !== 'heavy' ? (twSDK.unitsFarmSpace[key] || 1) : (HC_AMOUNT ?? twSDK.unitsFarmSpace['heavy']);
        total += pop * amount;
      }
      return total;
    }

    function calculateMissingTroops(troops, unitAmounts, distance, scaleDownPerField) {
      let missing = {};
      const nonScaling = ['spy', 'heavy'];
      distance = distance - 1;

      for (let [unit, value] of Object.entries(unitAmounts || {})) {
        let need = value - parseInt(distance, 10) * scaleDownPerField * 1000;
        if (need > 0 && !nonScaling.includes(unit)) {
          const have = Number(troops?.[unit] ?? 0);
          missing[unit] = Math.abs(Math.trunc(have - need));
        }
      }
      return missing;
    }

    function buildMissingTroopsString(missingTroops) {
      let s = '';
      for (let [k, v] of Object.entries(missingTroops || {})) s += `${k}: ${v}\n`;
      return s;
    }

    function intToString(num) {
      num = (num || 0).toString().replace(/[^0-9.]/g, '');
      if (num < 1000) return num;
      const si = [{ v: 1e3, s: 'K' }, { v: 1e6, s: 'M' }, { v: 1e9, s: 'B' }];
      let i;
      for (i = si.length - 1; i > 0; i--) if (num >= si[i].v) break;
      return (num / si[i].v).toFixed(2).replace(/\.0+$|(\.[0-9]*[1-9])0+$/, '$1') + si[i].s;
    }

    function buildVillagesTable(arr) {
      let html = `
        <table class="ra-table ra-table-v3" width="100%">
          <thead>
            <tr>
              <th>#</th>
              <th class="ra-tal">${twSDK.tt('Village')}</th>
              <th>${twSDK.tt('Map')}</th>
              <th>${twSDK.tt('Pop.')}</th>
              <th>${twSDK.tt('Distance')}</th>
              <th>${twSDK.tt('Missing Troops')}</th>
            </tr>
          </thead>
          <tbody>
      `;

      arr.forEach((v, i) => {
        const [x, y] = v.villageCoords.split('|');
        html += `
          <tr>
            <td>${i + 1}</td>
            <td class="ra-tal"><a href="/game.php?screen=info_village&id=${v.villageId}" target="_blank" rel="noreferrer noopener">${v.villageName}</a></td>
            <td><a href="javascript:TWMap.focus(${x},${y});">${v.villageCoords}</a></td>
            <td>${intToString(v.pop)}</td>
            <td>${v.fieldsAway}</td>
            <td>${buildMissingTroopsString(v.missingTroops)}</td>
          </tr>
        `;
      });

      html += `</tbody></table>`;
      return html;
    }

    function handleCalculateStackPlans(playersData) {
      jQuery('#raPlanStacks').on('click', async function (e) {
        e.preventDefault();

        const { chosenTribes, distance, unitAmounts, stackLimit, scaleDownPerField } = collectUserInput();
        if (!chosenTribes.length) return;

        // 1) filtra suas aldeias pelo raio em relação às aldeias das tribos inimigas
        const chosenTribeIds = getEntityIdsByArrayIndex(chosenTribes, tribes, 2);
        const tribePlayers = getTribeMembersById(chosenTribeIds);
        const enemyCoords = filterVillagesByPlayerIds(tribePlayers);

        const myVillages = playersData[0].villagesData;

        let within = [];
        myVillages.forEach((v) => {
          enemyCoords.forEach((ec) => {
            const d = twSDK.calculateDistance(ec, v.villageCoords);
            if (d <= distance) within.push({ ...v, fieldsAway: Math.round(d * 100) / 100 });
          });
        });

        // dedupe por id
        const uniq = {};
        within.sort((a, b) => a.fieldsAway - b.fieldsAway).forEach(it => { if (!uniq[it.villageId]) uniq[it.villageId] = it; });
        const candidates = Object.values(uniq);

        if (!candidates.length) {
          UI.SuccessMessage('Nenhuma aldeia no raio.');
          return;
        }

        // 2) para cada aldeia candidata, buscar tropas estacionadas via info_village (Defesas)
        UI.InfoMessage(twSDK.tt('Reading stationed troops (home + supports)...') + ` (${candidates.length})`);

        const troopsByVillageId = await fetchStationedTroopsForVillages(candidates.map(v => v.villageId));

        // 3) decidir quais precisam stack
        const realLimit = stackLimit * 1000;

        let need = [];
        candidates.forEach((v) => {
          const troops = troopsByVillageId[v.villageId] || {};
          const pop = calculatePop(troops);

          let should = pop < realLimit;
          for (let [unit, amount] of Object.entries(unitAmounts || {})) {
            if (Number(troops?.[unit] ?? 0) < amount) should = true;
          }

          if (should) {
            const missingTroops = calculateMissingTroops(troops, unitAmounts, parseInt(v.fieldsAway, 10), scaleDownPerField);
            need.push({ ...v, troops, pop, missingTroops });
          }
        });

        if (!need.length) {
          UI.SuccessMessage(twSDK.tt('All villages have been properly stacked!'));
          return;
        }

        need.sort((a, b) => a.fieldsAway - b.fieldsAway);

        jQuery('#raStacks').show().html(buildVillagesTable(need));
        jQuery('#raExport').attr('data-stack-plans', JSON.stringify(need));

        UI.SuccessMessage(`OK: analisadas ${candidates.length}, faltando stack em ${need.length}.`);
      });
    }

    function handleExport() {
      jQuery('#raExport').on('click', function (e) {
        e.preventDefault();

        const data = jQuery(this).attr('data-stack-plans');
        if (!data) {
          UI.ErrorMessage('Nada para exportar ainda.');
          return;
        }

        const stackPlans = JSON.parse(data);
        if (!stackPlans.length) {
          UI.ErrorMessage(twSDK.tt('No stack plans have been prepared!'));
          return;
        }

        let bb = `[table][**]#[||]${twSDK.tt('Village')}[||]${twSDK.tt('Missing Troops')}[||]${twSDK.tt('Distance')}[/**]\n`;
        stackPlans.forEach((sp, i) => {
          const miss = buildMissingTroopsString(sp.missingTroops);
          bb += `[*]${i + 1}[|] ${sp.villageCoords} [|]${miss}[|]${sp.fieldsAway}\n`;
        });
        bb += `[/table]`;

        twSDK.copyToClipboard(bb);
        UI.SuccessMessage(twSDK.tt('Copied on clipboard!'));
      });
    }

    // =========================
    // Fetch: lista das suas aldeias
    // =========================
    async function fetchMyVillagesList() {
      // Página mais estável pra listar aldeias: overview_villages (qualquer modo) geralmente tem a tabela de aldeias com links contendo village/id
      // Vamos tentar alguns modes e parar no primeiro que renderiza uma tabela com links de aldeia.
      const base =
        `/game.php?screen=overview_villages&village=${game_data.village.id}` +
        (game_data.player.sitter != '0' ? `&t=${game_data.player.id}` : '');

      const tries = [
        base + '&mode=prod',
        base + '&mode=combined',
        base + '&mode=units',
        base,
      ];

      for (const url of tries) {
        try {
          const html = await jQuery.get(url);
          const doc = jQuery.parseHTML(html);

          // achar links para trocar aldeia (normalmente tem ?village=ID)
          // e também linhas com coordenadas
          const rows = jQuery(doc).find('table.vis tbody tr');
          if (!rows.length) continue;

          const out = [];
          rows.each(function () {
            const $tr = jQuery(this);
            const txt = $tr.text();
            const coords = (txt.match(twSDK.coordsRegex) || [null])[0];
            if (!coords) return;

            // link da aldeia
            const $a = $tr.find('a[href*="village="]').first();
            if (!$a.length) return;

            const href = $a.attr('href') || '';
            const vid = parseInt(twSDK.getParameterByName('village', window.location.origin + href), 10);
            if (!Number.isFinite(vid)) return;

            const name = $a.text().trim() || `Aldeia ${coords}`;
            out.push({ villageId: vid, villageName: name, villageCoords: coords });
          });

          if (out.length) return dedupeById(out);
        } catch (e) {
          if (DEBUG) console.error('fetchMyVillagesList fail', url, e);
        }
      }

      return [];

      function dedupeById(arr) {
        const m = {};
        arr.forEach(v => { if (!m[v.villageId]) m[v.villageId] = v; });
        return Object.values(m);
      }
    }

    // =========================
    // Fetch: tropas estacionadas (casa + apoio) via info_village → "Defesas"
    // =========================
    async function fetchStationedTroopsForVillages(villageIds) {
      // controla concorrência pra não travar
      const CONCURRENCY = 6;
      const queue = [...villageIds];
      const result = {};

      let done = 0;

      async function worker() {
        while (queue.length) {
          const vid = queue.shift();
          try {
            const troops = await fetchStationedTroopsFromInfoVillage(vid);
            result[vid] = troops || {};
          } catch (e) {
            if (DEBUG) console.error('info_village parse error', vid, e);
            result[vid] = {};
          }
          done++;
          if (done % 10 === 0) UI.InfoMessage(`[FSP] analisadas ${done}/${villageIds.length} aldeias…`);
        }
      }

      const workers = Array.from({ length: CONCURRENCY }, () => worker());
      await Promise.all(workers);
      return result;
    }

    async function fetchStationedTroopsFromInfoVillage(villageId) {
      const url =
        `/game.php?screen=info_village&id=${villageId}` +
        (game_data.player.sitter != '0' ? `&t=${game_data.player.id}` : '');

      const html = await jQuery.get(url);
      const doc = jQuery.parseHTML(html);

      // localizar a tabela "Defesas" (na sua print é o bloco Defesas com ícones de unidade)
      // Estratégia:
      // 1) pegar todas tabelas .vis
      // 2) escolher a que tem img unit_ e que esteja perto de um título "Defesas"
      const $allTables = jQuery(doc).find('table.vis');
      if (!$allTables.length) throw new Error('no tables');

      let $defTable = null;

      // tenta achar pelo texto "Defesas" no container anterior
      jQuery(doc).find('h2, h3, .vis_title, .vis_title strong, legend').each(function () {
        const t = jQuery(this).text().trim().toLowerCase();
        if (t.includes('defes') || t.includes('defens')) {
          // pega a primeira tabela vis depois disso
          const $next = jQuery(this).closest('div').find('table.vis').first();
          if ($next.length) $defTable = $next;
        }
      });

      // fallback: primeira tabela que tenha ícones de unidades e uma coluna "Origem"
      if (!$defTable || !$defTable.length) {
        $allTables.each(function () {
          if ($defTable) return;
          const $t = jQuery(this);
          const hasUnits = $t.find('img[src*="/graphic/unit/unit_"]').length > 0;
          const hasOrigem = $t.find('th,td').first().text().toLowerCase().includes('origem');
          if (hasUnits && hasOrigem) $defTable = $t;
        });
      }

      if (!$defTable || !$defTable.length) {
        throw new Error(twSDK.tt('Could not read defense table.'));
      }

      // mapear colunas por unidade a partir do thead
      const unitColIndex = {};
      const $theadRows = $defTable.find('thead tr');
      const $iconRow = $theadRows.length ? $theadRows.last() : null;
      if (!$iconRow || !$iconRow.length) throw new Error('no thead icons');

      $iconRow.find('th').each(function (i) {
        const $img = jQuery(this).find('img[src*="/graphic/unit/unit_"]');
        if (!$img.length) return;
        const src = $img.attr('src') || '';
        const m = src.match(/unit_([a-z0-9_]+)\./i);
        if (!m || !m[1]) return;
        const unit = m[1];
        if (unitColIndex[unit] === undefined) unitColIndex[unit] = i;
      });

      const unitsInTable = game_data.units.filter(u => unitColIndex[u] !== undefined);
      if (!unitsInTable.length) throw new Error('no units cols');

      // somar todas as linhas do tbody (Desta aldeia + apoios)
      const totals = {};
      unitsInTable.forEach(u => totals[u] = 0);

      $defTable.find('tbody tr').each(function () {
        const $tr = jQuery(this);
        const $tds = $tr.find('td');
        if (!$tds.length) return;

        unitsInTable.forEach((unit) => {
          const idx = unitColIndex[unit];
          const raw = jQuery($tds.get(idx)).text().trim();
          const n = parseInt((raw || '0').replace(/[^\d]/g, ''), 10);
          if (Number.isFinite(n)) totals[unit] += n;
        });
      });

      return totals;
    }
  }
})();
