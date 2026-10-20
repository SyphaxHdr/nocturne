(async () => {
  const NCT = globalThis.NCT;
  const { store, panels: P, icon: ic } = NCT;
  const app = document.getElementById('app');
  await store.load();
  const TABS = [['algo', 'algo', 'Tableau de bord de l\'algo'], ['settings', 'settings', 'Réglages']];
  app.innerHTML = `<nav class="n-optnav"><div class="n-brand"><span class="n-logo">${ic('play', 16)}</span><b>Nocturne</b></div>${TABS.map(([id, icon, label]) => `<button data-t="${id}">${label}</button>`).join('')}</nav>
    <main class="n-optmain"><h2 id="title"></h2><div id="body"></div></main>`;
  const body = document.getElementById('body');
  let mounted = null;
  function show(id) {
    if (mounted) mounted.destroy();
    body.innerHTML = '';
    app.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === id));
    document.getElementById('title').textContent = P.titles[id];
    mounted = P[id](body, {});
    location.hash = id;
  }
  app.querySelector('nav').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) show(b.dataset.t); });
  const h = location.hash.slice(1);
  show(TABS.some((t) => t[0] === h) ? h : 'algo');
})();
