/* 
 * Script Name: Frontline Stacks Planner
 * Version: v1.0.3 (BR138 patched)
 * Last Updated: 2025-08-15
 * Author: RedAlert
 * Patch: make unit list dynamic (archer-less worlds like BR138) + NaN guards + icon fallback
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
        author: 'RedAlert',
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
            'Error fetching player incomings!':
                'Error fetching player incomings!',
            'You can only run this script if you are member of a tribe!':
                'You can only run this script if you are member of a tribe!',
            'Tribe members have not shared their troop counts with tribe leadership!':
                'Tribe members have not shared their troop counts with tribe leadership!',
            'Start typing and suggestions will show ...':
                'Start typing and suggestions will show ...',
            'Select enemy tribes': 'Select enemy tribes',
            Distance: 'Distance',
            'Stack Limit': 'Stack Limit',
            'Scale down per field (k)': 'Scale down per field (k)',
            'Required Stack Amount': 'Required Stack Amount',
            'Calculate Stacks': 'Calculate Stacks',
            'Find Backline Stacks': 'Find Backline Stacks',
            'Fill all the required fields!': 'Fill all the required fields!',
            'You need to select an enemy tribe!':
                'You need to select an enemy tribe!',
            Village: 'Village',
            Map: 'Map',
            'Pop.': 'Pop.',
            Distance: 'Distance',
            'Missing Troops': 'Missing Troops',
            'All villages have been properly stacked!':
                'All villages have been properly stacked!',
            Export: 'Export',
            'No stack plans have been prepared!':
                'No stack plans have been prepared!',
            'Copied on clipboard!': 'Copied on clipboard!',
        },
    },
    allowedMarkets: [],
    allowedScreens: ['map'],
    allowedModes: [],
    isDebug: DEBUG,
    enableCountApi: true,
};

window.twSDK = {
    // variables
    scriptData: {},
    translations: {},
    allowedMarkets: [],
    allowedScreens: [],
    allowedModes: [],
    enableCountApi: true,
    isDebug: false,
    isMobile: jQuery('#mobileHeader').length > 0,
    delayBetweenRequests: 200,
    // helper variables
    market: game_data.market,
    units: game_data.units,
    village: game_data.village,
    buildings: game_data.village.buildings,
    sitterId: game_data.player.sitter > 0 ? `&t=${game_data.player.id}` : '',
    coordsRegex: /\d{1,3}\|\d{1,3}/g,
    dateTimeMatch:
        /(?:[A-Z][a-z]{2}\s+\d{1,2},\s*\d{0,4}\s+|today\s+at\s+|tomorrow\s+at\s+)\d{1,2}:\d{2}:\d{2}:?\.?\d{0,3}/,
    worldInfoInterface: '/interface.php?func=get_config',
    unitInfoInterface: '/interface.php?func=get_unit_info',
    buildingInfoInterface: '/interface.php?func=get_building_info',
    worldDataVillages: '/map/village.txt',
    worldDataPlayers: '/map/player.txt',
    worldDataTribes: '/map/ally.txt',
    worldDataConquests: '/map/conquer_extended.txt',

    buildingsList: [
        'main','barracks','stable','garage','church','church_f','watchtower','snob','smith','place','statue',
        'market','wood','stone','iron','farm','storage','hide','wall',
    ],

    // https://help.tribalwars.net/wiki/Points
    buildingPoints: { /* (unchanged — trimmed for brevity in patch explanation)
        KEEP YOUR ORIGINAL buildingPoints HERE
    */ },

    unitsFarmSpace: {
        spear: 1, sword: 1, axe: 1, archer: 1, spy: 2, light: 4, marcher: 5, heavy: 6,
        ram: 5, catapult: 8, knight: 10, snob: 100,
    },

    resPerHour: { /* unchanged */ },
    watchtowerLevels: [1.1,1.3,1.5,1.7,2,2.3,2.6,3,3.4,3.9,4.4,5.1,5.8,6.7,7.6,8.7,10,11.5,13.1,15],

    _initDebug: function () {
        const scriptInfo = this.scriptInfo();
        console.debug(`${scriptInfo} It works 🚀!`);
        console.debug(`${scriptInfo} HELP:`, this.scriptData.helpLink);
        if (this.isDebug) {
            console.debug(`${scriptInfo} Market:`, game_data.market);
            console.debug(`${scriptInfo} World:`, game_data.world);
            console.debug(`${scriptInfo} Screen:`, game_data.screen);
            console.debug(`${scriptInfo} Game Version:`, game_data.majorVersion);
            console.debug(`${scriptInfo} Game Build:`, game_data.version);
            console.debug(`${scriptInfo} Locale:`, game_data.locale);
        }
    },

    addGlobalStyle: function () {
        return `
            /* Table Styling */
            .ra-table-container { overflow-y: auto; overflow-x: hidden; height: auto; max-height: 400px; }
            .ra-table th { font-size: 14px; }
            .ra-table th label { margin: 0; padding: 0; }
            .ra-table th, .ra-table td { padding: 5px; text-align: center; }
            .ra-table td a { word-break: break-all; }
            .ra-table a:focus { color: blue; }
            .ra-table a.btn:focus { color: #fff; }
            .ra-table tr:nth-of-type(2n) td { background-color: #f0e2be }
            .ra-table tr:nth-of-type(2n+1) td { background-color: #fff5da; }

            .ra-table-v2 th, .ra-table-v2 td { text-align: left; }

            .ra-table-v3 { border: 2px solid #bd9c5a; }
            .ra-table-v3 th, .ra-table-v3 td { border-collapse: separate; border: 1px solid #bd9c5a; text-align: left; }

            /* Inputs */
            .ra-textarea { width: 100%; height: 80px; resize: none; }

            /* Popup */
            .ra-popup-content { width: 360px; }
            .ra-popup-content * { box-sizing: border-box; }
            .ra-popup-content input[type="text"] { padding: 3px; width: 100%; }
            .ra-popup-content .btn-confirm-yes { padding: 3px !important; }
            .ra-popup-content label { display: block; margin-bottom: 5px; font-weight: 600; }
            .ra-popup-content > div { margin-bottom: 15px; }
            .ra-popup-content > div:last-child { margin-bottom: 0 !important; }
            .ra-popup-content textarea { width: 100%; height: 100px; resize: none; }

            /* Elements */
            .ra-details { display: block; margin-bottom: 8px; border: 1px solid #603000; padding: 8px; border-radius: 4px; }
            .ra-details summary { font-weight: 600; cursor: pointer; }
            .ra-details p { margin: 10px 0 0 0; padding: 0; }

            /* Helpers */
            .ra-pa5 { padding: 5px !important; }
            .ra-mt15 { margin-top: 15px !important; }
            .ra-mb10 { margin-bottom: 10px !important; }
            .ra-mb15 { margin-bottom: 15px !important; }
            .ra-tal { text-align: left !important; }
            .ra-tac { text-align: center !important; }
            .ra-tar { text-align: right !important; }

            /* RESPONSIVE */
            @media (max-width: 480px) {
                .ra-fixed-widget { position: relative !important; top: 0; left: 0; display: block; width: auto; height: auto; z-index: 1; }
                .ra-box-widget { position: relative; display: block; box-sizing: border-box; width: 97%; height: auto; margin: 10px auto; }
                .ra-table { border-collapse: collapse !important; }
                .custom-close-button { display: none; }
                .ra-fixed-widget h3 { margin-bottom: 15px; }
                .ra-popup-content { width: 100%; }
            }
        `;
    },

    // ✅ NEW: unit image helper (png first, fallback to webp)
    unitImgTag: function(unit){
        const png = `/graphic/unit/unit_${unit}.png`;
        const webp = `/graphic/unit/unit_${unit}.webp`;
        return `<img src="${png}" onerror="this.onerror=null;this.src='${webp}';">`;
    },

    addScriptToQuickbar: function (name, script, callback) {
        let scriptData = `hotkey=&name=${name}&href=${encodeURI(script)}`;
        let action =
            '/game.php?screen=settings&mode=quickbar_edit&action=quickbar_edit&';

        jQuery.ajax({
            url: action,
            type: 'POST',
            data: scriptData + `&h=${csrf_token}`,
            success: function () {
                if (typeof callback === 'function') callback();
            },
        });
    },

    calculateDistance: function (from, to) {
        const [x1, y1] = from.split('|');
        const [x2, y2] = to.split('|');
        const deltaX = Math.abs(x1 - x2);
        const deltaY = Math.abs(y1 - y2);
        return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    },

    cleanString: function (string) {
        try {
            return decodeURIComponent(string).replace(/\+/g, ' ');
        } catch (error) {
            console.error(error, string);
            return string;
        }
    },

    copyToClipboard: function (string) {
        navigator.clipboard.writeText(string);
    },

    csvToArray: function (strData, strDelimiter = ',') {
        var objPattern = new RegExp(
            '(\\' + strDelimiter + '|\\r?\\n|\\r|^)' +
            '(?:"([^"]*(?:""[^"]*)*)"|' +
            '([^"\\' + strDelimiter + '\\r\\n]*))',
            'gi'
        );
        var arrData = [[]];
        var arrMatches = null;
        while ((arrMatches = objPattern.exec(strData))) {
            var strMatchedDelimiter = arrMatches[1];
            if (strMatchedDelimiter.length && strMatchedDelimiter !== strDelimiter) {
                arrData.push([]);
            }
            var strMatchedValue;
            if (arrMatches[2]) {
                strMatchedValue = arrMatches[2].replace(new RegExp('""', 'g'), '"');
            } else {
                strMatchedValue = arrMatches[3];
            }
            arrData[arrData.length - 1].push(strMatchedValue);
        }
        return arrData;
    },

    getParameterByName: function (name, url = window.location.href) {
        return new URL(url).searchParams.get(name);
    },

    getServerDateTime: function () {
        const serverTime = jQuery('#serverTime').text();
        const serverDate = jQuery('#serverDate').text();
        const [day, month, year] = serverDate.split('/');
        return year + '-' + month + '-' + day + ' ' + serverTime;
    },

    getAll: function (urls, onLoad, onDone, onError) {
        var numDone = 0;
        var lastRequestTime = 0;
        var minWaitTime = this.delayBetweenRequests;
        loadNext();
        function loadNext() {
            if (numDone == urls.length) { onDone(); return; }

            let now = Date.now();
            let timeElapsed = now - lastRequestTime;
            if (timeElapsed < minWaitTime) {
                setTimeout(loadNext, minWaitTime - timeElapsed);
                return;
            }
            lastRequestTime = now;

            jQuery.get(urls[numDone])
                .done((data) => {
                    try { onLoad(numDone, data); ++numDone; loadNext(); }
                    catch (e) { onError(e); }
                })
                .fail((xhr) => { onError(xhr); });
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
        if (this.isMobile) jQuery('#content_value').eq(0).prepend(preloaderContent);
        else jQuery('#contentContainer').eq(0).prepend(preloaderContent);
    },

    updateProgressBar: function (index, total) {
        jQuery('#progress').css('width', `${((index + 1) / total) * 100}%`);
        jQuery('.count').text(`${index + 1}/${total}`);
        if (index + 1 == total) jQuery('#progressbar').fadeOut(1000);
    },

    addGlobalOnce: function(){},

    redirectTo: function (location) {
        window.location.assign(game_data.link_base_pure + location);
    },

    checkValidLocation: function (type) {
        switch (type) {
            case 'screen': return this.allowedScreens.includes(this.getParameterByName('screen'));
            case 'mode': return this.allowedModes.includes(this.getParameterByName('mode'));
            default: return false;
        }
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
                    <small>
                        <strong>${this.tt(this.scriptData.name)} ${this.scriptData.version}</strong> -
                        <a href="${this.scriptData.authorUrl}" target="_blank" rel="noreferrer noopener">${this.scriptData.author}</a> -
                        <a href="${this.scriptData.helpLink}" target="_blank" rel="noreferrer noopener">${this.tt('Help')}</a>
                    </small>
                </div>
            </div>
            <style>
                .${mainClass} { position: relative; display: block; width: 100%; height: auto; clear: both; margin: 10px 0 15px; border: 1px solid #603000; box-sizing: border-box; background: #f4e4bc; }
                .${mainClass} * { box-sizing: border-box; }
                .${mainClass} > div { padding: 10px; }
                .${mainClass} .btn-confirm-yes { padding: 3px; }
                .${mainClass}-header { display: flex; align-items: center; justify-content: space-between; background-color: #c1a264 !important; background-image: url(/graphic/screen/tableheader_bg3.png); background-repeat: repeat-x; }
                .${mainClass}-header h3 { margin: 0; padding: 0; line-height: 1; }
                .${mainClass}-body p { font-size: 14px; }
                .${mainClass}-body label { display: block; font-weight: 600; margin-bottom: 6px; }
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
                <div class="${mainClass}-header"><h3>${this.tt(customName)}</h3></div>
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
            if (mobiledevice) {
                jQuery('#content_value').prepend(content);
            } else {
                jQuery('#contentContainer').prepend(content);
                jQuery(`#${id}`).draggable({ cancel: '.ra-table, input, textarea, button, select, option' });
                jQuery(`#${id} .custom-close-button`).on('click', function (e) {
                    e.preventDefault();
                    jQuery(`#${id}`).remove();
                });
            }
        } else {
            jQuery(`.${mainClass}-body`).html(body);
        }
    },

    scriptInfo: function (scriptData = this.scriptData) {
        return `[${scriptData.name} ${scriptData.version}]`;
    },

    tt: function (string) {
        if (this.translations[game_data.locale] !== undefined) {
            return this.translations[game_data.locale][string];
        } else {
            return this.translations['en_DK'][string];
        }
    },

    worldDataAPI: async function (entity) { /* KEEP YOUR ORIGINAL worldDataAPI HERE (unchanged) */ },

    init: async function (scriptConfig) {
        const { scriptData, translations, allowedMarkets, allowedScreens, allowedModes, isDebug, enableCountApi } = scriptConfig;
        this.scriptData = scriptData;
        this.translations = translations;
        this.allowedMarkets = allowedMarkets;
        this.allowedScreens = allowedScreens;
        this.allowedModes = allowedModes;
        this.enableCountApi = enableCountApi;
        this.isDebug = isDebug;
        twSDK._initDebug();
    },
};

(async function () {
    await twSDK.init(scriptConfig);
    const scriptInfo = twSDK.scriptInfo();
    const isValidScreen = twSDK.checkValidLocation('screen');

    if (!parseInt(game_data.player.ally)) {
        UI.ErrorMessage(twSDK.tt('You can only run this script if you are member of a tribe!'));
        return;
    }

    if ('TWMap' in window) mapOverlay = TWMap;

    const hcPopAmount = HC_AMOUNT ?? twSDK.unitsFarmSpace['heavy'];

    const DEFAULT_VALUES = { DISTANCE: 5, STACK: 100, SCALE_PER_FIELD: 5 };

    const { villages, players, tribes } = await fetchWorldData();

    (function () {
        try {
            if (isValidScreen) initScript();
            else { UI.InfoMessage(twSDK.tt('Redirecting...')); twSDK.redirectTo('map'); }
        } catch (error) {
            UI.ErrorMessage(twSDK.tt('There was an error!'));
            console.error(`${scriptInfo} Error:`, error);
        }
    })();

    async function initScript() {
        const playersToFetch = await getTribeMembersList();

        if (playersToFetch.length) {
            const playersData = [...playersToFetch];
            const memberUrls = playersToFetch.map((item) => item.url);

            twSDK.startProgressBar(memberUrls.length);

            twSDK.getAll(
                memberUrls,
                function (index, data) {
                    twSDK.updateProgressBar(index, memberUrls.length);

                    const htmlDoc = jQuery.parseHTML(data);
                    const villagesTableRows = jQuery(htmlDoc)
                        .find(`.table-responsive table.vis tbody tr`)
                        .not(':first');

                    const villagesData = [];

                    if (villagesTableRows && villagesTableRows.length) {
                        villagesTableRows.each(function () {
                            try {
                                const _this = jQuery(this);
                                const currentVillageName = _this.find('td:first a').text().trim();
                                if (currentVillageName) {
                                    const currentVillageId = parseInt(
                                        twSDK.getParameterByName(
                                            'id',
                                            window.location.origin + _this.find('td:first a').attr('href')
                                        )
                                    );

                                    const currentVillageCoords = _this
                                        .find('td:eq(0)')
                                        .text()
                                        .trim()
                                        ?.match(twSDK.coordsRegex)?.[0];

                                    let villageData = [];

                                    _this
                                        .find('td')
                                        .not(':first')
                                        .not(':last')
                                        .not(':eq(0)')
                                        .each(function () {
                                            const txt = jQuery(this).text().trim();
                                            const unitAmount = (txt !== '?' && txt !== '') ? txt : 0;
                                            villageData.push(parseInt(unitAmount, 10) || 0);
                                        });

                                    villageData = villageData.splice(0, game_data.units.length);

                                    let villageTroops = {};
                                    game_data.units.forEach((unit, i) => {
                                        villageTroops[unit] = villageData[i] ?? 0;
                                    });

                                    villagesData.push({
                                        villageId: currentVillageId,
                                        villageName: currentVillageName,
                                        villageCoords: currentVillageCoords,
                                        troops: villageTroops,
                                    });
                                }
                            } catch (error) {
                                UI.ErrorMessage(twSDK.tt('Error fetching player incomings!'));
                                console.error(`${scriptInfo} Error:`, error);
                            }
                        });
                    }

                    playersData[index] = { ...playersData[index], villagesData: villagesData };
                },
                function () {
                    buildUI();
                    handleCalculateStackPlans(playersData);
                    handleBacklineStacks(playersData);
                    handleExport();
                },
                function () {
                    UI.ErrorMessage(twSDK.tt('Error fetching player incomings!'));
                }
            );
        } else {
            UI.ErrorMessage(
                twSDK.tt('Tribe members have not shared their troop counts with tribe leadership!')
            );
        }
    }

    function buildUI() {
        const enemyTribePickerHtml = buildEnemyTribePicker(tribes, 'Tribes');
        const troopAmountsHtml = buildUnitsChoserTable();

        const content = `
            <div class="ra-mb15">
                <div class="ra-grid">
                    <div>${enemyTribePickerHtml}</div>
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
                <div>${troopAmountsHtml}</div>
            </div>
            <div>
                <a href="javascript:void(0);" id="raPlanStacks" class="btn">${twSDK.tt('Calculate Stacks')}</a>
                <a href="javascript:void(0);" id="raBacklineStacks" class="btn" data-backline-stacks="">${twSDK.tt('Find Backline Stacks')}</a>
                <a href="javascript:void(0);" id="raExport" class="btn" data-stack-plans="">${twSDK.tt('Export')}</a>
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

        twSDK.renderBoxWidget(content, scriptConfig.scriptData.prefix, 'ra-frontline-stacks', customStyle);
    }

    function handleCalculateStackPlans(playersData) {
        jQuery('#raPlanStacks').on('click', function (e) {
            e.preventDefault();

            const { chosenTribes, distance, unitAmounts, stackLimit, scaleDownPerField } = collectUserInput();
            const villagesThatNeedStack = findVillagesThatNeedStack(playersData, chosenTribes, distance, unitAmounts, stackLimit);

            if (villagesThatNeedStack.length) {
                const villagesToBeStacked = calculateAmountMissingTroops(villagesThatNeedStack, unitAmounts, scaleDownPerField);
                villagesToBeStacked.sort((a, b) => a.fieldsAway - b.fieldsAway);

                const villagesTableHtml = buildVillagesTable(villagesToBeStacked);
                jQuery('#raStacks').show().html(villagesTableHtml);

                updateMap(villagesToBeStacked);
                jQuery('#raExport').attr('data-stack-plans', JSON.stringify(villagesToBeStacked));
            } else {
                UI.SuccessMessage(twSDK.tt('All villages have been properly stacked!'));
            }
        });
    }

    function handleBacklineStacks(playersData) {
        jQuery('#raBacklineStacks').on('click', function (e) {
            e.preventDefault();

            const { chosenTribes, distance } = collectUserInput();

            let playerVillages = playersData.map(p => p.villagesData).flat();

            let chosenTribeIds = twSDK.getEntityIdsByArrayIndex(chosenTribes, tribes, 2);
            let tribePlayers = getTribeMembersById(chosenTribeIds);
            let enemyTribeCoordinates = filterVillagesByPlayerIds(tribePlayers);

            let villagesOutsideRadius = [];

            playerVillages.forEach((village) => {
                const { villageCoords, troops } = village;
                enemyTribeCoordinates.forEach((coordinate) => {
                    const villagesDistance = twSDK.calculateDistance(coordinate, villageCoords);
                    if (villagesDistance > distance) {
                        const stackAmount = calculatePop(troops);
                        if (stackAmount > 30000) {
                            villagesOutsideRadius.push({
                                ...village,
                                fieldsAway: Math.round(villagesDistance * 100) / 100,
                                stackAmount: stackAmount,
                            });
                        }
                    }
                });
            });

            villagesOutsideRadius.sort((a, b) => a.fieldsAway - b.fieldsAway);

            let villagesObject = {};
            villagesOutsideRadius.forEach((item) => {
                const { villageId } = item;
                if (!villagesObject[villageId]) villagesObject[villageId] = item;
            });

            let villagesArray = Object.values(villagesObject);

            let tableRows = villagesArray.map((village, index) => {
                index++;
                const { fieldsAway, stackAmount, villageId, villageName } = village;
                return `
                    <tr>
                        <td>${index}</td>
                        <td class="ra-tal">
                            <a href="/game.php?screen=info_village&id=${villageId}" target="_blank" rel="noreferrer noopener">${villageName}</a>
                        </td>
                        <td>${intToString(stackAmount)}</td>
                        <td>${fieldsAway}</td>
                    </tr>
                `;
            }).join('');

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

            twSDK.renderFixedWidget(villagesTableHtml, 'raFrontlineStacks-popup', 'ra-frontline-stacks-popup', '', '560px');
        });
    }

    function handleExport() {
        jQuery('#raExport').on('click', function (e) {
            e.preventDefault();

            const dataStackPlans = jQuery(this).attr('data-stack-plans');
            if (dataStackPlans) {
                const stackPlans = JSON.parse(dataStackPlans);

                if (stackPlans.length) {
                    let bbCode = `[table][**]#[||]${twSDK.tt('Village')}[||]${twSDK.tt('Missing Troops')}[||]${twSDK.tt('Distance')}[/**]\n`;

                    stackPlans.forEach((stackPlan, index) => {
                        index++;
                        const { villageCoords, missingTroops, fieldsAway } = stackPlan;
                        const missingTroopsString = buildMissingTroopsString(missingTroops);
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

    function buildVillagesTable(villagesArr) {
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

        villagesArr.forEach((village, idx) => {
            const { villageId, villageName, villageCoords, fieldsAway, pop, missingTroops } = village;
            let [x, y] = villageCoords.split('|');
            let missingTroopsString = buildMissingTroopsString(missingTroops);

            html += `
                <tr>
                    <td>${idx + 1}</td>
                    <td class="ra-tal">
                        <a href="/game.php?screen=info_village&id=${villageId}" target="_blank" rel="noreferrer noopener">${villageName}</a>
                    </td>
                    <td><a href="javascript:TWMap.focus(${x}, ${y});">${villageCoords}</a></td>
                    <td>${intToString(pop)}</td>
                    <td>${fieldsAway}</td>
                    <td>${missingTroopsString}</td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        return html;
    }

    function buildEnemyTribePicker(array, entity) {
        if (entity === 'Tribes') array.sort((a, b) => parseInt(a[7]) - parseInt(b[7]));

        let dropdown = `<label for="ra${entity}" class="ra-label">${twSDK.tt('Select enemy tribes')}</label>
            <input type="email" class="ra-input" multiple list="raSelect${entity}" placeholder="${twSDK.tt('Start typing and suggestions will show ...')}" id="ra${entity}">
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

    function buildMissingTroopsString(missingTroops) {
        let out = '';
        for (let [k, v] of Object.entries(missingTroops || {})) {
            if (!Number.isFinite(v)) continue;
            out += `${k}: ${v}\n`;
        }
        return out;
    }

    // ✅ PATCHED: build only units that exist on this world (BR138 has no archer)
    function buildUnitsChoserTable() {
        let thUnits = ``;
        let tableRow = ``;

        const preferred = ['spear', 'sword', 'archer', 'spy', 'heavy'];
        const defTroopTypes = preferred.filter(u => game_data.units.includes(u));

        defTroopTypes.forEach((unit) => {
            thUnits += `
                <th class="ra-text-center">
                    <label for="unit_${unit}" class="ra-unit-type">
                        ${twSDK.unitImgTag(unit)}
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

    function updateMap(villagesArr) {
        const villageCoords = villagesArr.map(v => v.villageCoords);

        if (!mapOverlay.mapHandler._spawnSector) {
            mapOverlay.mapHandler._spawnSector = mapOverlay.mapHandler.spawnSector;
        }

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
                        const currentVillage = villagesArr.find(obj => obj.villageCoords == vCoords);
                        const villageDef = intToString(currentVillage.pop);

                        const eleDIV = $('<div></div>')
                            .css({
                                position: 'absolute',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '2px',
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

                        sector.appendElement(eleDIV[0], data.x + x - sector.x, data.y + y - sector.y);
                    }
                }
            }
        };

        mapOverlay.reload();
    }

    function calculateAmountMissingTroops(villagesThatNeedStack, unitAmounts, scaleDownPerField) {
        return villagesThatNeedStack.map((village) => {
            const distance = parseInt(village.fieldsAway, 10);
            const missingTroops = calculateMissingTroops(village.troops, unitAmounts, distance, scaleDownPerField);
            return { ...village, missingTroops };
        });
    }

    // ✅ PATCHED: safe troop reads (avoid NaN on missing unit keys)
    function calculateMissingTroops(troops, unitAmounts, distance, scaleDownPerField) {
        let missingTroops = {};
        const nonScalingUnits = ['spy', 'heavy'];

        distance = distance - 1;

        for (let [key, value] of Object.entries(unitAmounts)) {
            // ignore units that don't exist on this world
            if (!game_data.units.includes(key)) continue;

            let troopsAfterScalingDown = value - parseInt(distance, 10) * scaleDownPerField * 1000;

            if (troopsAfterScalingDown > 0 && !nonScalingUnits.includes(key)) {
                const have = Number(troops?.[key] ?? 0);
                const diff = have - troopsAfterScalingDown;
                missingTroops[key] = Math.abs(Math.trunc(diff));
            }
        }

        return missingTroops;
    }

    function findVillagesThatNeedStack(playersData, chosenTribes, distance, unitAmount, stackLimit) {
        let playerVillages = playersData.map(p => p.villagesData).flat();

        let chosenTribeIds = twSDK.getEntityIdsByArrayIndex(chosenTribes, tribes, 2);
        let tribePlayers = getTribeMembersById(chosenTribeIds);
        let enemyTribeCoordinates = filterVillagesByPlayerIds(tribePlayers);

        let villagesWithinRadius = [];
        playerVillages.forEach((village) => {
            enemyTribeCoordinates.forEach((coordinate) => {
                const d = twSDK.calculateDistance(coordinate, village.villageCoords);
                if (d <= distance) villagesWithinRadius.push({ ...village, fieldsAway: Math.round(d * 100) / 100 });
            });
        });

        let villagesThatNeedStack = [];
        villagesWithinRadius.forEach((village) => {
            const troops = village.troops || {};
            const villagePop = calculatePop(troops);
            const realStackLimit = stackLimit * 1000;

            let shouldAdd = false;

            for (let [key, value] of Object.entries(unitAmount)) {
                if (!game_data.units.includes(key)) continue;
                if ((Number(troops?.[key] ?? 0)) < value) shouldAdd = true;
            }

            if (villagePop < realStackLimit) shouldAdd = true;

            if (shouldAdd) villagesThatNeedStack.push({ ...village, pop: villagePop });
        });

        villagesThatNeedStack.sort((a, b) => a.fieldsAway - b.fieldsAway);

        let uniq = {};
        villagesThatNeedStack.forEach((item) => {
            if (!uniq[item.villageId]) uniq[item.villageId] = item;
        });

        return Object.values(uniq);
    }

    function calculatePop(units) {
        let total = 0;
        for (let [key, value] of Object.entries(units || {})) {
            const amount = Number(value ?? 0);
            if (!amount) continue;

            const unitPop = (key === 'heavy')
                ? hcPopAmount
                : (twSDK.unitsFarmSpace[key] ?? 1);

            total += unitPop * amount;
        }
        return total;
    }

    function collectUserInput() {
        let chosenTribes = jQuery('#raTribes').val().trim();
        let distance = parseInt(jQuery('#raDistance').val(), 10);
        let stackLimit = parseInt(jQuery('#raStack').val(), 10);
        let scaleDownPerField = parseInt(jQuery('#raScalePerField').val(), 10);
        let unitAmounts = {};

        if (chosenTribes === '') {
            UI.ErrorMessage(twSDK.tt('You need to select an enemy tribe!'));
        } else {
            chosenTribes = chosenTribes.split(',');
        }

        jQuery('#raUnitSelector input').each(function () {
            const unit = jQuery(this).attr('data-unit');
            const amount = parseInt(jQuery(this).val(), 10) || 0;
            if (amount > 0) unitAmounts[unit] = amount;
        });

        return { chosenTribes, distance, unitAmounts, stackLimit, scaleDownPerField };
    }

    function intToString(num) {
        num = num.toString().replace(/[^0-9.]/g, '');
        if (num < 1000) return num;
        let si = [{ v: 1e3, s: 'K' },{ v: 1e6, s: 'M' },{ v: 1e9, s: 'B' },{ v: 1e12, s: 'T' },{ v: 1e15, s: 'P' },{ v: 1e18, s: 'E' }];
        let index;
        for (index = si.length - 1; index > 0; index--) if (num >= si[index].v) break;
        return (num / si[index].v).toFixed(2).replace(/\.0+$|(\.[0-9]*[1-9])0+$/, '$1') + si[index].s;
    }

    // REQUIRED world data helpers (same logic as yours)
    twSDK.getEntityIdsByArrayIndex = function (chosenItems, items, index) {
        const itemIds = [];
        chosenItems.forEach((chosenItem) => {
            items.forEach((item) => {
                if (twSDK.cleanString(item[index]) === twSDK.cleanString(chosenItem)) {
                    itemIds.push(parseInt(item[0], 10));
                }
            });
        });
        return itemIds;
    };

    function getTribeMembersById(tribeIds) {
        return players
            .filter((player) => tribeIds.includes(parseInt(player[2], 10)))
            .map((player) => parseInt(player[0], 10));
    }

    function filterVillagesByPlayerIds(playerIds) {
        return villages
            .filter((village) => playerIds.includes(parseInt(village[4], 10)))
            .map((village) => village[2] + '|' + village[3]);
    }

    async function getTribeMembersList() {
        let troopsMemberPage =
            '/game.php?village=' +
            game_data.village.id +
            '&screen=ally&mode=members_defense';
        if (game_data.player.sitter != '0') {
            troopsMemberPage += '&t=' + game_data.player.id;
        }

        const response = await jQuery.get(troopsMemberPage);
        const options = jQuery(response).find('.input-nicer option:not([disabled])');

        const membersToFetch = [];

        options.map(function (_, option) {
            let url =
                '/game.php?screen=ally&mode=members_defense&player_id=' +
                option.value +
                '&village=' +
                game_data.village.id;
            if (game_data.player.sitter != '0') url += '&t=' + game_data.player.id;

            if (!isNaN(parseInt(option.value, 10))) {
                membersToFetch.push({ url, id: parseInt(option.value, 10), name: option.text });
            }
        });

        return membersToFetch;
    }

    async function fetchWorldData() {
        try {
            const villages = await twSDK.worldDataAPI('village');
            const players = await twSDK.worldDataAPI('player');
            const tribes = await twSDK.worldDataAPI('ally');
            return { villages, players, tribes };
        } catch (error) {
            UI.ErrorMessage(error);
            console.error(`${scriptInfo} Error:`, error);
        }
    }
})();
