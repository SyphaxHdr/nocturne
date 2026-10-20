(async () => {
  const NCT = globalThis.NCT;
  const { store, icon: ic } = NCT;
  const app = document.getElementById('app');
  await store.load();
  const draw = () => {
    const s = store.state.settings;
    app.innerHTML = `
      <div class="n-brand"><span class="n-logo">${ic('play', 16)}</span><b>Nocturne</b></div>
      <button class="n-btn primary" data-a="start" style="height:44px;justify-content:center">${ic('play', 16)}Lancer sur X</button>
      <div class="n-srow"><div class="n-sl">Enchaînement auto</div><button class="n-switch ${s.auto ? 'on' : ''}" role="switch" aria-checked="${s.auto}" data-a="auto" aria-label="Enchaînement auto"></button></div>
      <div class="n-srow"><div class="n-sl">Son coupé au départ</div><button class="n-switch ${s.muted ? 'on' : ''}" role="switch" aria-checked="${s.muted}" data-a="muted" aria-label="Son coupé"></button></div>
      <div class="n-btns"><button class="n-btn" data-a="compact">${ic('window', 16)}Fenêtre compacte</button><button class="n-btn" data-a="options">${ic('settings', 16)}Réglages</button></div>
      <p class="n-sub">Raccourci : Alt+Maj+N</p>`;
  };
  app.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a;
    if (a === 'auto' || a === 'muted') store.set({ [a]: !store.state.settings[a] });
    else if (a === 'start') { await NCT.send({ type: 'nct-toggle-active' }); window.close(); }
    else if (a === 'compact') { await NCT.send({ type: 'nct-open-compact' }); window.close(); }
    else if (a === 'options') { await NCT.send({ type: 'nct-options' }); window.close(); }
  });
  store.on(draw);
  draw();
})();
