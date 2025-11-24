/* AutoFarm.js – BR138 – Versão 2.2 (patch 1 ataque por alvo, por coord)
 * - Multi-origem por GRUPO, ordenado por distância
 * - Somente 1 ataque por alvo (global) dentro do intervalo de proteção
 * - Filtros: Só já atacados, Sem perdas (amarelo), Campos máx., Lote/origem
 * - Envio via Template A (Accountmanager / TribalWars.post)
 * - Busca todas as páginas do Assistente de Saque
 */

(function () {
  'use strict';

  if (!window.$ || !window.game_data) {
    console.error('AutoFarm: jQuery/game_data indisponível');
    return;
  }

  // Se não estiver no Assistente de Saque, redireciona
  if (game_data.screen !== 'am_farm') {
    try {
      location.href = TribalWars.buildURL('GET', 'am_farm');
    } catch (e) {
      location.href = game_data.link_base_pure + 'am_farm';
    }
    return;
  }

  // Evita múltiplas instâncias
  if (window.AutoFarm && window.AutoFarm.__loaded) {
    const p0 = document.getElementById('autoFarmPanel_hosted_single_v2');
    if (p0) p0.style.display = 'block';
    if (window.UI && UI.SuccessMessage)
      UI.SuccessMessage('AutoFarm v2 já carregado (BR138).');
    return;
  }

  const $ = window.$;
  const PANEL_ID = 'autoFarmPanel_hosted_single_v2';
  const PLAN_ID = 'AutoFarmPlanTable';
  const skipUnits = new Set(['ram', 'catapult', 'knight', 'snob', 'militia']);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const q = (sel, ctx = document) => ctx.querySelector(sel);
  const qa = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function nowSec() {
    return Math.floor(Date.now() / 1000);
  }
  function toCoordObj(coord) {
    const m = (coord || '').match(/(\d{1,3})\|(\d{1,3})/);
    return m ? { x: +m[1], y: +m[2] } : null;
  }
  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // -------- Persistência de proteção --------
  const LAST_KEY = 'AF_lastSent_v2_combo';
  const LAST_KEY_GLOBAL = 'AF_lastSent_v2_GLOBAL_BY_COORD'; // coord → timestamp

  function loadJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch (_) {
      return {};
    }
  }
  function saveJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (_) {}
  }

  let lastSent = loadJson(LAST_KEY); // origemId:targetId → timestamp
  let lastSentGlobal = loadJson(LAST_KEY_GLOBAL); // "xxx|yyy" → timestamp

  let running = false;
  let timer = null;

  // -------- UI / Painel --------
  async function buildGroupSelect(selectedId) {
    try {
      const resp = await $.get(
        TribalWars.buildURL('GET', 'groups', { ajax: 'load_group_menu' })
      );
      let html = '<select id="af_group" style="max-width:180px">';
      resp.result.forEach((g) => {
        if (g.type === 'separator') html += '<option disabled>────────</option>';
        else
          html += `<option value="${g.group_id}" ${
            String(g.group_id) === String(selectedId) ? 'selected' : ''
          }>${g.name}</option>`;
      });
      html += '</select>';
      return html;
    } catch (e) {
      return `<select id="af_group"><option value="0" selected>Todos</option></select>`;
    }
  }

  async function buildPanel() {
    let p = q('#' + PANEL_ID);
    if (p) return p;

    const units = game_data.units.filter((u) => !skipUnits.has(u));
    const savedUnits = JSON.parse(localStorage.getItem('AF_units') || '{}');
    const intSaved = Number(localStorage.getItem('AF_int') || 3);
    const batchSaved = Number(localStorage.getItem('AF_batch') || 10);
    const onlyKnownSav = localStorage.getItem('AF_onlyKnown') !== '0';
    const noLossesSav = localStorage.getItem('AF_noLosses') !== '0';
    const gapSaved = Number(localStorage.getItem('AF_gapMin') || 15);
    const maxFieldsSav = Number(localStorage.getItem('AF_maxFields') || 25);
    const groupSav = localStorage.getItem('AF_groupId') || '0';

    const groupSelect = await buildGroupSelect(groupSav);

    p = document.createElement('div');
    p.id = PANEL_ID;
    p.style.cssText = `
      position:fixed; top:80px; right:16px; z-index:99999;
      background:#fff; border:1px solid #7d510f; padding:10px; width:380px;
      box-shadow:0 6px 18px rgba(0,0,0,.2); border-radius:10px; font:12px/1.25 Arial, sans-serif;
    `;
    p.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:move;" id="af_drag">
        <strong style="flex:1">AutoFarm v2.2 (BR138)</strong>
        <button id="af_hide" class="btn btn-cancel" title="Ocultar painel">×</button>
      </div>

      <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
        <label>Grupo:</label>
        ${groupSelect}
        <label style="margin-left:8px" title="Distância máxima (campos)">Campos máx.:</label>
        <input id="af_maxFields" type="number" min="1" step="1" value="${maxFieldsSav}" style="width:64px;">
      </div>

      <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
        <label title="minutos entre ciclos">Intervalo (min):</label>
        <input id="af_interval" type="number" min="0.2" step="0.1" value="${intSaved}" style="width:64px;">
        <label>Lote/origem:</label>
        <input id="af_batch" type="number" min="1" step="1" value="${batchSaved}" style="width:80px;">
      </div>

      <div style="display:flex; gap:10px; align-items:center; margin-bottom:6px;">
        <label title="Só alvos com relatório (já atacados)">
          <input id="af_onlyKnown" type="checkbox" ${onlyKnownSav ? 'checked' : ''}> Só alvos já atacados
        </label>
        <label title="Ignorar indicadores amarelos (perdas parciais)">
          <input id="af_noLosses" type="checkbox" ${noLossesSav ? 'checked' : ''}> Sem perdas (ignorar amarelo)
        </label>
      </div>

      <div style="display:flex; gap:6px; align-items:center; margin-bottom:8px;">
        <label title="NÃO reatacar mesmo alvo antes desse tempo">Proteção por alvo (min):</label>
        <input id="af_gapMin" type="number" min="1" step="1" value="${gapSaved}" style="width:64px;">
      </div>

      <div id="af_units" style="max-height:220px; overflow:auto; border:1px solid #ddd; padding:6px; border-radius:6px; margin-bottom:8px;"></div>

      <div style="display:flex; gap:8px; align-items:center;">
        <button id="af_start" class="btn">Start</button>
        <button id="af_stop" class="btn btn-cancel" disabled>Stop</button>
        <span id="af_status" style="margin-left:auto; color:#666;">pronto</span>
      </div>
      <div id="af_info" style="margin-top:6px;color:#444;"></div>
    `;
    document.body.appendChild(p);

    // linhas de tropas
    const box = q('#af_units');
    units.forEach((u) => {
      const st = savedUnits[u] || { checked: false, qty: 0 };
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
      row.innerHTML = `
        <input type="checkbox" class="af_cb" data-u="${u}" ${st.checked ? 'checked' : ''}>
        <img src="${image_base + 'unit/unit_' + u + '.png'}" style="width:16px;height:16px;">
        <span style="width:120px;text-transform:capitalize">${u}</span>
        <input type="number" min="0" step="1" value="${st.qty}" class="af_qty" data-u="${u}" style="width:100px;">
      `;
      box.appendChild(row);
    });

    function saveState() {
      const st = {};
      qa('.af_cb').forEach((cb) => {
        const u = cb.getAttribute('data-u');
        const qtyEl = q(`.af_qty[data-u="${u}"]`);
        st[u] = { checked: cb.checked, qty: Number(qtyEl.value || 0) };
      });
      localStorage.setItem('AF_units', JSON.stringify(st));
      localStorage.setItem('AF_int', String(q('#af_interval').value || 3));
      localStorage.setItem('AF_batch', String(q('#af_batch').value || 10));
      localStorage.setItem(
        'AF_onlyKnown',
        q('#af_onlyKnown').checked ? '1' : '0'
      );
      localStorage.setItem(
        'AF_noLosses',
        q('#af_noLosses').checked ? '1' : '0'
      );
      localStorage.setItem(
        'AF_gapMin',
        String(q('#af_gapMin').value || 15)
      );
      localStorage.setItem(
        'AF_maxFields',
        String(q('#af_maxFields').value || 25)
      );
      localStorage.setItem('AF_groupId', String(q('#af_group').value || '0'));
    }

    p.addEventListener('change', (ev) => {
      const t = ev.target;
      if (
        t.classList.contains('af_cb') ||
        t.classList.contains('af_qty') ||
        t.id === 'af_interval' ||
        t.id === 'af_batch' ||
        t.id === 'af_onlyKnown' ||
        t.id === 'af_noLosses' ||
        t.id === 'af_gapMin' ||
        t.id === 'af_maxFields' ||
        t.id === 'af_group'
      ) {
        saveState();
      }
    });

    // drag
    (function () {
      const drag = q('#af_drag');
      let sx,
        sy,
        ox,
        oy,
        moving = false;
      drag.addEventListener('mousedown', (e) => {
        moving = true;
        sx = e.clientX;
        sy = e.clientY;
        ox = p.offsetLeft;
        oy = p.offsetTop;
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!moving) return;
        p.style.left = ox + (e.clientX - sx) + 'px';
        p.style.top = oy + (e.clientY - sy) + 'px';
        p.style.right = 'auto';
      });
      document.addEventListener('mouseup', () => (moving = false));
      q('#af_hide').onclick = () => {
        p.style.display = 'none';
      };
    })();

    q('#af_start').onclick = start;
    q('#af_stop').onclick = stop;

    return p;
  }

  function status(txt) {
    const s = q('#af_status');
    if (s) s.textContent = txt;
  }
  function info(txt) {
    const i = q('#af_info');
    if (i) i.textContent = txt;
  }
  async function ensurePanel(show = true) {
    const p = await buildPanel();
    if (show) p.style.display = 'block';
    return p;
  }

  // ---------- renderização plano ----------
  function clearPlanTable() {
    $('#' + PLAN_ID).remove();
  }

  function renderPlanTable(plan) {
    clearPlanTable();
    const groups = {};
    plan.forEach((j) => {
      (groups[j.originCoord] = groups[j.originCoord] || []).push(j);
    });

    const $wrap = $(`
      <div id="${PLAN_ID}" class="vis" style="margin:8px 0;">
        <h4>FarmGod</h4>
        <div id="AF_progress" class="progress-bar live-progress-bar progress-bar-alive" style="width:98%;margin:5px auto;">
          <div style="background: rgb(146, 194, 0);"></div>
          <span class="label" style="margin-top:0px;"></span>
        </div>
        <table class="vis" width="100%">
          <thead>
            <tr>
              <th style="text-align:center;">Origem</th>
              <th style="text-align:center;">Target</th>
              <th style="text-align:center;">fields</th>
              <th style="text-align:center;">Farm</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `);

    const $tbody = $wrap.find('tbody');

    Object.keys(groups).forEach((originCoord) => {
      const arr = groups[originCoord];
      $tbody.append(`
        <tr>
          <td colspan="4" style="background:#e7d098;">
            <input type="button" class="btn" value="Ir para ${originCoord}" onclick="location.href='${game_data.link_base_pure}info_village&id=${arr[0].originId}'" style="float:right;">
            <b style="line-height:24px;">Origem: ${originCoord}</b>
          </td>
        </tr>
      `);
      arr.forEach((j) => {
        $tbody.append(`
          <tr class="af_plan_row" data-origin="${j.originId}" data-target="${j.targetId}">
            <td style="text-align:center;"><a href="${game_data.link_base_pure}info_village&id=${j.originId}">${j.originCoord}</a></td>
            <td style="text-align:center;"><a href="${game_data.link_base_pure}info_village&id=${j.targetId}">${j.targetCoord}</a></td>
            <td style="text-align:center;">${j.distance.toFixed(2)}</td>
            <td style="text-align:center;"><span class="farm_icon farm_icon_a" title="Template A"></span></td>
          </tr>
        `);
      });
    });

    const $anchor = $('#am_widget_Farm').first();
    if ($anchor.length) $anchor.before($wrap);
    else $('body').prepend($wrap);

    if (window.UI && UI.InitProgressBars) {
      UI.InitProgressBars();
      if (UI.updateProgressBar) {
        $('#AF_progress').data('current', 0).data('max', plan.length);
        UI.updateProgressBar($('#AF_progress'), 0, plan.length);
      }
    }
  }

  function updateProgressAfterSend() {
    const $pb = $('#AF_progress');
    if (!$pb.length || !window.UI || !UI.updateProgressBar) return;
    const cur = ($pb.data('current') || 0) + 1;
    const max = $pb.data('max') || 0;
    $pb.data('current', cur);
    UI.updateProgressBar($pb, cur, max);
  }

  // ---------- Template A ----------
  function getTemplateAId() {
    const inp = q(
      'form[action*="action=edit_all"] input[name*="template"][name*="[id]"]'
    );
    return inp ? Number(inp.value) : 1;
  }

  async function saveTemplateAFromPanel() {
    const form = q('form[action*="action=edit_all"]');
    if (!form) throw new Error('Form de template não encontrado.');
    const tplRow = form
      .querySelector('input[name*="template"][name*="[id]"]')
      ?.closest('tr');
    if (!tplRow) throw new Error('Linha do Template A não localizada.');

    const units = game_data.units.filter((u) => !skipUnits.has(u));
    units.forEach((u) => {
      const cb = q(`.af_cb[data-u="${u}"]`);
      const qtyEl = q(`.af_qty[data-u="${u}"]`);
      const inp = tplRow.querySelector(
        `input[name="${u}[amount]"], input[name^="${u}["], input[name*="[${u}]"]`
      );
      if (inp && cb && qtyEl)
        inp.value = cb.checked
          ? parseInt(qtyEl.value || '0', 10) || 0
          : 0;
    });

    const formData = $(form).serialize();
    await $.ajax({ url: form.getAttribute('action'), method: 'POST', data: formData });
  }

  // ---------- Assistente de Saque: URL base e páginas ----------
  function buildAmFarmBaseUrl() {
    const params = new URLSearchParams(window.location.search);
    const order = params.get('order');
    const dir = params.get('dir');
    const extra =
      (order ? '&order=' + encodeURIComponent(order) : '') +
      (dir ? '&dir=' + encodeURIComponent(dir) : '');
    return TribalWars.buildURL('GET', 'am_farm') + extra;
  }

  async function fetchFarms() {
    const farms = {};
    const base = buildAmFarmBaseUrl();

    const firstHtml = await $.ajax({ url: base });
    const $first = $(firstHtml);

    const hasFarmPage =
      /[?&]Farm_page=\d+/.test(firstHtml) ||
      $first.find('a.paged-nav-item[href*="Farm_page="]').length > 0;
    const pageParam = hasFarmPage ? 'Farm_page' : 'page';

    const $navRoot = $first.find('#plunder_list_nav').first();
    let pageCount = 0;
    if ($navRoot.length) {
      const items = $navRoot.find(
        'a.paged-nav-item, strong.paged-nav-item'
      );
      if (items.length) {
        const lastText = items
          .last()
          .text()
          .replace(/\D+/g, '');
        pageCount = Math.max(0, parseInt(lastText, 10) || 0);
      }
    }
    if (!pageCount) {
      const $sel = $first
        .find('.paged-nav-item')
        .first()
        .closest('td')
        .find('select')
        .first();
      if ($sel.length)
        pageCount = Math.max(0, $sel.find('option').length - 1);
    }

    function extract($html) {
      $html
        .find(
          '#plunder_list tr[id^="village_"], ' +
            '#plunder_list_1 tr[id^="village_"], ' +
            '#plunder_list_2 tr[id^="village_"]'
        )
        .each(function () {
          const $tr = $(this);
          const id = parseInt(this.id.split('_')[1], 10);
          const coordMatch = (
            $tr
              .find('a[href*="screen=report"][href*="view="]')
              .first()
              .text() || ''
          ).match(/\d{1,3}\|\d{1,3}/);
          if (!coordMatch) return;
          const coord = coordMatch[0];

          const dotImg =
            $tr.find('img[src*="graphic/dots/"]').attr('src') || '';
          const dotMatch = /dots\/(green|yellow|red|blue|red_blue)/.exec(
            dotImg
          );
          const dot = dotMatch ? dotMatch[1] : 'green';
          const hasReport = !!$tr.find(
            'a[href*="screen=report"][href*="view="]'
          ).length;

          farms[coord] = {
            id, // id da linha do assistente, usado só na requisição
            dot,
            hasReport,
          };
        });
    }

    extract($first);

    const sep = base.includes('?') ? '&' : '?';
    for (let p = 1; p <= pageCount; p++) {
      const html = await $.ajax({ url: `${base}${sep}${pageParam}=${p}` });
      extract($(html));
    }

    return farms;
  }

  // ---------- Aldeias de origem ----------
  async function fetchVillages(groupId) {
    const data = {};
    const url = TribalWars.buildURL('GET', 'overview_villages', {
      mode: 'combined',
      group: groupId,
    });

    async function process(page) {
      const html = await $.ajax({
        url: url + (page === -1 ? '' : '&page=' + page),
      });
      const $html = $(html);

      $html
        .find('#combined_table .row_a, #combined_table .row_b')
        .each(function () {
          const $el = $(this);
          const $qel = $el.find('.quickedit-label').first();
          const coordMatch = ($qel.text() || '').match(/\d{1,3}\|\d{1,3}/);
          if (!coordMatch) return;
          const coord = coordMatch[0];

          const id = parseInt(
            $el.find('.quickedit-vn').first().data('id'),
            10
          );
          const name = $qel.data('text') || $qel.text();
          const units = [];

          $el.find('.unit-item').each(function (i) {
            const uname = game_data.units[i];
            if (!skipUnits.has(uname)) {
              units.push(
                parseInt(
                  $(this)
                    .text()
                    .replace(/\D+/g, ''),
                  10
                ) || 0
              );
            }
          });

          data[coord] = { id, name, coord, units };
        });

      const navSel = $html
        .find('.paged-nav-item')
        .first()
        .closest('td')
        .find('select')
        .first();
      const navLen =
        navSel.length > 0
          ? navSel.find('option').length - 1
          : $html
              .find('.paged-nav-item')
              .not('[href*="page=-1"]').length;
      if (page < navLen) return process(page === -1 ? 1 : page + 1);
    }

    await process(-1);
    return data;
  }

  // ======================================================================
  // ⭐ Planejamento com proteção global por ALVO (coord) e por origem
  // ======================================================================
  function planPerOrigin(origins, farms, opts) {
    const useUnits = game_data.units.filter((u) => !skipUnits.has(u));

    // tropas mínimas por ataque (painel)
    const need = {};
    useUnits.forEach((u) => {
      const cb = q(`.af_cb[data-u="${u}"]`);
      const qtyEl = q(`.af_qty[data-u="${u}"]`);
      need[u] =
        cb && cb.checked
          ? Math.max(0, parseInt(qtyEl.value || '0', 10) || 0)
          : 0;
    });

    const now = nowSec();
    const { maxFields, onlyKnown, noLosses, gapSec, batch } = opts;

    // 1) quota de ataques por origem
    const originQuota = {};
    Object.keys(origins).forEach((originCoord) => {
      const org = origins[originCoord];
      const availByName = {};
      let idx = 0;
      for (let i = 0; i < game_data.units.length; i++) {
        const uname = game_data.units[i];
        if (!skipUnits.has(uname)) {
          availByName[uname] = org.units[idx++] || 0;
        }
      }

      let possible = Infinity;
      let hasAny = false;
      Object.keys(need).forEach((u) => {
        const n = need[u];
        if (n > 0) {
          hasAny = true;
          const have = availByName[u] || 0;
          const c = Math.floor(have / n);
          possible = Math.min(possible, c);
        }
      });

      if (!hasAny || !isFinite(possible)) possible = 0;
      originQuota[originCoord] = Math.min(batch, Math.max(0, possible));
    });

    // 2) gera todas as combinações origem+alvo válidas
    const candidates = [];
    Object.keys(origins).forEach((originCoord) => {
      const quota = originQuota[originCoord];
      if (!quota || quota <= 0) return;

      const org = origins[originCoord];
      const oC = toCoordObj(originCoord);
      if (!oC) return;

      Object.keys(farms).forEach((targetCoord) => {
        const f = farms[targetCoord];
        if (!f) return;

        const tC = toCoordObj(targetCoord);
        if (!tC) return;

        const d = dist(oC, tC);
        if (d > maxFields) return;

        const flag = f.dot || f.color || 'green';
        if (flag === 'red' || flag === 'red_blue') return;
        if (noLosses && flag === 'yellow') return;
        if (onlyKnown && !f.hasReport) return;

        // proteção global por COORD (não por id de linha)
        const lastGlobal = lastSentGlobal[targetCoord]
          ? Number(lastSentGlobal[targetCoord])
          : 0;
        if (lastGlobal && now - lastGlobal < gapSec) return;

        // proteção original combo origem+alvo (id de linha)
        const keyCombo = org.id + ':' + f.id;
        const lastCombo = lastSent[keyCombo]
          ? Number(lastSent[keyCombo])
          : 0;
        if (lastCombo && now - lastCombo < gapSec) return;

        candidates.push({
          originCoord,
          originId: org.id,
          targetCoord,
          targetId: f.id,
          distance: d,
        });
      });
    });

    // 3) ordena por distância (mais perto primeiro)
    candidates.sort((a, b) => a.distance - b.distance);

    // 4) monta plano final:
    //    - cada alvo (coord) entra no máximo 1 vez
    //    - cada origem não passa da quota calculada
    const usedTargets = new Set(); // coord
    const plan = [];

    for (const c of candidates) {
      if (originQuota[c.originCoord] <= 0) continue;
      if (usedTargets.has(c.targetCoord)) continue;

      plan.push(c);
      originQuota[c.originCoord] -= 1;
      usedTargets.add(c.targetCoord);
    }

    return plan;
  }

  // ---------- envio ----------
  async function sendWithTemplateA(targetId, originVillageId) {
    return new Promise((resolve, reject) => {
      try {
        const url = Accountmanager.send_units_link.replace(
          /village=\d+/,
          'village=' + originVillageId
        );
        const data = {
          target: targetId,
          template_id: getTemplateAId(),
          source: originVillageId,
        };

        const n =
          window.Timing && Timing.getElapsedTimeSinceLoad
            ? Timing.getElapsedTimeSinceLoad()
            : Date.now();
        if (window.Accountmanager && Accountmanager.farm) {
          if (
            Accountmanager.farm.last_click &&
            n - Accountmanager.farm.last_click < 200
          ) {
            return setTimeout(() => {
              sendWithTemplateA(targetId, originVillageId)
                .then(resolve)
                .catch(reject);
            }, 220);
          }
          Accountmanager.farm.last_click = n;
        }

        TribalWars.post(
          url,
          null,
          data,
          (r) => resolve(r),
          (e) => reject(e || 'Falha no envio')
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  // ---------- ciclo ----------
  async function tick() {
    try {
      if (!running) return;

      const groupId = q('#af_group')?.value || '0';
      const batch = Math.max(
        1,
        parseInt(q('#af_batch').value || '10', 10)
      );
      const onlyKnown = q('#af_onlyKnown').checked;
      const noLosses = q('#af_noLosses').checked;
      const gapMin = Math.max(
        1,
        parseInt(q('#af_gapMin').value || '15', 10)
      );
      const gapSec = gapMin * 60;
      const maxFields = Math.max(
        1,
        parseInt(q('#af_maxFields').value || '25', 10)
      );

      status('salvando template...');
      await saveTemplateAFromPanel();

      status('lendo aldeias do grupo...');
      const villages = await fetchVillages(groupId);

      status('lendo lista de saque...');
      const farms = await fetchFarms();

      status('planejando...');
      const plan = planPerOrigin(villages, farms, {
        maxFields,
        onlyKnown,
        noLosses,
        gapSec,
        batch,
      });

      info(`Plano gerado: ${plan.length} envios nesta passada`);
      renderPlanTable(plan);

      if (!plan.length) {
        status('sem alvos válidos');
        return;
      }

      const startT = nowSec();
      let sent = 0;

      for (const job of plan) {
        if (!running) break;

        status(
          `enviando ${sent + 1}/${plan.length} (origem ${
            job.originCoord
          } → alvo ${job.targetCoord})`
        );
        try {
          await sendWithTemplateA(job.targetId, job.originId);

          // proteção combo
          lastSent[job.originId + ':' + job.targetId] = startT;
          saveJson(LAST_KEY, lastSent);

          // proteção global por COORD
          lastSentGlobal[job.targetCoord] = startT;
          saveJson(LAST_KEY_GLOBAL, lastSentGlobal);

          $(
            `#${PLAN_ID} tr.af_plan_row[data-origin="${job.originId}"][data-target="${job.targetId}"]`
          ).remove();
          updateProgressAfterSend();

          if (window.UI && UI.SuccessMessage)
            UI.SuccessMessage(
              `OK ${job.originCoord} → ${job.targetCoord}`
            );
          sent++;
          await sleep(350 + Math.random() * 250);
        } catch (e) {
          if (window.UI && UI.ErrorMessage)
            UI.ErrorMessage(e && e.error ? e.error : 'Falha no envio');
        }
      }

      status(`OK: ${sent}/${plan.length} envios`);
    } catch (e) {
      console.error(e);
      status('erro: ' + (e?.message || e));
    }
  }

  async function start() {
    if (running) return;
    await ensurePanel(true);
    running = true;
    const btnS = q('#af_start'),
      btnP = q('#af_stop');
    if (btnS) btnS.disabled = true;
    if (btnP) btnP.disabled = false;
    status('iniciando...');
    clearPlanTable();
    const minutes = Math.max(
      0.2,
      parseFloat(q('#af_interval').value || '3')
    );
    await tick();
    timer = setInterval(tick, minutes * 60 * 1000);
  }

  function stop() {
    running = false;
    if (timer) clearInterval(timer);
    const btnS = q('#af_start'),
      btnP = q('#af_stop');
    if (btnS) btnS.disabled = false;
    if (btnP) btnP.disabled = true;
    status('parado');
  }

  // boot
  (async function () {
    await ensurePanel(true);
    if (window.UI && UI.SuccessMessage)
      UI.SuccessMessage('AutoFarm v2.2 (BR138) carregado.');
  })();

  window.AutoFarm = { start, stop, isRunning: () => running, __loaded: true };
})();
