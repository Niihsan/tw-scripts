/* 
 * Frontline Stacks Planner — MEMBER version (BR138-friendly)
 * Adaptation: plan ONLY your own villages (no tribe leadership data needed)
 *
 * Runs on: map screen
 * Data source for your troops: /game.php?screen=overview_villages&mode=units
 *
 * Notes:
 * - Works on archer-less worlds (BR138) by dynamically using the units available on the world.
 * - No requirement to be in a tribe.
 */

// User Input
if (typeof DEBUG !== 'boolean') DEBUG = false;
if (typeof HC_AMOUNT === 'undefined') HC_AMOUNT = null;

// Script Config
var scriptConfig = {
    scriptData: {
        prefix: 'frontlineStacksPlanner',
        name: `Frontline Stacks Planner`,
        version: 'v1.0.3',
        author: 'RedAlert & Niihsan',
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
            'Error fetching player incomings!': 'Error fetching data!',
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
        },
    },
    allowedMarkets: [],
    allowedScreens: ['map'],
    allowedModes: [],
    isDebug: DEBUG,
};

window.twSDK = {
    scriptData: {},
    translations: {},
    allowedMarkets: [],
    allowedScreens: [],
    allowedModes: [],
    isDebug: false,

    market: game_data.market,
    units: game_data.units,
    village: game_data.village,
    sitterId: game_data.player.sitter > 0 ? `&t=${game_data.player.id}` : '',
    coordsRegex: /\d{1,3}\|\d{1,3}/g,
    delayBetweenRequests: 200,

    // population per unit (fallbacks ok)
    unitsFarmSpace: {
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
    },

    worldDataVillages: '/map/village.txt',
    worldDataPlayers: '/map/player.txt',
    worldDataTribes: '/map/ally.txt',

    _initDebug: function () {
        const scriptInfo = this.scriptInfo();
        console.debug(`${scriptInfo} It works 🚀!`);
        if (this.isDebug) {
            console.debug(`${scriptInfo} Market:`, game_data.market);
            console.debug(`${scriptInfo} World:`, game_data.world);
            console.debug(`${scriptInfo} Screen:`, game_data.screen);
            console.debug(`${scriptInfo} Locale:`, game_data.locale);
            console.debug(`${scriptInfo} Units:`, game_data.units);
        }
    },

    scriptInfo: function (scriptData = this.scriptData) {
        return `[${scriptData.name} ${scriptData.version}]`;
    },

    tt: function (string) {
        if (this.translations[game_data.locale] !== undefined) {
            return this.translations[game_data.locale][string];
        } else {
            return this.translations['en_DK'][string] || string;
        }
    },

    getParameterByName: function (name, url = window.location.href) {
        return new URL(url).searchParams.get(name);
    },

    cleanString: function (string) {
        try {
            return decodeURIComponent(string).replace(/\+/g, ' ');
        } catch (e) {
            return string;
        }
    },

    copyToClipboard: function (string) {
        navigator.clipboard.writeText(string);
    },

    calculateDistance: function (from, to) {
        const [x1, y1] = from.split('|');
        const [x2, y2] = to.split('|');
        const deltaX = Math.abs(x1 - x2);
        const deltaY = Math.abs(y1 - y2);
        return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    },

    csvToArray: function (strData, strDelimiter = ',') {
        var objPattern = new RegExp(
            '(\\' +
                strDelimiter +
                '|\\r?\\n|\\r|^)' +
                '(?:"([^"]*(?:""[^"]*)*)"|' +
                '([^"\\' +
                strDelimiter +
                '\\r\\n]*))',
            'gi'
        );
        var arrData = [[]];
        var arrMatches = null;
        while ((arrMatches = objPattern.exec(strData))) {
            var strMatchedDelimiter = arrMatches[1];
            if (
                strMatchedDelimiter.length &&
                strMatchedDelimiter !== strDelimiter
            ) {
                arrData.push([]);
            }
            var strMatchedValue;

            if (arrMatches[2]) {
                strMatchedValue = arrMatches[2].replace(
                    new RegExp('""', 'g'),
                    '"'
                );
            } else {
                strMatchedValue = arrMatches[3];
            }
            arrData[arrData.length - 1].push(strMatchedValue);
        }
        return arrData;
    },

    // small UI kit (same look/feel)
    addGlobalStyle: function () {
        return `
            .ra-table-container { overflow-y: auto; overflow-x: hidden; height: auto; max-height: 400px; }
            .ra-table th { font-size: 14px; }
            .ra-table th label { margin: 0; padding: 0; }
            .ra-table th, .ra-table td { padding: 5px; text-align: center; }
            .ra-table tr:nth-of-type(2n) td { background-color: #f0e2be }
            .ra-table tr:nth-of-type(2n+1) td { background-color: #fff5da; }

            .ra-table-v3 { border: 2px solid #bd9c5a; }
            .ra-table-v3 th, .ra-table-v3 td { border-collapse: separate; border: 1px solid #bd9c5a; text-align: left; }

            .ra-pa5 { padding: 5px !important; }
            .ra-mt15 { margin-top: 15px !important; }
            .ra-mb15 { margin-bottom: 15px !important; }
            .ra-tal { text-align: left !important; }
        `;
    },

    renderBoxWidget: function (body, id, mainClass, customStyle) {
        const globalStyle = this.addGlobalStyle();

        const content = `
            <div class="${mainClass} ra-box-widget" id="${id}">
                <div class="${mainClass}-header">
                    <h3>${this.tt(this.scriptData.name)}</h3>
                </div>
                <div class="${mainClass}-body">
                    ${body}
                </div>
                <div class="${mainClass}-footer">
                    <small>
                        <strong>${this.tt(this.scriptData.name)} ${this.scriptData.version}</strong> -
                        <a href="${this.scriptData.authorUrl}" target="_blank" rel="noreferrer noopener">${this.scriptData.author}</a> -
                        <a href="${this.scriptData.helpLink}" target="_blank" rel="noreferrer noopener">${this.tt('Help')}</a>
                    </small>
                </div>
            </div>
            <style>
                .${mainClass} { position: relative; display:block; width:100%; margin: 10px 0 15px; border: 1px solid #603000; background: #f4e4bc; box-sizing: border-box; }
                .${mainClass} * { box-sizing: border-box; }
                .${mainClass} > div { padding: 10px; }
                .${mainClass}-header { background-color: #c1a264 !important; background-image: url(/graphic/screen/tableheader_bg3.png); background-repeat: repeat-x; }
                .${mainClass}-header h3 { margin: 0; padding: 0; line-height: 1; }
                ${globalStyle}
                ${customStyle}
            </style>
        `;

        if (jQuery(`#${id}`).length < 1) {
            jQuery('#contentContainer').prepend(content);
            jQuery('#mobileContent').prepend(content);
        } else {
            jQuery(`.${mainClass}-body`).html(body);
        }
    },

    renderFixedWidget: function (body, id, mainClass, customStyle, width, customName = this.scriptData.name) {
        const globalStyle = this.addGlobalStyle();
        const content = `
            <div class="${mainClass} ra-fixed-widget" id="${id}">
                <div class="${mainClass}-header">
                    <h3>${this.tt(customName)}</h3>
                </div>
                <div class="${mainClass}-body">${body}</div>
                <div class="${mainClass}-footer">
                    <small>
                        <strong>${this.tt(customName)} ${this.scriptData.version}</strong> -
                        <a href="${this.scriptData.authorUrl}" target="_blank" rel="noreferrer noopener">${this.scriptData.author}</a> -
                        <a href="${this.scriptData.helpLink}" target="_blank" rel="noreferrer noopener">${this.tt('Help')}</a>
                    </small>
                </div>
                <a class="popup_box_close custom-close-button" href="#">&nbsp;</a>
            </div>
            <style>
                .${mainClass} { position: fixed; top: 10vw; right: 10vw; z-index: 99999; border: 2px solid #7d510f; border-radius: 10px; padding: 10px; width: ${width ?? '360px'}; overflow-y: auto; background: #e3d5b3 url('/graphic/index/main_bg.jpg') scroll right top repeat; }
                .${mainClass} * { box-sizing: border-box; }
                ${globalStyle}
                .custom-close-button { right: 0; top: 0; }
                ${customStyle}
            </style>
        `;

        if (jQuery(`#${id}`).length < 1) {
            if (window.mobiledevice) {
                jQuery('#content_value').prepend(content);
            } else {
                jQuery('#contentContainer').prepend(content);
                jQuery(`#${id}`).draggable({
                    cancel: '.ra-table, input, textarea, button, select, option',
                });
                jQuery(`#${id} .custom-close-button`).on('click', function (e) {
                    e.preventDefault();
                    jQuery(`#${id}`).remove();
                });
            }
        } else {
            jQuery(`.${mainClass}-body`).html(body);
        }
    },

    startProgressBar: function (total) {
        const width = jQuery('#content_value')[0].clientWidth;
        const preloaderContent = `
            <div id="progressbar" class="progress-bar" style="margin-bottom:12px;">
                <span class="count label">0/${total}</span>
                <div id="progress">
                    <span class="count label" style="width: ${width}px;">0/${total}</span>
                </div>
            </div>
        `;
        jQuery('#contentContainer').eq(0).prepend(preloaderContent);
    },

    updateProgressBar: function (index, total) {
        jQuery('#progress').css('width', `${((index + 1) / total) * 100}%`);
        jQuery('.count').text(`${index + 1}/${total}`);
        if (index + 1 == total) jQuery('#progressbar').fadeOut(1000);
    },

    checkValidLocation: function (type) {
        switch (type) {
            case 'screen':
                return this.allowedScreens.includes(
                    this.getParameterByName('screen')
                );
            case 'mode':
                return this.allowedModes.includes(
                    this.getParameterByName('mode')
                );
            default:
                return false;
        }
    },

    redirectTo: function (location) {
        window.location.assign(game_data.link_base_pure + location);
    },

    init: async function (scriptConfig) {
        const { scriptData, translations, allowedMarkets, allowedScreens, allowedModes, isDebug } = scriptConfig;
        this.scriptData = scriptData;
        this.translations = translations;
        this.allowedMarkets = allowedMarkets;
        this.allowedScreens = allowedScreens;
        this.allowedModes = allowedModes;
        this.isDebug = isDebug;
        this._initDebug();
    },

    // simple indexedDB cache for /map files (enough for villages/players/ally)
    worldDataAPI: async function (entity) {
        const TIME_INTERVAL = 60 * 60 * 1000; // 1h
        const LAST_UPDATED_TIME = localStorage.getItem(`${entity}_last_updated`);

        const allowed = ['village', 'player', 'ally'];
        if (!allowed.includes(entity)) throw new Error(`Entity ${entity} not allowed`);

        const dbConfig = {
            village: { dbName: 'ra_villagesDb', table: 'villages', key: 'villageId', url: twSDK.worldDataVillages },
            player:  { dbName: 'ra_playersDb',  table: 'players',  key: 'playerId',  url: twSDK.worldDataPlayers  },
            ally:    { dbName: 'ra_tribesDb',   table: 'tribes',   key: 'tribeId',   url: twSDK.worldDataTribes   },
        };

        const cfg = dbConfig[entity];

        const openDb = () => new Promise((resolve, reject) => {
            const req = indexedDB.open(cfg.dbName);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(cfg.table)) {
                    db.createObjectStore(cfg.table, { keyPath: cfg.key });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        const putAll = async (items) => {
            const db = await openDb();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(cfg.table, 'readwrite');
                const store = tx.objectStore(cfg.table);
                store.clear();
                items.forEach((it) => store.put(it));
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            });
        };

        const getAll = async () => {
            const db = await openDb();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(cfg.table, 'readonly');
                const store = tx.objectStore(cfg.table);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
        };

        const fetchAndParse = async () => {
            const raw = await jQuery.ajax(cfg.url);
            const rows = twSDK.csvToArray(raw).filter(r => r[0] !== '');

            if (entity === 'village') {
                const items = rows.map(r => ({
                    villageId: parseInt(r[0], 10),
                    villageName: twSDK.cleanString(r[1]),
                    x: r[2],
                    y: r[3],
                    playerId: parseInt(r[4], 10),
                    points: parseInt(r[5], 10),
                }));
                await putAll(items);
                localStorage.setItem(`${entity}_last_updated`, Date.parse(new Date()));
                return items.map(it => [it.villageId, it.villageName, it.x, it.y, it.playerId, it.points]);
            }

            if (entity === 'player') {
                const items = rows.map(r => ({
                    playerId: parseInt(r[0], 10),
                    name: twSDK.cleanString(r[1]),
                    tribeId: parseInt(r[2], 10),
                    villages: parseInt(r[3], 10),
                    points: parseInt(r[4], 10),
                    rank: parseInt(r[5], 10),
                }));
                await putAll(items);
                localStorage.setItem(`${entity}_last_updated`, Date.parse(new Date()));
                return items.map(it => [it.playerId, it.name, it.tribeId, it.villages, it.points, it.rank]);
            }

            if (entity === 'ally') {
                const items = rows.map(r => ({
                    tribeId: parseInt(r[0], 10),
                    name: twSDK.cleanString(r[1]),
                    tag: twSDK.cleanString(r[2]),
                    players: parseInt(r[3], 10),
                    villages: parseInt(r[4], 10),
                    points: parseInt(r[5], 10),
                    allPoints: parseInt(r[6], 10),
                    rank: parseInt(r[7], 10),
                }));
                await putAll(items);
                localStorage.setItem(`${entity}_last_updated`, Date.parse(new Date()));
                return items.map(it => [it.tribeId, it.name, it.tag, it.players, it.villages, it.points, it.allPoints, it.rank]);
            }

            return [];
        };

        if (LAST_UPDATED_TIME && (Date.parse(new Date()) < parseInt(LAST_UPDATED_TIME, 10) + TIME_INTERVAL)) {
            const cached = await getAll();
            if (entity === 'village') return cached.map(it => [it.villageId, it.villageName, it.x, it.y, it.playerId, it.points]);
            if (entity === 'player')  return cached.map(it => [it.playerId, it.name, it.tribeId, it.villages, it.points, it.rank]);
            if (entity === 'ally')    return cached.map(it => [it.tribeId, it.name, it.tag, it.players, it.villages, it.points, it.allPoints, it.rank]);
        }

        return await fetchAndParse();
    },
};

