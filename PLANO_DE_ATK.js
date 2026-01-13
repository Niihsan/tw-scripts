(function () {
  'use strict';

  const SCRIPT_ID = 'twAttackPlannerMember';
  if (window[SCRIPT_ID]) {
    // re-open if already loaded
    try { window[SCRIPT_ID].open(); } catch (e) {}
    return;
  }

  const AP = {
    state: {
      villagesOwn: [],   // own troops at home (type=own)
      villagesThere: [], // troops "in village" (type=there) includes support
      lastLoadedAt: 0,
    },

    // ---------- utils ----------
    getSitterParam() {
      try {
        if (game_data?.player?.sitter && Number(game_data.player.sitter) > 0) {
          return `&t=${game_data.player.id}`;
        }
      } catch (e) {}
      return '';
    },

    cleanInt(s) {
      if (s == null) return 0;
      const n = parseInt(String(s).replace(/[^\d]/g, ''), 10);
      return Number.isFinite(n) ? n : 0;
    },

    dist(a, b) {
      const [x1, y1] = a.split('|').map(Number);
      const [x2, y2] = b.split('|').map(Number);
      const dx = Math.abs(x1 - x2);
      const dy = Math.abs(y1 - y2);
      return Math.sqrt(dx * dx + dy * dy);
    },

    uniqCoords(list) {
      const out = [];
      const seen = new Set();
      list.forEach(c => {
        const m = String(c).match(/\b(\d{1,3}\|\d{1,3})\b/);
        if (!m) return;
        const v = m[1];
        if (!seen.has(v)) { seen.add(v); out.push(v); }
      });
      return out;
    },

    // ---------- scoring (customize if you want) ----------
    // attack score: tries to represent "offense capacity" using typical units
    calcAtkScore(t) {
      const u = (k) => this.cleanInt(t?.[k] ?? 0);
      // worlds may not have archer/marcher
      const has = (k) => (game_data?.units || []).includes(k);
      let score = 0;

      // "axe" heavy on offense
      if (has('axe')) score += u('axe') * 1.0;
      if (has('light')) score += u('light') * 4.0;
      if (has('marcher')) score += u('marcher') * 4.0;
      if (has('ram')) score += u('ram') * 8.0;
      if (has('catapult')) score += u('catapult') * 12.0;

      // sometimes people use spear/sword as fillers
      if (has('spear')) score += u('spear') * 0.2;
      if (has('sword')) score += u('sword') * 0.2;

      return Math.round(score);
    },

    // defense score: uses spear/sword/heavy primarily (and archer if exists)
    calcDefScore(t) {
      const u = (k) => this.cleanInt(t?.[k] ?? 0);
      const has = (k) => (game_data?.units || []).includes(k);
      let score = 0;

      if (has('spear')) score += u('spear') * 1.0;
      if (has('sword')) score += u('sword') * 1.2;
      if (has('archer')) score += u('archer') * 1.0;
      if (has('heavy')) score += u('heavy') * 6.0;

      // a bit of spy/knight optional
      if (has('spy')) score += u('spy') * 0.2;
      if (has('knight')) score += u('knight') * 10.0;

      return Math.round(score);
    },

    // ---------- overview parsing ----------
    async fetchOverviewUnits(type /* 'own' | 'there' */) {
      const sitter = this.getSitterParam();
      const vid = game_data?.village?.id || '';
      const url = `/game.php?screen=overview_villages&mode=units&type=${encodeURIComponent(type)}&village=${vid}${sitter}`;

      const html = await jQuery.get(url);
      const doc = jQuery.parseHTML(html);

      // find the table with unit icons
      let $table = jQuery(doc).find('table#units_table').first();
      if (!$table.length) {
        jQuery(doc).find('table.vis').each(function () {
          const $t = jQuery(this);
          if (!$table.length && $t.find('img[src*="/graphic/unit/unit_"]').length) $table = $t;
        });
      }
      if (!$table.length) return [];

      // map unit -> column index from header images
      const unitCol = {};
      $table.find('thead tr').first().find('th').each(function (i) {
        const $img = jQuery(this).find('img[src*="/graphic/unit/unit_"]');
        if (!$img.length) return;
        const src = $img.attr('src') || '';
        const m = src.match(/unit_([a-z0-9_]+)\./i);
        if (m && m[1]) unitCol[m[1]] = i;
      });

      // units that exist on this world AND are present on the table
      const worldUnits = (game_data?.units || []).slice();
      const unitsInTable = worldUnits.filter(u => unitCol[u] !== undefined);

      if (!unitsInTable.length) return [];

      const rows = [];
      $table.find('tbody tr').each(function () {
        const $tr = jQuery(this);
        const $tds = $tr.find('td');
        if ($tds.length < 2) return;

        // village link (usually first td)
        const $a = $tr.find('td').first().find('a').first();
        if (!$a.length) return;

        const href = $a.attr('href') || '';
        let villageId = parseInt(new URL(href, window.location.origin).searchParams.get('id'), 10);
        if (!Number.isFinite(villageId)) {
          const v2 = parseInt(new URL(href, window.location.origin).searchParams.get('village'), 10);
          if (Number.isFinite(v2)) villageId = v2;
        }
        if (!Number.isFinite(villageId)) return;

        const rowText = $tr.text();
        const coords = (rowText.match(/\d{1,3}\|\d{1,3}/g) || [null])[0];
        if (!coords) return;

        const name = $a.text().trim() || `Village ${coords}`;

        const troops = {};
        unitsInTable.forEach((unit) => {
          const idx = unitCol[unit];
          const raw = jQuery($tds.get(idx)).text().trim();
          troops[unit] = AP.cleanInt(raw);
        });

        rows.push({
          villageId,
          villageName: name,
          coords,
          troops,
          snob: AP.cleanInt(troops.snob),
        });
      });

      return rows;
    },

    async loadData(force = false) {
      const now = Date.now();
      if (!force && (now - this.state.lastLoadedAt) < 30 * 1000 && this.state.villagesOwn.length) {
        return; // cache 30s
      }

      this.ui.setStatus('Carregando overview (own/there)...');

      const [own, there] = await Promise.all([
        this.fetchOverviewUnits('own'),   // próprias tropas em casa (atk + snob)
        this.fetchOverviewUnits('there'), // na aldeia (def + apoio)
      ]);

      this.state.villagesOwn = own || [];
      this.state.villagesThere = there || [];
      this.state.lastLoadedAt = now;

      if (!this.state.villagesOwn.length || !this.state.villagesThere.length) {
        this.ui.setStatus('Erro ao ler overview. Abra a visão geral de unidades pelo menos 1x e tente de novo.');
      } else {
        this.ui.setStatus(`OK: ${this.state.villagesOwn.length} vilas (ATK) / ${this.state.villagesThere.length} vilas (DEF).`);
      }
    },

    // ---------- planning ----------
    planForTargets(targets, opts) {
      const own = this.state.villagesOwn;
      const there = this.state.villagesThere;

      const topN = opts.topN;
      const requireNoble = opts.requireNoble;
      const minAtkScore = opts.minAtkScore;

      const results = targets.map((target) => {
        // candidates for ATK
        let atkCandidates = own.map(v => {
          const d = this.dist(v.coords, target);
          const atkScore = this.calcAtkScore(v.troops);
          return { ...v, d, atkScore };
        });

        if (requireNoble) atkCandidates = atkCandidates.filter(v => (v.troops?.snob || 0) > 0);
        if (minAtkScore > 0) atkCandidates = atkCandidates.filter(v => v.atkScore >= minAtkScore);

        atkCandidates.sort((a, b) => a.d - b.d);

        // candidates for DEF ("there" includes support)
        let defCandidates = there.map(v => {
          const d = this.dist(v.coords, target);
          const defScore = this.calcDefScore(v.troops);
          return { ...v, d, defScore };
        });
        defCandidates.sort((a, b) => a.d - b.d);

        return {
          target,
          atk: atkCandidates.slice(0, topN),
          def: defCandidates.slice(0, topN),
        };
      });

      return results;
    },

    // ---------- UI ----------
    ui: {
      root: null,
      open() {
        if (!this.root) AP.ui.mount();
        AP.ui.root.show();
      },
      close() {
        if (AP.ui.root) AP.ui.root.remove();
        AP.ui.root = null;
      },
      setStatus(msg) {
        const $s = jQuery('#apStatus');
        if ($s.length) $s.text(msg);
      },

      mount() {
        // remove old
        jQuery('#apPlannerBox').remove();

        const html = `
          <div id="apPlannerBox" style="
            position:fixed; z-index:999999; right:18px; top:110px; width:560px;
            border:2px solid #7d510f; border-radius:10px; padding:10px;
            background:#e3d5b3 url('/graphic/index/main_bg.jpg') scroll right top repeat;
            box-shadow:0 8px 30px rgba(0,0,0,.25);
            font-family: Verdana, Arial, sans-serif;
          ">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
              <div style="font-weight:700; font-size:14px;">Attack Planner (Member)</div>
              <div style="display:flex; gap:8px;">
                <a href="javascript:void(0)" id="apReload" class="btn">Recarregar dados</a>
                <a href="javascript:void(0)" id="apClose" class="btn">X</a>
              </div>
            </div>

            <div style="margin-top:8px; font-size:12px;">
              Alvos (1 por linha): <span style="opacity:.85;">ex: 500|500</span>
            </div>
            <textarea id="apTargets" style="
              width:100%; height:90px; margin-top:6px; padding:8px;
              font-size:13px; border:1px solid #7d510f; border-radius:6px; resize:vertical;
              background:#fffaf0;
            " placeholder="500|500&#10;501|498&#10;..."></textarea>

            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-top:10px;">
              <label style="font-size:12px;">
                Mostrar top N<br>
                <input id="apTopN" type="number" min="1" max="50" value="5" style="width:100%; padding:6px; font-size:13px;">
              </label>
              <label style="font-size:12px;">
                Min ATK score<br>
                <input id="apMinAtk" type="number" min="0" value="0" style="width:100%; padding:6px; font-size:13px;">
              </label>
              <label style="font-size:12px; display:flex; align-items:flex-end; gap:8px;">
                <input id="apNeedNoble" type="checkbox" style="transform:scale(1.15);">
                Exigir nobre
              </label>
            </div>

            <div style="margin-top:10px; display:flex; gap:10px; align-items:center;">
              <a href="javascript:void(0)" id="apPlan" class="btn">Planejar ataque</a>
              <div id="apStatus" style="font-size:12px; opacity:.9;">Pronto.</div>
            </div>

            <div id="apOut" style="margin-top:10px; max-height:420px; overflow:auto;"></div>
          </div>
        `;

        jQuery('body').append(html);
        AP.ui.root = jQuery('#apPlannerBox');

        // events
        jQuery('#apClose').on('click', function () {
          AP.ui.close();
        });

        jQuery('#apReload').on('click', async function () {
          try {
            await AP.loadData(true);
          } catch (e) {
            AP.ui.setStatus('Erro ao recarregar.');
            console.error(e);
          }
        });

        jQuery('#apPlan').on('click', async function () {
          try {
            await AP.loadData(false);

            if (!AP.state.villagesOwn.length || !AP.state.villagesThere.length) {
              UI.ErrorMessage('Não consegui ler suas vilas no overview.');
              return;
            }

            const raw = jQuery('#apTargets').val() || '';
            const targets = AP.uniqCoords(raw.split(/\s+/g));
            if (!targets.length) {
              UI.ErrorMessage('Informe pelo menos 1 coordenada alvo.');
              return;
            }

            const opts = {
              topN: Math.max(1, Math.min(50, parseInt(jQuery('#apTopN').val(), 10) || 5)),
              requireNoble: !!jQuery('#apNeedNoble').prop('checked'),
              minAtkScore: Math.max(0, parseInt(jQuery('#apMinAtk').val(), 10) || 0),
            };

            AP.ui.setStatus(`Calculando para ${targets.length} alvo(s)...`);
            const res = AP.planForTargets(targets, opts);
            AP.ui.render(res, opts);
            AP.ui.setStatus('OK.');
          } catch (e) {
            AP.ui.setStatus('Erro no planejamento.');
            console.error(e);
            UI.ErrorMessage('Erro no planner. Veja o console.');
          }
        });

        // initial load
        AP.loadData(false).catch(() => {});
      },

      render(results, opts) {
        const esc = (s) => String(s).replace(/[&<>"']/g, m => ({
          '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[m]));

        const rowAtk = (v) => {
          const sn = (v.troops?.snob || 0);
          const spy = (v.troops?.spy || 0);
          return `
            <tr>
              <td style="padding:6px; border:1px solid #bd9c5a;">${esc(v.coords)}</td>
              <td style="padding:6px; border:1px solid #bd9c5a; text-align:left;">
                <a href="/game.php?screen=info_village&id=${v.villageId}" target="_blank" rel="noreferrer noopener">${esc(v.villageName)}</a>
              </td>
              <td style="padding:6px; border:1px solid #bd9c5a;">${v.d.toFixed(2)}</td>
              <td style="padding:6px; border:1px solid #bd9c5a;">${v.atkScore}</td>
              <td style="padding:6px; border:1px solid #bd9c5a;">${spy}</td>
              <td style="padding:6px; border:1px solid #bd9c5a;">${sn}</td>
            </tr>
          `;
        };

        const rowDef = (v) => {
          const heavy = (v.troops?.heavy || 0);
          const spear = (v.troops?.spear || 0);
          const sword = (v.troops?.sword || 0);
          return `
            <tr>
              <td style="padding:6px; border:1px solid #bd9c5a;">${esc(v.coords)}</td>
              <td style="padding:6px; border:1px solid #bd9c5a; text-align:left;">
                <a href="/game.php?screen=info_village&id=${v.villageId}" target="_blank" rel="noreferrer noopener">${esc(v.villageName)}</a>
              </td>
              <td style="padding:6px; border:1px solid #bd9c5a;">${v.d.toFixed(2)}</td>
              <td style="padding:6px; border:1px solid #bd9c5a;">${v.defScore}</td>
              <td style="padding:6px; border:1px solid #bd9c5a;">${spear}</td>
              <td style="padding:6px; border:1px solid #bd9c5a;">${sword}</td>
              <td style="padding:6px; border:1px solid #bd9c5a;">${heavy}</td>
            </tr>
          `;
        };

        const block = results.map(r => {
          const atkRows = r.atk.length ? r.atk.map(rowAtk).join('') : `
            <tr><td colspan="6" style="padding:8px; border:1px solid #bd9c5a; text-align:center;">
              Nenhuma vila atende ATK (filtros: ${opts.requireNoble ? 'nobre ' : ''}${opts.minAtkScore ? 'min atkScore ' + opts.minAtkScore : ''})
            </td></tr>
          `;

          const defRows = r.def.length ? r.def.map(rowDef).join('') : `
            <tr><td colspan="7" style="padding:8px; border:1px solid #bd9c5a; text-align:center;">
              Nenhuma vila encontrada para DEF.
            </td></tr>
          `;

          return `
            <div style="margin-top:12px; padding:10px; border:1px solid #7d510f; border-radius:8px; background:#f4e4bc;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div style="font-weight:700;">Alvo: ${esc(r.target)}</div>
                <a class="btn" href="javascript:TWMap.focus(${r.target.split('|')[0]}, ${r.target.split('|')[1]});">Ver no mapa</a>
              </div>

              <div style="font-weight:700; margin:6px 0 4px;">ATK mais próximas (próprias tropas em casa)</div>
              <table style="width:100%; border-collapse:separate; border-spacing:0; border:2px solid #bd9c5a; background:#fff5da;">
                <thead>
                  <tr>
                    <th style="padding:6px; border:1px solid #bd9c5a;">Coords</th>
                    <th style="padding:6px; border:1px solid #bd9c5a; text-align:left;">Vila</th>
                    <th style="padding:6px; border:1px solid #bd9c5a;">Dist</th>
                    <th style="padding:6px; border:1px solid #bd9c5a;">AtkScore</th>
                    <th style="padding:6px; border:1px solid #bd9c5a;">Spy</th>
                    <th style="padding:6px; border:1px solid #bd9c5a;">Nobre</th>
                  </tr>
                </thead>
                <tbody>${atkRows}</tbody>
              </table>

              <div style="font-weight:700; margin:10px 0 4px;">DEF mais próximas (na aldeia, inclui apoios)</div>
              <table style="width:100%; border-collapse:separate; border-spacing:0; border:2px solid #bd9c5a; background:#fff5da;">
                <thead>
                  <tr>
                    <th style="padding:6px; border:1px solid #bd9c5a;">Coords</th>
                    <th style="padding:6px; border:1px solid #bd9c5a; text-align:left;">Vila</th>
                    <th style="padding:6px; border:1px solid #bd9c5a;">Dist</th>
                    <th style="padding:6px; border:1px solid #bd9c5a;">DefScore</th>
                    <th style="padding:6px; border:1px solid #bd9c5a;">Spear</th>
                    <th style="padding:6px; border:1px solid #bd9c5a;">Sword</th>
                    <th style="padding:6px; border:1px solid #bd9c5a;">Heavy</th>
                  </tr>
                </thead>
                <tbody>${defRows}</tbody>
              </table>
            </div>
          `;
        }).join('');

        jQuery('#apOut').html(block);
      },
    },
  };

  window[SCRIPT_ID] = AP;
  AP.ui.open();

})();
