/* 
 * Frontline Stacks Planner — MEMBER version (BR138-friendly) — SUPPORT-AWARE v2
 * Agora busca explicitamente "type=home" (in village), "type=all" (inclui apoio)
 * e "type=support" (somente apoio), quando o mundo suportar.
 *
 * Como usar:
 * - Rodar no mapa (screen=map)
 * - Se ainda ficar igual, abra "Visão geral > Tropas" e selecione a aba "Todos" (All)
 *   e rode o script novamente (alguns mundos só carregam certas abas depois de você abrir).
 */

// User Input
if (typeof DEBUG !== 'boolean') DEBUG = false;
if (typeof HC_AMOUNT === 'undefined') HC_AMOUNT = null;

// TROOPS_SCOPE = 'in_village' | 'total' | 'support'
if (typeof TROOPS_SCOPE === 'undefined') TROOPS_SCOPE = 'total';

(function BOOT() {
    const START_TS = Date.now();

    function bootReady() {
        return (
            typeof window !== 'undefined' &&
            window.jQuery &&
            window.game_data &&
            window.UI &&
            typeof window.game_data === 'object'
        );
    }

    function bootFail(msg) {
        try { if (window.UI && UI.ErrorMessage) UI.ErrorMessage(msg); } catch (_) {}
        console.error(msg);
    }

    function bootInfo(msg) {
        try { if (window.UI && UI.InfoMessage) UI.InfoMessage(msg); } catch (_) {}
        console.log(msg);
    }

    (function waitLoop() {
        if (bootReady()) {
            bootInfo('[Frontline Stacks Planner] iniciado… (boot OK)');
            try { main(); }
            catch (e) {
                bootFail('[Frontline Stacks Planner] erro ao iniciar: ' + (e?.message || e));
                console.error(e);
            }
            return;
        }

        if (Date.now() - START_TS > 10000) {
            bootFail('[Frontline Stacks Planner] não conseguiu inicializar (jQuery/UI/game_data ausentes). Execute com a página carregada.');
            return;
        }

        setTimeout(waitLoop, 100);
    })();

    async function main() {
        var scriptConfig = {
            scriptData: {
                prefix: 'frontlineStacksPlanner',
                name: `Frontline Stacks Planner`,
                version: 'v1.0.3-member-support-aware-v2',
            },
            translations: {
                en_DK: {
                    'Frontline Stacks Planner': 'Frontline Stacks Planner',
                    'There was an error!': 'There was an error!',
                    'Redirecting...': 'Redirecting...',
                    'Start typing and suggestions will show ...':
                        'Start typing and suggestions will show ...',
                    'Select enemy tribes': 'Select enemy tribes',
                    Distance: 'Distance',
                    'Stack Limit': 'Stack Limit',
                    'Scale down per field (k)': 'Scale down per field (k)',
                    'Required Stack Amount': 'Required Stack Amount',
                    'Calculate Stacks': 'Calculate Stacks',
                    'Find Backline Stacks': 'Find Backline Stacks',
                    'You need to select an enemy tribe!':
                        'You need to select an enemy tribe!',
                    Village: 'Village',
                    Map: 'Map',
                    'Pop.': 'Pop.',
                    'Missing Troops': 'Missing Troops',
                    'All villages have been properly stacked!':
                        'All villages have been properly stacked!',
                    Export: 'Export',
                    'No stack plans have been prepared!':
                        'No stack plans have been prepared!',
                    'Copied on clipboard!': 'Copied on clipboard!',
                    'Could not read your troops from overview!':
                        'Could not read your troops from overview!',
                    'Troops source': 'Troops source',
                    'In village': 'In village',
                    'Total (incl. support)': 'Total (incl. support)',
                    'Support only': 'Support only',
                    'Reading troops...': 'Reading troops...',
                    'This world does not expose support on this overview.':
                        'This world does not expose support on this overview.',
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

            tt: function (string) {
                return (this.translations[game_data.locale] && this.translations[game_data.locale][string]) ||
                       (this.translations['en_DK'] && this.translations['en_DK'][string]) ||
                       string;
            },

            getParameterByName: function (name, url = window.location.href) {
                return new URL(url).searchParams.get(name);
            },

            cleanString: function (string) {
                try { return decodeURIComponent(string).replace(/\+/g, ' '); }
                catch (_) { return string; }
            },

            copyToClipboard: function (string) {
                navigator.clipboard.writeText(string);
            },

            calculateDistance: function (from, to) {
                const [x1, y1] = from.split('|');
                const [x2, y2] = to.split('|');
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
                    const strMatchedDelimiter = arrMatches[1];
                    if (strMatchedDelimiter.length && strMatchedDelimiter !== strDelimiter) arrData.push([]);
                    let strMatchedValue;
                    if (arrMatches[2]) strMatchedValue = arrMatches[2].replace(new RegExp('""', 'g'), '"');
                    else strMatchedValue = arrMatches[3];
                    arrData[arrData.length - 1].push(strMatchedValue);
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
                        <div class="${mainClass}-header">
                            <h3>${this.tt(this.scriptData.name)}</h3>
                        </div>
                        <div class="${mainClass}-body">${body}</div>
                        <div class="${mainClass}-footer">
                            <small><strong>${this.tt(this.scriptData.name)} ${this.scriptData.version}</strong></small>
                        </div>
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
                            entity === 'player'  ? this.worldDataPlayers :
                            entity === 'ally'    ? this.worldDataTribes : null;
                if (!url) throw new Error('invalid entity: ' + entity);

                const raw = await jQuery.get(url);
                const rows = this.csvToArray(raw).filter(r => r[0] !== '');

                if (entity === 'village') return rows.map(r => [parseInt(r[0],10), this.cleanString(r[1]), r[2], r[3], parseInt(r[4],10), parseInt(r[5],10)]);
                if (entity === 'player')  return rows.map(r => [parseInt(r[0],10), this.cleanString(r[1]), parseInt(r[2],10), parseInt(r[3],10), parseInt(r[4],10), parseInt(r[5],10)]);
                if (entity === 'ally')    return rows.map(r => [parseInt(r[0],10), this.cleanString(r[1]), this.cleanString(r[2]), parseInt(r[3],10), parseInt(r[4],10), parseInt(r[5],10), parseInt(r[6],10), parseInt(r[7],10)]);
            },
        };

        await twSDK.init(scriptConfig);

        const scriptInfo = twSDK.scriptInfo();
        UI.InfoMessage(`${scriptInfo} rodando…`);

        if (!twSDK.checkScreen()) {
            UI.InfoMessage(twSDK.tt('Redirecting...'));
            twSDK.redirectTo('map');
            return;
        }

        const hcPopAmount = HC_AMOUNT ?? twSDK.unitsFarmSpace['heavy'];
        const DEFAULT_VALUES = { DISTANCE: 5, STACK: 100, SCALE_PER_FIELD: 5 };

        let villages = [], players = [], tribes = [];
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

        const initialScope = normalizeScope(TROOPS_SCOPE);
        const myVillagesData = await fetchMyVillagesTroops(initialScope);

        if (!myVillagesData.length) {
            UI.ErrorMessage(`${scriptInfo}: não consegui ler suas tropas em Visão geral > Tropas.`);
            UI.InfoMessage(`Abra: Visão geral → Tropas, selecione "Todos" (All) e rode de novo.`);
            return;
        }

        const playersData = [{
            id: game_data.player.id,
            name: game_data.player.name,
            villagesData: myVillagesData
        }];

        buildUI(initialScope);
        handleTroopsSourceChange(playersData);
        handleCalculateStackPlans(playersData);
        handleExport();

        UI.SuccessMessage(`${scriptInfo}: pronto! (aldeias lidas: ${myVillagesData.length})`);

        // ======================
        // UI
        // ======================

        function buildUI(scope) {
            const enemyTribePickerHtml = buildEnemyTribePicker(tribes, 'Tribes');
            const troopAmountsHtml = buildUnitsChooserTable();

            const scopeLabel = twSDK.tt('Troops source');
            const inVillageLabel = twSDK.tt('In village');
            const totalLabel = twSDK.tt('Total (incl. support)');
            const supportLabel = twSDK.tt('Support only');

            const content = `
                <div class="ra-mb15">
                    <div class="ra-grid">
                        <div>${enemyTribePickerHtml}</div>

                        <div>
                            <label for="raTroopsScope" class="ra-label">${scopeLabel}</label>
                            <select id="raTroopsScope" class="ra-input">
                                <option value="in_village" ${scope === 'in_village' ? 'selected' : ''}>${inVillageLabel}</option>
                                <option value="total" ${scope === 'total' ? 'selected' : ''}>${totalLabel}</option>
                                <option value="support" ${scope === 'support' ? 'selected' : ''}>${supportLabel}</option>
                            </select>
                            <small style="display:block;margin-top:6px;opacity:.85">
                                Se "Total" ficar igual ao "In village", o mundo pode não expor apoio nessa aba.
                            </small>
                        </div>

                        <div>
                            <label for="raDistance" class="ra-label">${twSDK.tt('Distance')}</label>
                            <input type="number" class="ra-input" id="raDistance" value="${DEFAULT_VALUES.DISTANCE}">
                        </div>

                        <div>
                            <label for="raStack" class="ra-label">${twSDK.tt('Stack Limit')}</label>
                            <input type="number" class="ra-input" id="raStack" value="${DEFAULT_VALUES.STACK}">
                        </div>
                    </div>
                </div>

                <div class="ra-mb15">
                    <div class="ra-grid2">
                        <div>
                            <label for="raScalePerField" class="ra-label">${twSDK.tt('Scale down per field (k)')}</label>
                            <input type="number" class="ra-input" id="raScalePerField" value="${DEFAULT_VALUES.SCALE_PER_FIELD}">
                        </div>
                        <div>
                            <label class="ra-label">${twSDK.tt('Required Stack Amount')}</label>
                            ${troopAmountsHtml}
                        </div>
                    </div>
                </div>

                <div>
                    <a href="javascript:void(0);" id="raPlanStacks" class="btn">${twSDK.tt('Calculate Stacks')}</a>
                    <a href="javascript:void(0);" id="raExport" class="btn" data-stack-plans="">${twSDK.tt('Export')}</a>
                </div>

                <div class="ra-mt15 ra-table-container" id="raStacks" style="display:none;"></div>
            `;

            const customStyle = `
                .ra-grid { display:grid; grid-template-columns: 1.2fr .9fr .8fr .8fr; grid-gap: 15px; align-items: start; }
                .ra-grid2 { display:grid; grid-template-columns: .7fr 1.3fr; grid-gap: 15px; }
                .ra-input { width:100% !important; padding:5px; font-size:14px; }
                .ra-label { margin-bottom:6px; font-weight:600; display:block; }
                @media(max-width: 900px){
                    .ra-grid{grid-template-columns:1fr; }
                    .ra-grid2{grid-template-columns:1fr; }
                }
            `;

            twSDK.renderBoxWidget(content, scriptConfig.scriptData.prefix, 'ra-frontline-stacks', customStyle);
        }

        function handleTroopsSourceChange(playersData) {
            jQuery('#raTroopsScope').on('change', async function () {
                const scope = normalizeScope(jQuery(this).val());
                UI.InfoMessage(`${scriptInfo}: ${twSDK.tt('Reading troops...')} (${scope})`);

                const refreshed = await fetchMyVillagesTroops(scope);
                if (!refreshed.length) {
                    UI.ErrorMessage(`${scriptInfo}: falhou ao reler tropas (${scope}).`);
                    return;
                }

                playersData[0].villagesData = refreshed;
                jQuery('#raStacks').hide().html('');
                jQuery('#raExport').attr('data-stack-plans', '');
                UI.SuccessMessage(`${scriptInfo}: tropas atualizadas (${refreshed.length} aldeias).`);
            });
        }

        function buildEnemyTribePicker(array, entity) {
            array.sort((a, b) => parseInt(a[7],10) - parseInt(b[7],10));
            let dropdown = `<label for="ra${entity}" class="ra-label">${twSDK.tt('Select enemy tribes')}</label>
                <input type="text" class="ra-input" list="raSelect${entity}" placeholder="${twSDK.tt('Start typing and suggestions will show ...')}" id="ra${entity}">
                <datalist id="raSelect${entity}">`;

            array.forEach((item) => {
                if (item[0].length !== 0) {
                    dropdown += `<option value="${twSDK.cleanString(item[2])}">`;
                }
            });

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
        // CORE: stack calc
        // ======================

        function collectUserInput() {
            let chosenTribes = (jQuery('#raTribes').val() || '').trim();
            let distance = parseInt(jQuery('#raDistance').val(), 10);
            let stackLimit = parseInt(jQuery('#raStack').val(), 10);
            let scaleDownPerField = parseInt(jQuery('#raScalePerField').val(), 10);
            let unitAmounts = {};

            if (!chosenTribes) {
                UI.ErrorMessage(twSDK.tt('You need to select an enemy tribe!'));
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
                    if (twSDK.cleanString(it[index]) === twSDK.cleanString(chosen)) {
                        ids.push(parseInt(it[0],10));
                    }
                });
            });
            return ids;
        }

        function getTribeMembersById(tribeIds) {
            return players
                .filter(p => tribeIds.includes(parseInt(p[2],10)))
                .map(p => parseInt(p[0],10));
        }

        function filterVillagesByPlayerIds(playerIds) {
            return villages
                .filter(v => playerIds.includes(parseInt(v[4],10)))
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
                let need = value - parseInt(distance,10) * scaleDownPerField * 1000;
                if (need > 0 && !nonScaling.includes(unit)) {
                    const have = Number(troops?.[unit] ?? 0);
                    missing[unit] = Math.abs(Math.trunc(have - need));
                }
            }
            return missing;
        }

        function calculateAmountMissingTroops(villagesThatNeedStack, unitAmounts, scaleDownPerField) {
            return villagesThatNeedStack.map(v => ({
                ...v,
                missingTroops: calculateMissingTroops(v.troops, unitAmounts, parseInt(v.fieldsAway,10), scaleDownPerField)
            }));
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

        function findVillagesThatNeedStack(playersData, chosenTribes, distance, unitAmount, stackLimit) {
            const myVillages = playersData.map(p => p.villagesData).flat();

            const chosenTribeIds = getEntityIdsByArrayIndex(chosenTribes, tribes, 2);
            const tribePlayers = getTribeMembersById(chosenTribeIds);
            const enemyCoords = filterVillagesByPlayerIds(tribePlayers);

            let within = [];
            myVillages.forEach((v) => {
                enemyCoords.forEach((ec) => {
                    const d = twSDK.calculateDistance(ec, v.villageCoords);
                    if (d <= distance) within.push({ ...v, fieldsAway: Math.round(d * 100) / 100 });
                });
            });

            const realLimit = stackLimit * 1000;
            let need = [];
            within.forEach((v) => {
                const pop = calculatePop(v.troops);
                let should = pop < realLimit;

                for (let [unit, amount] of Object.entries(unitAmount || {})) {
                    if (Number(v.troops?.[unit] ?? 0) < amount) should = true;
                }

                if (should) need.push({ ...v, pop });
            });

            const uniq = {};
            need.sort((a,b)=>a.fieldsAway-b.fieldsAway).forEach(it => { if (!uniq[it.villageId]) uniq[it.villageId] = it; });
            return Object.values(uniq);
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
                const [x,y] = v.villageCoords.split('|');
                html += `
                    <tr>
                        <td>${i+1}</td>
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
            jQuery('#raPlanStacks').on('click', function (e) {
                e.preventDefault();

                const { chosenTribes, distance, unitAmounts, stackLimit, scaleDownPerField } = collectUserInput();
                if (!chosenTribes.length) return;

                const villagesThatNeedStack = findVillagesThatNeedStack(playersData, chosenTribes, distance, unitAmounts, stackLimit);

                if (villagesThatNeedStack.length) {
                    const toStack = calculateAmountMissingTroops(villagesThatNeedStack, unitAmounts, scaleDownPerField);
                    toStack.sort((a,b)=>a.fieldsAway-b.fieldsAway);

                    jQuery('#raStacks').show().html(buildVillagesTable(toStack));
                    jQuery('#raExport').attr('data-stack-plans', JSON.stringify(toStack));
                } else {
                    UI.SuccessMessage(twSDK.tt('All villages have been properly stacked!'));
                }
            });
        }

        function handleExport() {
            jQuery('#raExport').on('click', function (e) {
                e.preventDefault();

                const data = jQuery(this).attr('data-stack-plans');
                if (!data) {
                    UI.ErrorMessage(twSDK.tt('No stack plans have been prepared!'));
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
                    bb += `[*]${i+1}[|] ${sp.villageCoords} [|]${miss}[|]${sp.fieldsAway}\n`;
                });
                bb += `[/table]`;

                twSDK.copyToClipboard(bb);
                UI.SuccessMessage(twSDK.tt('Copied on clipboard!'));
            });
        }

        function normalizeScope(s) {
            if (s === 'support') return 'support';
            if (s === 'in_village') return 'in_village';
            return 'total';
        }

        // ======================
        // DATA: suas tropas (type=home/all/support)
        // ======================
        async function fetchMyVillagesTroops(scope) {
            const base =
                `/game.php?screen=overview_villages&mode=units&village=${game_data.village.id}` +
                (game_data.player.sitter != '0' ? `&t=${game_data.player.id}` : '');

            // Tenta tipos “oficiais” mais comuns do TW.
            // Se o mundo não reconhecer, ele devolve a mesma página — e a gente detecta.
            const candidates = (() => {
                if (scope === 'in_village') return [
                    base + `&type=home`,
                    base + `&type=in_village`,
                    base, // fallback
                ];
                if (scope === 'support') return [
                    base + `&type=support`,
                    base + `&type=help`,
                    base,
                ];
                // total
                return [
                    base + `&type=all`,
                    base + `&type=combined`,
                    base + `&type=total`,
                    base,
                ];
            })();

            // vamos tentar até achar uma variação real
            let lastParsed = [];
            let lastSignature = null;

            for (let i = 0; i < candidates.length; i++) {
                const url = candidates[i];
                try {
                    UI.InfoMessage(`[FSP] ${twSDK.tt('Reading troops...')} (${scope}) [try ${i+1}/${candidates.length}]`);

                    const html = await jQuery.get(url);
                    const parsed = parseUnitsOverview(html);

                    if (!parsed.length) continue;

                    // cria uma assinatura rápida (primeira aldeia + soma de tropas)
                    const sig = signature(parsed);

                    lastParsed = parsed;
                    if (lastSignature === null) {
                        lastSignature = sig;
                        // continua tentando se scope=total para achar uma página diferente da "home"
                        if (scope !== 'total') return parsed;
                    } else {
                        // se mudou, achamos uma aba diferente -> retorna
                        if (sig !== lastSignature) return parsed;
                    }

                    // se for a última tentativa, retorna o que tiver
                    if (i === candidates.length - 1) return parsed;

                } catch (e) {
                    if (DEBUG) console.error('fetchMyVillagesTroops error on', url, e);
                    continue;
                }
            }

            return lastParsed;

            function signature(arr) {
                const a = arr[0];
                const sum = Object.values(a.troops || {}).reduce((acc, n) => acc + (Number(n) || 0), 0);
                return `${a.villageId}|${a.villageCoords}|${sum}`;
            }

            function parseUnitsOverview(html) {
                const doc = jQuery.parseHTML(html);

                // encontra tabela que tem ícones de unidade
                let $table = jQuery(doc).find('table#units_table').first();
                if (!$table.length) {
                    jQuery(doc).find('table.vis').each(function () {
                        const $t = jQuery(this);
                        if (!$table.length && $t.find('img[src*="/graphic/unit/unit_"]').length) $table = $t;
                    });
                }
                if (!$table.length) return [];

                // descobre colunas por unit (pega a PRIMEIRA ocorrência de cada unit na header)
                // (quando o tipo=all/home/suport muda de verdade, a própria tabela muda, então já resolve)
                const unitColIndex = {};
                const $thead = $table.find('thead tr');
                const $iconRow = $thead.length ? $thead.last() : null;
                if (!$iconRow || !$iconRow.length) return [];

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
                if (!unitsInTable.length) return [];

                const out = [];
                $table.find('tbody tr').each(function () {
                    const $tr = jQuery(this);
                    const $tds = $tr.find('td');
                    if ($tds.length < 2) return;

                    const $a = $tr.find('td').first().find('a').first();
                    if (!$a.length) return;

                    const href = $a.attr('href') || '';
                    let villageId = parseInt(twSDK.getParameterByName('id', window.location.origin + href), 10);
                    if (!Number.isFinite(villageId)) {
                        const v2 = parseInt(twSDK.getParameterByName('village', window.location.origin + href), 10);
                        if (Number.isFinite(v2)) villageId = v2;
                    }
                    if (!Number.isFinite(villageId)) return;

                    const text = $tr.text();
                    const coords = (text.match(twSDK.coordsRegex) || [null])[0];
                    if (!coords) return;

                    const name = $a.text().trim() || `Aldeia ${coords}`;

                    const troops = {};
                    unitsInTable.forEach((unit) => {
                        const idx = unitColIndex[unit];
                        const raw = jQuery($tds.get(idx)).text().trim();
                        const n = parseInt((raw || '0').replace(/[^\d]/g, ''), 10);
                        troops[unit] = Number.isFinite(n) ? n : 0;
                    });

                    out.push({ villageId, villageName: name, villageCoords: coords, troops });
                });

                return out;
            }
        }
    }
})();
