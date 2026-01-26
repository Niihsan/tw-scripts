(async function () {
  try {
    // garante que estamos no mapa
    if (
      !/screen=map/.test(location.href) &&
      !(window.game_data && game_data.screen === 'map')
    ) {
      alert('Abra o MAPA (screen=map) antes de rodar.');
      return;
    }

    const K_ON = 'TW:WT:ON';
    const K_IDS = 'TW:WT:IDS';

    // tabela oficial de alcance por nível (campos)
    const RANGE = {
      1: 1.1, 2: 1.3, 3: 1.5, 4: 1.7, 5: 2.0,
      6: 2.3, 7: 2.6, 8: 3.0, 9: 3.4, 10: 3.9,
      11: 4.4, 12: 5.1, 13: 5.8, 14: 6.7, 15: 7.6,
      16: 8.7, 17: 10.0, 18: 11.5, 19: 13.1, 20: 15.0
    };

    // toggle OFF
    if (localStorage.getItem(K_ON) === '1') {
      const ids = JSON.parse(localStorage.getItem(K_IDS) || '[]');
      try {
        if (window.TWMap?.map?.removeCircle) {
          ids.forEach(id => TWMap.map.removeCircle(id));
          TWMap.map.render && TWMap.map.render();
        }
      } catch (e) {}
      localStorage.setItem(K_ON, '0');
      localStorage.removeItem(K_IDS);
      alert('Torres: OFF');
      return;
    }

    if (!window.TWMap?.map?.addCircle) {
      alert('TWMap.map.addCircle não encontrado.');
      return;
    }

    // busca visão geral de edifícios (somente suas aldeias)
    const base = location.origin + location.pathname; // /game.php
    const url =
      base + '?screen=overview_villages&mode=buildings&page=-1';

    const html = await fetch(url, {
      credentials: 'same-origin'
    }).then(r => r.text());

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const rows = Array.from(doc.querySelectorAll('table.vis tr'));

    const towers = [];

    for (const tr of rows) {
      const txt = tr.textContent || '';
      const m = txt.match(/(\d{1,3})\|(\d{1,3})/);
      if (!m) continue;

      const x = Number(m[1]);
      const y = Number(m[2]);

      let lvl = 0;

      // BR138: torre vem como td[data-building="watchtower"]
      const tdTower =
        tr.querySelector('td[data-building="watchtower"]') ||
        tr.querySelector('td.watchtower') ||
        tr.querySelector('td.building.watchtower');

      if (tdTower) {
        const lm = tdTower.textContent.trim().match(/\d{1,2}/);
        if (lm) lvl = Number(lm[0]);
      }

      if (lvl >= 1 && lvl <= 20) {
        towers.push({ x, y, lvl });
      }
    }

    // fallback manual
    if (!towers.length) {
      const sample = '500|500:20 501|501:10';
      const inp = prompt(
        'Não consegui ler automaticamente.\n' +
          'Cole coords no formato x|y:nivel\n\nEx: ' +
          sample,
        ''
      );
      if (!inp) return;

      inp
        .match(/\d{1,3}\|\d{1,3}\s*:\s*\d{1,2}/g)
        ?.forEach(s => {
          const m = s.match(
            /(\d{1,3})\|(\d{1,3})\s*:\s*(\d{1,2})/
          );
          if (!m) return;
          const x = +m[1],
            y = +m[2],
            lvl = +m[3];
          if (lvl >= 1 && lvl <= 20) towers.push({ x, y, lvl });
        });

      if (!towers.length) {
