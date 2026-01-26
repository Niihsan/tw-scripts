(async function(){
  try{
    if(!/screen=map/.test(location.href) && !(window.game_data&&game_data.screen==='map')){
      alert('Abra o MAPA (screen=map) antes de rodar.');
      return;
    }

    const K_ON='TW:WT:ON', K_IDS='TW:WT:IDS';

    // Tabela oficial de alcance (campos) por nível (1..20)
    const RANGE = {
      1:1.1, 2:1.3, 3:1.5, 4:1.7, 5:2.0,
      6:2.3, 7:2.6, 8:3.0, 9:3.4, 10:3.9,
      11:4.4, 12:5.1, 13:5.8, 14:6.7, 15:7.6,
      16:8.7, 17:10.0, 18:11.5, 19:13.1, 20:15.0
    };

    // OFF (toggle)
    if(localStorage.getItem(K_ON)==='1'){
      const ids = JSON.parse(localStorage.getItem(K_IDS)||'[]');
      try{
        if(window.TWMap?.map?.removeCircle){
          ids.forEach(id=>TWMap.map.removeCircle(id));
          TWMap.map.render && TWMap.map.render();
        }
      }catch(e){}
      localStorage.setItem(K_ON,'0');
      localStorage.removeItem(K_IDS);
      alert('Torres: OFF');
      return;
    }

    if(!window.TWMap?.map?.addCircle){
      alert('Não encontrei TWMap.map.addCircle nesse mundo/versão. Não consigo desenhar no mapa.');
      return;
    }

    // tenta buscar suas aldeias + níveis de torre pela visão geral de edifícios
    const base = location.origin + location.pathname; // /game.php
    const url  = base + '?screen=overview_villages&mode=buildings&page=-1';

    const html = await fetch(url, {credentials:'same-origin'}).then(r=>r.text());
    const doc = new DOMParser().parseFromString(html,'text/html');

    // achar linhas da tabela
    const rows = Array.from(doc.querySelectorAll('table.vis tr'));
    let towers = [];

    for(const tr of rows){
      const text = tr.textContent || '';
      const m = text.match(/(\d{1,3})\|(\d{1,3})/);
      if(!m) continue;

      const x = Number(m[1]), y = Number(m[2]);

      // tenta achar nível da watchtower na linha
      // (varia por layout: às vezes vem como número no td da torre, às vezes num span)
      let lvl = 0;

      // heurísticas comuns
      const tds = Array.from(tr.querySelectorAll('td'));
      for(const td of tds){
        const t = (td.textContent||'').trim();
        // pega o primeiro número “pequeno” que apareça em td de building
        if(/^\d{1,2}$/.test(t)){
          const n = Number(t);
          if(n>=1 && n<=20){
            // não dá pra saber 100% se é a torre, então fazemos um teste extra:
            // se o td tiver algum indicativo de watchtower no HTML
            const htmlTd = (td.innerHTML||'').toLowerCase();
            if(htmlTd.includes('watchtower') || htmlTd.includes('torre') || htmlTd.includes('eye') || htmlTd.includes('olho')){
              lvl = n; break;
            }
          }
        }
        // fallback: se o td contém a palavra watchtower/torre e um número
        const mm = t.match(/(watchtower|torre)[^\d]*(\d{1,2})/i);
        if(mm){
          const n = Number(mm[2]);
          if(n>=1 && n<=20){ lvl = n; break; }
        }
      }

      // fallback adicional: alguns layouts colocam a torre como “0/—” quando não existe.
      // Se não achou lvl, pula (pra não desenhar errado).
      if(lvl>=1 && lvl<=20) towers.push({x,y,lvl});
    }

    // Se não conseguiu extrair (ex: sem PA / tabela diferente), modo manual
    if(!towers.length){
      const sample = '500|500:20 501|501:10';
      const inp = prompt(
        'Não consegui ler seus níveis automaticamente (pode ser falta de PA/visão geral).\n' +
        'Cole coords no formato x|y:nivel (separado por espaço/linha).\n\nEx: ' + sample,
        ''
      );
      if(!inp) return;

      const list = [];
      (inp.match(/\d{1,3}\|\d{1,3}\s*:\s*\d{1,2}/g)||[]).forEach(s=>{
        const m = s.match(/(\d{1,3})\|(\d{1,3})\s*:\s*(\d{1,2})/);
        if(!m) return;
        const x=+m[1], y=+m[2], lvl=+m[3];
        if(lvl>=1 && lvl<=20) list.push({x,y,lvl});
      });
      towers = list;
      if(!towers.length){ alert('Nada válido.'); return; }
    }

    // desenhar
    const ids=[];
    towers.forEach(t=>{
      const r = RANGE[t.lvl] || 0;
      if(!r) return;
      const id = TWMap.map.addCircle(t.x, t.y, r, { color:'rgba(255,0,0,0.22)', lineWidth:1 });
      ids.push(id);
    });

    TWMap.map.render && TWMap.map.render();
    localStorage.setItem(K_ON,'1');
    localStorage.setItem(K_IDS, JSON.stringify(ids));
    alert('Torres: ON\nMarcadas: '+towers.length+'\n(raio por nível)');
  }catch(e){
    alert('Erro: ' + (e && e.message ? e.message : e));
  }
})();
