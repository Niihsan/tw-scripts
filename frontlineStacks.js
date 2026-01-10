/* 
 * Frontline Stacks Planner — MEMBER version (BR138-friendly) — FIXED TROOPS PARSER
 * Adaptado para membro: planeja SOMENTE suas aldeias (lê overview_villages&mode=units)
 * Correção: agora lê SOMENTE o bloco "Na aldeia" (evita pegar Total/Fora e dar falso “stacked”)
 *
 * Rodar no mapa (screen=map)
 */

// User Input
if (typeof DEBUG !== 'boolean') DEBUG = false;
if (typeof HC_AMOUNT === 'undefined') HC_AMOUNT = null;

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
        try {
            if (window.UI && UI.ErrorMessage) UI.ErrorMessage(msg);
        } catch (_) {}
        console.error(msg);
    }

    function bootInfo(msg) {
        try {
            if (window.UI && UI.InfoMessage) UI.InfoMessage(msg);
        } catch (_) {}
        console.log(msg);
    }

    (function waitLoop() {
        if (bootReady()) {
            bootInfo('[Frontline Stacks Planner] iniciado… (boot OK)');
            try {
                main();
            } catch (e) {
                bootFail('[Frontline Stacks Planner] erro ao iniciar: ' + (e?.message || e));
                console.error(e);
            }
            return;
        }

        if (Date.now() - START_TS > 10000) {
            bootFail('[Frontline Stacks Planner] não conseguiu inicializar (jQuery/UI/game_data ausentes). Tente executar novamente na página totalmente carregada.');
            return;
        }

        setTimeout(waitLoop, 100);
    })();

    async function main() {
        // Script Config
        var scriptConfig = {
            scriptData: {
                prefix: 'frontlineStacksPlanner',
                name: `Frontline Stacks Planner`,
                version: 'v1.0.3-member-fixed',
                author: 'RedAlert + member adaptation',
                authorUrl: 'https://twscripts.dev/',
                helpLink:
                    'https://forum.tribalwars.net/index.php?threads/frontline-stacks-planner.291478/',
            },
            translations: {
                en_DK: {
                    'Frontline Stacks Planner': 'Frontline Stacks Planner',
                    Help: 'Help',
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
                    'Reading troops in-village block...':
                        'Reading troops in-village block...',
                },
            },
            allowedScreens: ['map'],
            isDebug: DEBUG,
        };

        // Minimal twSDK (só o necessário)
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

        // SINAL DE VIDA
        UI.InfoMessage(`${scriptInfo} rodando (screen=${twSDK.getParameterByName('screen') || '???'})`);

        if (!twSDK.checkScreen()) {
            UI.InfoMessage(twSDK.tt('Redirecting...'));
            twSDK.redirectTo('map');
            return;
        }

        const hcPopAmount = HC_AMOUNT ?? twSDK.unitsFarmSpace['heavy'];

        const DEFAULT_VALUES = { DISTANCE: 5, STACK: 100, SCALE_PER_FIELD: 5 };

        // Carrega world data
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

        // Puxa suas tropas (FIX: bloco "Na aldeia")
        const myVillagesData = await fetchMyVillagesTroops();
        if (!myVillagesData.length) {
            UI.ErrorMessage(`${scriptInfo}: não consegui ler suas tropas em Visão geral > Tropas.`);
            UI.InfoMessage(`Abra: Visão geral → Tropas (overview_villages&mode=units), volte pro mapa e execute de novo.`);
            return;
        }

        const playersData = [{
            id: game_data.player.id,
            name: game_data.player.name,
            villagesData: myVillagesData
        }];

        // UI
        buildUI();
        handleCalculateStackPlans(playersData);
        handleBacklineStacks(playersData);
        handleExport();

        UI.SuccessMessage(`${scriptInfo}: pronto! (aldeias lidas: ${myVillagesData.length})`);

        // ======================
        // UI builders + actions
        // ======================

        function buildUI() {
            const enemyTribePickerHtml = buildEnemyTribePicker(tribes, 'Tribes');
            const troopAmountsHtml = buildUnitsChooserTable();

            const content = `
                <div class="ra-mb15">
                    <div class="ra-grid">
                        <div>
                            ${enemyTribePickerHtml}
                        </div>
                        <div>
                            <label for="raDistance" class="ra-label">${twSDK.tt('Distance')}</label>
                            <input type="number" class="ra-input" id="raDistance" value="${DEFAULT_VALUES.DISTANCE}">
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
                    <a href="javascript:void(0);" id="raBacklineStacks" class="btn">${twSDK.tt('Find Backline Stacks')}</a>
                    <a href="javascript:void(0);" id="raExport" class="btn" data-stack-plans="">${twSDK.tt('Export')}</a>
                </div>

                <div class="ra-mt15 ra-table-container" id="raStacks" style="display:none;"></div>
            `;

            const customStyle = `
                .ra-grid { display:grid; grid-template-columns: 1fr 1fr 1fr 1fr; grid-gap: 15px; }
                .ra-input { width:100% !important; padding:5px; font-size:14px; }
                .ra-label { margin-bottom:6px; font-weight:600; display:block; }
            `;

            twSDK.renderBoxWidget(content, scriptConfig.scriptData.prefix, 'ra-frontline-stacks', customStyle);
        }

        function buildEnemyTribePicker(array, entity) {
            array.sort((a, b) => parseInt(a[7],10) - parseInt(b[7],10));
            let dropdown = `<label for="ra${entity}" class="ra-label">${twSDK.tt('Select enemy tribes')}</label>
                <input type="text" class="ra-input" list="raSelect${entity}" placeholder="${twSDK.tt('Start typing and suggestions will show ...')}" id="ra${entity}">
                <datalist id="raSelect${entity}">`;

            array.forEach((item) => {
                if (item[0].length !== 0) {
                    const tag = item[2];
                    dropdown += `<option value="${twSDK.cleanString(tag)}">`;
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

            // permite múltiplas tags separadas por vírgula
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
                const pop = key !== 'heavy' ? (twSDK.unitsFarmSpace[key] || 1) : hcPopAmount;
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

            // dentro do raio
            let within = [];
            myVillages.forEach((v) => {
                enemyCoords.forEach((ec) => {
                    const d = twSDK.calculateDistance(ec, v.villageCoords);
                    if (d <= distance) within.push({ ...v, fieldsAway: Math.round(d * 100) / 100 });
                });
            });

            // precisa stack?
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

            // unique por villageId
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

        function handleBacklineStacks(playersData) {
            jQuery('#raBacklineStacks').on('click', function (e) {
                e.preventDefault();

                const { chosenTribes, distance } = collectUserInput();
                if (!chosenTribes.length) return;

                const myVillages = playersData.map(p => p.villagesData).flat();

                const chosenTribeIds = getEntityIdsByArrayIndex(chosenTribes, tribes, 2);
                const tribePlayers = getTribeMembersById(chosenTribeIds);
                const enemyCoords = filterVillagesByPlayerIds(tribePlayers);

                let outside = [];

                myVillages.forEach((v) => {
                    enemyCoords.forEach((ec) => {
                        const d = twSDK.calculateDistance(ec, v.villageCoords);
                        if (d > distance) {
                            const pop = calculatePop(v.troops);
                            if (pop > 30000) outside.push({ ...v, fieldsAway: Math.round(d*100)/100, stackAmount: pop });
                        }
                    });
                });

                outside.sort((a,b)=>a.fieldsAway-b.fieldsAway);
                const uniq = {};
                outside.forEach(it => { if (!uniq[it.villageId]) uniq[it.villageId] = it; });

                const rows = Object.values(uniq).map((v, idx) => `
                    <tr>
                        <td>${idx+1}</td>
                        <td class="ra-tal"><a href="/game.php?screen=info_village&id=${v.villageId}" target="_blank">${v.villageName}</a></td>
                        <td>${intToString(v.stackAmount)}</td>
                        <td>${v.fieldsAway}</td>
                    </tr>
                `).join('');

                const html = `
                    <div class="ra-table-container ra-mb15">
                        <table class="ra-table ra-table-v3" width="100%">
                            <thead><tr><th>#</th><th class="ra-tal">${twSDK.tt('Village')}</th><th>${twSDK.tt('Pop.')}</th><th>${twSDK.tt('Distance')}</th></tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                `;

                // popup simples sem draggable (evita erro em mundos/clients sem jQueryUI)
                const id = 'raFrontlineStacks-popup';
                jQuery('#' + id).remove();
                jQuery('body').append(`
                    <div id="${id}" style="position:fixed;top:10vh;right:10vh;z-index:99999;border:2px solid #7d510f;border-radius:10px;padding:10px;width:560px;max-height:70vh;overflow:auto;background:#e3d5b3 url('/graphic/index/main_bg.jpg') repeat;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                            <strong>${scriptInfo}</strong>
                            <a href="#" id="${id}_close" style="font-weight:bold;text-decoration:none;">X</a>
                        </div>
                        ${html}
                    </div>
                `);
                jQuery('#' + id + '_close').on('click', function(ev){ ev.preventDefault(); jQuery('#' + id).remove(); });
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

        // ======================
        // DATA: suas tropas (FIXED)
        // ======================
        async function fetchMyVillagesTroops() {
            let url = `/game.php?screen=overview_villages&mode=units&village=${game_data.village.id}`;
            if (game_data.player.sitter != '0') url += `&t=${game_data.player.id}`;

            UI.InfoMessage(`${scriptInfo}: ${twSDK.tt('Reading troops in-village block...')}`);

            try {
                const html = await jQuery.get(url);
                const doc = jQuery.parseHTML(html);

                // 1) acha a tabela de unidades
                let $table = jQuery(doc).find('table#units_table').first();
                if (!$table.length) {
                    jQuery(doc).find('table.vis').each(function () {
                        const $t = jQuery(this);
                        if (!$table.length && $t.find('img[src*="/graphic/unit/unit_"]').length) $table = $t;
                    });
                }
                if (!$table.length) {
                    console.error(scriptInfo, 'Não achei tabela de tropas no overview.');
                    return [];
                }

                // 2) Detecta bloco "Na aldeia"/"In village" pelos headers com colspan
                const $theadRows = $table.find('thead tr');
                const $groupRow = $theadRows.eq(0);
                const $iconRow  = $theadRows.length > 1 ? $theadRows.eq(1) : $theadRows.eq(0);

                const IN_VILLAGE_RE = /(na\s+aldeia|na\s+vila|aldeia|in\s+village|village)/i;
                const OUTSIDE_RE    = /(fora|outside|a\s+caminho|em\s+movimento)/i;
                const TOTAL_RE      = /(total|todos|all)/i;

                let targetRange = null;

                if ($groupRow.length && $groupRow.find('th[colspan]').length) {
                    let colCursor = 0;
                    $groupRow.find('th').each(function () {
                        const $th = jQuery(this);
                        const text = ($th.text() || '').trim();
                        const colspan = parseInt($th.attr('colspan') || '1', 10) || 1;

                        const start = colCursor;
                        const end = colCursor + colspan - 1;

                        if (IN_VILLAGE_RE.test(text) && !OUTSIDE_RE.test(text) && !TOTAL_RE.test(text)) {
                            targetRange = { start, end };
                        }

                        colCursor += colspan;
                    });
                }

                // 3) Mapeia unit -> índice de coluna (apenas dentro do range)
                const unitColIndex = {};
                const $ths = $iconRow.find('th');

                $ths.each(function (i) {
                    if (targetRange && (i < targetRange.start || i > targetRange.end)) return;

                    const $img = jQuery(this).find('img[src*="/graphic/unit/unit_"]');
                    if (!$img.length) return;

                    const src = $img.attr('src') || '';
                    const m = src.match(/unit_([a-z0-9_]+)\./i);
                    if (!m || !m[1]) return;

                    const unit = m[1];

                    if (unitColIndex[unit] === undefined) {
                        unitColIndex[unit] = i;
                    }
                });

                const unitsInTable = game_data.units.filter(u => unitColIndex[u] !== undefined);
                if (!unitsInTable.length) {
                    console.error(scriptInfo, 'Não encontrei colunas de unidades dentro do bloco "Na aldeia".');
                    return [];
                }

                // 4) Lê linhas -> aldeias
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

                if (!out.length) {
                    UI.ErrorMessage(`${scriptInfo}: ${twSDK.tt('Could not read your troops from overview!')}`);
                } else {
                    UI.SuccessMessage(`${scriptInfo}: tropas lidas no bloco "Na aldeia" (${out.length} aldeias).`);
                }

                return out;
            } catch (e) {
                console.error(scriptInfo, 'Erro no fetch/parse overview:', e);
                return [];
            }
        }
    }
})();