(async function () {
    await twSDK.init(scriptConfig);
    const scriptInfo = twSDK.scriptInfo();
    const isValidScreen = twSDK.checkValidLocation('screen');

    if ('TWMap' in window) window.mapOverlay = TWMap;

    const hcPopAmount = HC_AMOUNT ?? twSDK.unitsFarmSpace['heavy']; // allow custom heavy pop if desired

    const DEFAULT_VALUES = {
        DISTANCE: 5,
        STACK: 100,
        SCALE_PER_FIELD: 5,
    };

    const { villages, players, tribes } = await fetchWorldData();

    // Entry Point
    (function () {
        try {
            if (isValidScreen) {
                initScriptMember();
            } else {
                UI.InfoMessage(twSDK.tt('Redirecting...'));
                twSDK.redirectTo('map');
            }
        } catch (error) {
            UI.ErrorMessage(twSDK.tt('There was an error!'));
            console.error(`${scriptInfo} Error:`, error);
        }
    })();

    // =============================
    // MEMBER ENTRY: only your villages
    // =============================
    async function initScriptMember() {
        const villagesData = await fetchMyVillagesTroops();

        if (!villagesData.length) {
            UI.ErrorMessage(twSDK.tt('Could not read your troops from overview!'));
            console.error(`${scriptInfo} Could not parse overview troops page.`);
            return;
        }

        const playersData = [{
            id: game_data.player.id,
            name: game_data.player.name,
            villagesData: villagesData,
        }];

        if (DEBUG) console.debug(`${scriptInfo} my villagesData`, villagesData);

        buildUI();
        handleCalculateStackPlans(playersData);
        handleBacklineStacks(playersData);
        handleExport();
    }

    // Render: Build the user interface
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
                        <label for="raDistance" class="ra-label">
                            ${twSDK.tt('Distance')}
                        </label>
                        <input type="number" class="ra-input" id="raDistance" value="${DEFAULT_VALUES.DISTANCE}">
                    </div>
                    <div>
                        <label for="raStack" class="ra-label">
                            ${twSDK.tt('Stack Limit')}
                        </label>
                        <input type="number" class="ra-input" id="raStack" value="${DEFAULT_VALUES.STACK}">
                    </div>
                    <div>
                        <label for="raScalePerField" class="ra-label">
                            ${twSDK.tt('Scale down per field (k)')}
                        </label>
                        <input type="number" class="ra-input" id="raScalePerField" value="${DEFAULT_VALUES.SCALE_PER_FIELD}">
                    </div>
                </div>
            </div>

            <div class="ra-mb15">
                <label class="ra-label">
                    ${twSDK.tt('Required Stack Amount')}
                </label>
                <div>
                    ${troopAmountsHtml}
                </div>
            </div>

            <div>
                <a href="javascript:void(0);" id="raPlanStacks" class="btn">
                    ${twSDK.tt('Calculate Stacks')}
                </a>
                <a href="javascript:void(0);" id="raBacklineStacks" class="btn" data-backline-stacks="">
                    ${twSDK.tt('Find Backline Stacks')}
                </a>
                <a href="javascript:void(0);" id="raExport" class="btn" data-stack-plans="">
                    ${twSDK.tt('Export')}
                </a>
            </div>

            <div class="ra-mt15 ra-table-container" id="raStacks" style="display:none;"></div>
        `;

        const customStyle = `
            #${scriptConfig.scriptData.prefix} .ra-table-v3 th,
            #${scriptConfig.scriptData.prefix} .ra-table-v3 td { text-align: center; }

            .ra-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; grid-gap: 15px; }
            .ra-input { width: 100% !important; padding: 5px; font-size: 14px; line-height: 1; }
            .ra-label { margin-bottom: 6px; font-weight: 600; display: block; }
            .ra-text-center .ra-input { text-align: center; }
        `;

        twSDK.renderBoxWidget(
            content,
            scriptConfig.scriptData.prefix,
            'ra-frontline-stacks',
            customStyle
        );
    }

    // Action Handler: Check frontline villages stacks and find missing stacks
    function handleCalculateStackPlans(playersData) {
        jQuery('#raPlanStacks').on('click', function (e) {
            e.preventDefault();

            const {
                chosenTribes,
                distance,
                unitAmounts,
                stackLimit,
                scaleDownPerField,
            } = collectUserInput();

            const villagesThatNeedStack = findVillagesThatNeedStack(
                playersData,
                chosenTribes,
                distance,
                unitAmounts,
                stackLimit
            );

            if (villagesThatNeedStack.length) {
                const villagesToBeStacked = calculateAmountMissingTroops(
                    villagesThatNeedStack,
                    unitAmounts,
                    scaleDownPerField
                );

                villagesToBeStacked.sort((a, b) => a.fieldsAway - b.fieldsAway);

                const villagesTableHtml =
                    buildVillagesTable(villagesToBeStacked);

                jQuery('#raStacks').show();
                jQuery('#raStacks').html(villagesTableHtml);

                updateMap(villagesToBeStacked);
                jQuery('#raExport').attr(
                    'data-stack-plans',
                    JSON.stringify(villagesToBeStacked)
                );
            } else {
                UI.SuccessMessage(
                    twSDK.tt('All villages have been properly stacked!')
                );
            }
        });
    }

    // Action Handler: Find backline stacks (ONLY your villages)
    function handleBacklineStacks(playersData) {
        jQuery('#raBacklineStacks').on('click', function (e) {
            e.preventDefault();

            const { chosenTribes, distance } = collectUserInput();

            let myVillages = playersData.map((p) => p.villagesData).flat();

            let chosenTribeIds = twSDK.getEntityIdsByArrayIndex(
                chosenTribes,
                tribes,
                2
            );

            let tribePlayers = getTribeMembersById(chosenTribeIds);
            let enemyTribeCoordinates = filterVillagesByPlayerIds(tribePlayers);

            let villagesOutsideRadius = [];

            myVillages.forEach((village) => {
                const { villageCoords, troops } = village;

                enemyTribeCoordinates.forEach((coordinate) => {
                    const villagesDistance = twSDK.calculateDistance(
                        coordinate,
                        villageCoords
                    );

                    if (villagesDistance > distance) {
                        const stackAmount = calculatePop(troops);
                        if (stackAmount > 30000) {
                            villagesOutsideRadius.push({
                                ...village,
                                fieldsAway:
                                    Math.round(villagesDistance * 100) / 100,
                                stackAmount: stackAmount,
                            });
                        }
                    }
                });
            });

            villagesOutsideRadius.sort((a, b) => a.fieldsAway - b.fieldsAway);

            // unique by villageId
            let uniq = {};
            villagesOutsideRadius.forEach((it) => {
                if (!uniq[it.villageId]) uniq[it.villageId] = it;
            });

            let villagesArray = Object.values(uniq);

            let tableRows = villagesArray
                .map((village, index) => {
                    index++;
                    const { fieldsAway, stackAmount, villageId, villageName } =
                        village;
                    return `
                        <tr>
                            <td>${index}</td>
                            <td class="ra-tal">
                                <a href="/game.php?screen=info_village&id=${villageId}" target="_blank" rel="noreferrer noopener">
                                    ${villageName}
                                </a>
                            </td>
                            <td>${intToString(stackAmount)}</td>
                            <td>${fieldsAway}</td>
                        </tr>
                    `;
                })
                .join('');

            let villagesTableHtml = `
                <div class="ra-table-container ra-mb15">
                    <table class="ra-table ra-table-v3" width="100%">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th class="ra-tal">${twSDK.tt('Village')}</th>
                                <th>${twSDK.tt('Pop.')}</th>
                                <th>${twSDK.tt('Distance')}</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            `;

            twSDK.renderFixedWidget(
                villagesTableHtml,
                'raFrontlineStacks-popup',
                'ra-frontline-stacks-popup',
                '',
                '560px'
            );
        });
    }

    // Action Handler: Export stack plans
    function handleExport() {
        jQuery('#raExport').on('click', function (e) {
            e.preventDefault();

            const dataStackPlans = jQuery(this).attr('data-stack-plans');
            if (dataStackPlans) {
                const stackPlans = JSON.parse(dataStackPlans);

                if (stackPlans.length) {
                    let bbCode = `[table][**]#[||]${twSDK.tt(
                        'Village'
                    )}[||]${twSDK.tt('Missing Troops')}[||]${twSDK.tt(
                        'Distance'
                    )}[/**]\n`;

                    stackPlans.forEach((stackPlan, index) => {
                        index++;
                        const { villageCoords, missingTroops, fieldsAway } =
                            stackPlan;
                        const missingTroopsString =
                            buildMissingTroopsString(missingTroops);

                        bbCode += `[*]${index}[|] ${villageCoords} [|]${missingTroopsString}[|]${fieldsAway}`;
                    });

                    bbCode += `[/table]`;

                    twSDK.copyToClipboard(bbCode);
                    UI.SuccessMessage(twSDK.tt('Copied on clipboard!'));
                }
            } else {
                UI.ErrorMessage(twSDK.tt('No stack plans have been prepared!'));
            }
        });
    }

    // Helper: Build a table of villages
    function buildVillagesTable(villagesArr) {
        let villagesTableHtml = `
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

        villagesArr.forEach((village, index) => {
            const {
                villageId,
                villageName,
                villageCoords,
                fieldsAway,
                pop,
                missingTroops,
            } = village;

            let [x, y] = villageCoords.split('|');
            let missingTroopsString = buildMissingTroopsString(missingTroops);

            villagesTableHtml += `
                <tr>
                    <td>${index + 1}</td>
                    <td class="ra-tal">
                        <a href="/game.php?screen=info_village&id=${villageId}" target="_blank" rel="noreferrer noopener">
                            ${villageName}
                        </a>
                    </td>
                    <td>
                        <a href="javascript:TWMap.focus(${x}, ${y});">
                            ${villageCoords}
                        </a>
                    </td>
                    <td>${intToString(pop)}</td>
                    <td>${fieldsAway}</td>
                    <td>${missingTroopsString}</td>
                </tr>
            `;
        });

        villagesTableHtml += `</tbody></table>`;
        return villagesTableHtml;
    }

    // Helper: Build enemy tribes picker
    function buildEnemyTribePicker(array, entity) {
        if (entity === 'Tribes') {
            array.sort((a, b) => parseInt(a[7], 10) - parseInt(b[7], 10));
        }

        let dropdown = `<label for="ra${entity}" class="ra-label">${twSDK.tt(
            'Select enemy tribes'
        )}</label>
        <input type="email" class="ra-input" multiple list="raSelect${entity}" placeholder="${twSDK.tt(
            'Start typing and suggestions will show ...'
        )}" id="ra${entity}">
        <datalist id="raSelect${entity}">`;

        array.forEach((item) => {
            if (item[0].length !== 0) {
                if (entity === 'Tribes') {
                    const [, , tag] = item;
                    dropdown += `<option value="${twSDK.cleanString(tag)}">`;
                }
            }
        });

        dropdown += '</datalist>';
        return dropdown;
    }

    // Helper: Build missing troops string
    function buildMissingTroopsString(missingTroops) {
        let missingTroopsString = '';
        for (let [key, value] of Object.entries(missingTroops || {})) {
            if (!Number.isFinite(value)) continue;
            if (value <= 0) continue;
            missingTroopsString += `${key}: ${value}\n`;
        }
        return missingTroopsString;
    }

    // Helper: Build units chooser table (now guarantees spy + heavy if available)
    function buildUnitsChooserTable() {
        // IMPORTANT: include spy + heavy (and the common frontline def)
        const preferred = ['spear', 'sword', 'spy', 'heavy', 'archer'];
        const defTroopTypes = preferred.filter(u => game_data.units.includes(u));

        let thUnits = ``;
        let tableRow = ``;

        defTroopTypes.forEach((unit) => {
            const png = `/graphic/unit/unit_${unit}.png`;
            const webp = `/graphic/unit/unit_${unit}.webp`;

            thUnits += `
                <th class="ra-text-center">
                    <label for="unit_${unit}" class="ra-unit-type">
                        <img src="${png}" onerror="this.onerror=null;this.src='${webp}';">
                    </label>
                </th>
            `;

            tableRow += `
                <td class="ra-text-center">
                    <input name="ra_unit_amounts" type="text" id="unit_${unit}" data-unit="${unit}" class="ra-input" value="0" />
                </td>
            `;
        });

        return `
            <table class="ra-table ra-table-v3 vis" width="100%" id="raUnitSelector">
                <thead><tr>${thUnits}</tr></thead>
                <tbody><tr>${tableRow}</tr></tbody>
            </table>
        `;
    }

    // Helper: Update the map UI (overlay pop on villages to stack)
    function updateMap(villagesArr) {
        const villageCoords = villagesArr.map((v) => v.villageCoords);

        if (window.mapOverlay && mapOverlay.mapHandler && !mapOverlay.mapHandler._spawnSector) {
            mapOverlay.mapHandler._spawnSector = mapOverlay.mapHandler.spawnSector;
        }

        if (!window.TWMap || !window.mapOverlay) return;

        TWMap.mapHandler.spawnSector = function (data, sector) {
            mapOverlay.mapHandler._spawnSector(data, sector);

            var beginX = sector.x - data.x;
            var endX = beginX + mapOverlay.mapSubSectorSize;
            var beginY = sector.y - data.y;
            var endY = beginY + mapOverlay.mapSubSectorSize;

            for (var x in data.tiles) {
                x = parseInt(x, 10);
                if (x < beginX || x >= endX) continue;

                for (var y in data.tiles[x]) {
                    y = parseInt(y, 10);
                    if (y < beginY || y >= endY) continue;

                    var xCoord = data.x + x;
                    var yCoord = data.y + y;
                    var v = mapOverlay.villages[xCoord * 1000 + yCoord];
                    if (!v) continue;

                    var vXY = '' + v.xy;
                    var vCoords = vXY.slice(0, 3) + '|' + vXY.slice(3, 6);

                    if (villageCoords.includes(vCoords)) {
                        const currentVillage = villagesArr.find(
                            (obj) => obj.villageCoords == vCoords
                        );
                        const villageDef = intToString(currentVillage.pop);

                        const eleDIV = $('<div></div>')
                            .css({
                                position: 'absolute',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '1px',
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                color: '#fff',
                                width: '50px',
                                height: '35px',
                                zIndex: '10',
                                fontSize: '10px',
                            })
                            .attr('id', 'dsm' + v.id)
                            .html(villageDef);

                        sector.appendElement(
                            eleDIV[0],
                            data.x + x - sector.x,
                            data.y + y - sector.y
                        );
                    }
                }
            }
        };

        mapOverlay.reload();
    }

    // Helper: Calculate amounts of needed troops for each village
    function calculateAmountMissingTroops(
        villagesThatNeedStack,
        unitAmounts,
        scaleDownPerField
    ) {
        return villagesThatNeedStack.map((village) => {
            const distance = parseInt(village.fieldsAway, 10);
            const missingTroops = calculateMissingTroops(
                village.troops,
                unitAmounts,
                distance,
                scaleDownPerField
            );
            return { ...village, missingTroops };
        });
    }

    // Helper: Calculate missing troop amounts for every village
    // FIXED:
    // - includes spy + heavy
    // - shows ONLY what is actually missing (required - have)
    // - scaling applies only to scaling units; spy/heavy do NOT scale down
    function calculateMissingTroops(
        troops,
        unitAmounts,
        distance,
        scaleDownPerField
    ) {
        let missingTroops = {};
        const nonScalingUnits = ['spy', 'heavy'];

        const steps = Math.max(0, (parseInt(distance, 10) || 0) - 1);

        for (let [key, value] of Object.entries(unitAmounts || {})) {
            if (!game_data.units.includes(key)) continue;

            let required = Number(value || 0);
            if (required <= 0) continue;

            if (!nonScalingUnits.includes(key)) {
                required = required - steps * scaleDownPerField * 1000;
            }

            if (required <= 0) continue;

            const have = Number(troops?.[key] ?? 0);
            const miss = required - have;

            if (miss > 0) {
                missingTroops[key] = Math.trunc(miss);
            }
        }

        return missingTroops;
    }

    // Helper: Find villages that need to be stacked (ONLY your villages)
    function findVillagesThatNeedStack(
        playersData,
        chosenTribes,
        distance,
        unitAmount,
        stackLimit
    ) {
        let myVillages = playersData.map((p) => p.villagesData).flat();

        let chosenTribeIds = twSDK.getEntityIdsByArrayIndex(
            chosenTribes,
            tribes,
            2
        );
        let tribePlayers = getTribeMembersById(chosenTribeIds);
        let enemyTribeCoordinates = filterVillagesByPlayerIds(tribePlayers);

        // within radius from enemy coords
        let villagesWithinRadius = [];
        myVillages.forEach((village) => {
            const { villageCoords } = village;
            enemyTribeCoordinates.forEach((coordinate) => {
                const d = twSDK.calculateDistance(coordinate, villageCoords);
                if (d <= distance) {
                    villagesWithinRadius.push({
                        ...village,
                        fieldsAway: Math.round(d * 100) / 100,
                    });
                }
            });
        });

        // filter by stack size + unit thresholds
        let villagesThatNeedStack = [];
        villagesWithinRadius.forEach((village) => {
            const troops = village.troops || {};
            const villagePop = calculatePop(troops);
            const realStackLimit = stackLimit * 1000;

            let shouldAdd = false;

            for (let [key, value] of Object.entries(unitAmount)) {
                if (!game_data.units.includes(key)) continue;
                if (Number(troops?.[key] ?? 0) < value) shouldAdd = true;
            }

            if (villagePop < realStackLimit) shouldAdd = true;

            if (shouldAdd) {
                villagesThatNeedStack.push({
                    ...village,
                    pop: villagePop,
                });
            }
        });

        villagesThatNeedStack.sort((a, b) => a.fieldsAway - b.fieldsAway);

        // unique by villageId
        let uniq = {};
        villagesThatNeedStack.forEach((it) => {
            if (!uniq[it.villageId]) uniq[it.villageId] = it;
        });

        return Object.values(uniq);
    }

    // Helper: Calculate total pop
    function calculatePop(units) {
        let total = 0;

        for (let [key, value] of Object.entries(units || {})) {
            const amount = Number(value ?? 0);
            if (!amount) continue;

            const unitPopAmount =
                key !== 'heavy'
                    ? (twSDK.unitsFarmSpace[key] ?? 1)
                    : hcPopAmount;

            total += unitPopAmount * amount;
        }

        return total;
    }

    // Helper: Collect user input
    function collectUserInput() {
        let chosenTribes = jQuery('#raTribes').val().trim();
        let distance = parseInt(jQuery('#raDistance').val(), 10);
        let stackLimit = parseInt(jQuery('#raStack').val(), 10);
        let scaleDownPerField = parseInt(jQuery('#raScalePerField').val(), 10);
        let unitAmounts = {};

        if (chosenTribes === '') {
            UI.ErrorMessage(twSDK.tt('You need to select an enemy tribe!'));
        } else {
            chosenTribes = chosenTribes.split(',').map(s => s.trim()).filter(Boolean);
        }

        jQuery('#raUnitSelector input').each(function () {
            const unit = jQuery(this).attr('data-unit');
            const amount = parseInt(jQuery(this).val(), 10) || 0;
            if (amount > 0) unitAmounts[unit] = amount;
        });

        return {
            chosenTribes,
            distance,
            unitAmounts,
            stackLimit,
            scaleDownPerField,
        };
    }

    // Helper: Convert 1000 to 1k
    function intToString(num) {
        num = num.toString().replace(/[^0-9.]/g, '');
        if (num < 1000) return num;

        let si = [
            { v: 1e3, s: 'K' },
            { v: 1e6, s: 'M' },
            { v: 1e9, s: 'B' },
            { v: 1e12, s: 'T' },
            { v: 1e15, s: 'P' },
            { v: 1e18, s: 'E' },
        ];

        let index;
        for (index = si.length - 1; index > 0; index--) {
            if (num >= si[index].v) break;
        }

        return (
            (num / si[index].v)
                .toFixed(2)
                .replace(/\.0+$|(\.[0-9]*[1-9])0+$/, '$1') + si[index].s
        );
    }

    // Helper: Get entity ids by index (name/tag match)
    twSDK.getEntityIdsByArrayIndex = function (chosenItems, items, index) {
        const itemIds = [];
        chosenItems.forEach((chosenItem) => {
            items.forEach((item) => {
                if (
                    twSDK.cleanString(item[index]) ===
                    twSDK.cleanString(chosenItem)
                ) {
                    itemIds.push(parseInt(item[0], 10));
                }
            });
        });
        return itemIds;
    };

    // Helper: Get tribe members by tribe ids (enemy tribes)
    function getTribeMembersById(tribeIds) {
        return players
            .filter((player) => tribeIds.includes(parseInt(player[2], 10)))
            .map((player) => parseInt(player[0], 10));
    }

    // Helper: Filter villages by player ids (enemy players)
    function filterVillagesByPlayerIds(playerIds) {
        return villages
            .filter((village) => playerIds.includes(parseInt(village[4], 10)))
            .map((village) => village[2] + '|' + village[3]);
    }

    // =============================
    // MEMBER DATA: YOUR troops from overview ("NA ALDEIA")
    // =============================
    async function fetchMyVillagesTroops() {
        const scriptInfo = twSDK.scriptInfo();

        let baseUrl = `/game.php?screen=overview_villages&mode=units&village=${game_data.village.id}`;
        if (game_data.player.sitter != '0') baseUrl += `&t=${game_data.player.id}`;

        function normalizeHref(href) {
            if (!href) return null;
            if (/^https?:\/\//i.test(href)) return href;
            if (href.startsWith('/')) return href;
            if (href.startsWith('game.php')) return '/' + href;
            return href;
        }

        // Find and follow the "Na aldeia" tab/link (instead of "Próprias tropas")
        function findInVillageUrl(docRoot) {
            const $doc = jQuery(docRoot);

            // Most robust: look for link text (pt/en)
            const wanted = /na\s+aldeia|in\s+village/i;

            let found = null;
            $doc.find('a').each(function () {
                if (found) return;
                const txt = jQuery(this).text().trim();
                const href = jQuery(this).attr('href') || '';
                if (wanted.test(txt) && /mode=units/.test(href)) {
                    found = normalizeHref(href);
                }
            });

            // Fallback: sometimes there's a select / option - try to pick it if present
            if (!found) {
                $doc.find('option').each(function () {
                    if (found) return;
                    const txt = jQuery(this).text().trim();
                    const val = jQuery(this).attr('value') || '';
                    if (/na\s+aldeia|in\s+village/i.test(txt) && /mode=units/.test(val)) {
                        found = normalizeHref(val);
                    }
                });
            }

            return found;
        }

        try {
            // 1) Load base
            let html = await jQuery.get(baseUrl);
            let doc = jQuery.parseHTML(html);

            // 2) Try to switch to "Na aldeia"
            const inVillageUrl = findInVillageUrl(doc);
            if (inVillageUrl) {
                if (DEBUG) console.debug(`${scriptInfo} Switching to in-village URL:`, inVillageUrl);
                html = await jQuery.get(inVillageUrl);
                doc = jQuery.parseHTML(html);
            } else {
                if (DEBUG) console.debug(`${scriptInfo} Could not find explicit "Na aldeia" link; using base URL (may depend on last selected tab).`);
            }

            // Try common table IDs/selectors
            let $table = jQuery(doc).find('table#units_table').first();

            if (!$table.length) {
                // fallback: a .vis table containing unit icons
                jQuery(doc).find('table.vis').each(function () {
                    const $t = jQuery(this);
                    if (!$table.length && $t.find('img[src*="/graphic/unit/unit_"]').length) {
                        $table = $t;
                    }
                });
            }

            if (!$table.length) {
                console.error(`${scriptInfo} Could not find units table.`);
                return [];
            }

            // Map unit -> column index via header icons
            const unitColIndex = {};
            const $ths = $table.find('thead tr').first().find('th');

            $ths.each(function (i) {
                const $img = jQuery(this).find('img[src*="/graphic/unit/unit_"]');
                if ($img.length) {
                    const src = $img.attr('src') || '';
                    const m = src.match(/unit_([a-z0-9_]+)\./i);
                    if (m && m[1]) unitColIndex[m[1]] = i;
                }
            });

            const worldUnits = game_data.units.slice();
            const unitsInTable = worldUnits.filter(u => unitColIndex[u] !== undefined);

            if (!unitsInTable.length) {
                console.error(`${scriptInfo} No recognized unit columns found.`, unitColIndex);
                return [];
            }

            const villagesData = [];

            $table.find('tbody tr').each(function () {
                const $tr = jQuery(this);
                const $tds = $tr.find('td');
                if ($tds.length < 2) return;

                // Village link usually first column
                const $a = $tr.find('td').first().find('a').first();
                if (!$a.length) return;

                const href = $a.attr('href') || '';
                let villageId = parseInt(twSDK.getParameterByName('id', window.location.origin + href), 10);
                if (!Number.isFinite(villageId)) {
                    const v2 = parseInt(twSDK.getParameterByName('village', window.location.origin + href), 10);
                    if (Number.isFinite(v2)) villageId = v2;
                }
                if (!Number.isFinite(villageId)) return;

                const rowText = $tr.text();
                const coords = (rowText.match(twSDK.coordsRegex) || [null])[0];
                if (!coords) return;

                const name = $a.text().trim() || `Village ${coords}`;

                const troops = {};
                unitsInTable.forEach((unit) => {
                    const idx = unitColIndex[unit];
                    const raw = jQuery($tds.get(idx)).text().trim();
                    const n = parseInt((raw || '0').replace(/[^\d]/g, ''), 10);
                    troops[unit] = Number.isFinite(n) ? n : 0;
                });

                villagesData.push({
                    villageId,
                    villageName: name,
                    villageCoords: coords,
                    troops,
                });
            });

            return villagesData;
        } catch (e) {
            console.error(`${scriptInfo} Error fetching my villages troops:`, e);
            return [];
        }
    }

    // Fetch all required world data
    async function fetchWorldData() {
        try {
            const villages = await twSDK.worldDataAPI('village');
            const players = await twSDK.worldDataAPI('player');
            const tribes = await twSDK.worldDataAPI('ally');
            return { villages, players, tribes };
        } catch (error) {
            UI.ErrorMessage(error);
            console.error(`${scriptInfo} Error:`, error);
            return { villages: [], players: [], tribes: [] };
        }
    }
})();
