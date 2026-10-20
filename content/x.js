/* Nocturne : lecteur plein écran pour les vidéos de X.
 *
 * Principe : Nocturne ne charge rien lui-même. Il LIT la page de X (les tweets qui contiennent une vidéo), laisse la vraie
 * vidéo de X jouer (c'est elle qui charge et fournit le son) et en recopie les images en plein écran.
 * Pour obtenir d'autres vidéos il fait simplement défiler la page, comme tu le ferais. Il ne touche jamais à l'historique de X.
 * Le classement local (shared/rank.js) décide de l'ordre ; la timeline de X reste la seule source.
 *
 * Sobriété (0.5) : aucune boucle qui tourne pour rien. Le rendu suit les images de la vidéo (requestVideoFrameCallback),
 * les filtres sont mis en cache, rien ne se redessine quand ce n'est pas visible, et la page de X est rechargée
 * proprement de temps en temps (entre deux vidéos) pour que sa mémoire ne gonfle pas pendant des heures.
 */
(() => {
  'use strict';
  const NCT = globalThis.NCT;
  if (!NCT || window.top !== window || window.__nocturne) return;
  window.__nocturne = true;

  const ext = typeof browser !== 'undefined' ? browser : chrome;
  const { store, themes: T, rank: R, channels: C, panels: P, observe: O, icon: ic, esc } = NCT;
  // Le numéro de version dans l'URL de la feuille de style force Firefox à recharger le CSS après une mise à jour (sinon il peut garder l'ancien en cache).
  const CSS_URL = NCT.getURL('shared/ui.css') + '?v=' + encodeURIComponent((ext.runtime.getManifest && ext.runtime.getManifest().version) || '0');
  const FLAG = 'nocturne-autorun';
  const RATES = [0.75, 1, 1.25, 1.5, 2];
  const SET = () => store.state.settings;

  const S = {
    open: false,
    page: null,
    pageM: null,
    resumeAfterPage: false,
    userPaused: false,
    enforceCount: 0,
    ar: 9 / 16,
    idleTimer: null,
    source: 'foryou',
    query: '',
    topics: [],
    variant: 0,
    path: '',
    items: [],
    known: new Set(),
    byId: new Map(),
    skip: new Set(),
    played: new Set(),
    viewed: new Set(),
    hist: [],
    pos: -1,
    token: 0,
    orig: null,
    off: [],
    loading: false,
    deadRun: 0,
    dragging: false,
    soundLocked: false,
    keysOpen: false,
    fs: false,
    tries: 0,
    skipHits: 0,
    toastTimer: null,
    timer: null,
    rev: 0, // change à chaque modification des réglages : invalide le cache des filtres
    yAt: 0,
    box: null, // taille affichée du cadre vidéo (pour ne pas dessiner plus de pixels que nécessaire)
    pagePlays: 0, // vidéos lues depuis le chargement de cette page
    openedAt: 0,
    lagHits: 0,
    needClean: false,
    channel: null, // chaîne thématique en cours (shared/channels.js)
    angle: 0,
    cycle: 0, // nombre d'angles déjà essayés d'affilée sans rien de neuf
    chKey: '',
    show: { words: false, accounts: false }, // listes repliées derrière l'œil
    returnTo: null, // page de tweet ouverte pour revoir une vidéo : où revenir ensuite
    drawer: null, // tweet affiché dans le volet « Discussion »
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmt = (s) => {
    if (!isFinite(s)) return '0:00';
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  let host, shadow;
  const els = {};

  /* ======================= Lecture de la timeline X (lecture seule) ======================= */

  const AI_LABEL = /made with ai|ai[- ]generated|cr[ée]{1,2} (avec|par) (l[’']?)?ia|g[ée]n[ée]r[ée]e? (avec|par) (l[’']?)?ia/i;

  function statusInfo(article) {
    const time = $('time', article);
    const link = time && time.closest('a');
    const href = link && link.getAttribute('href');
    const m = href && href.match(/^\/([^/]+)\/status\/(\d+)/);
    return m ? { handle: m[1], id: m[2], href: '/' + m[1] + '/status/' + m[2] } : null;
  }

  const articles = () => $$('article[data-testid="tweet"]');
  const tweetIds = () => articles().map((a) => (statusInfo(a) || {}).id).filter(Boolean);

  function collect() {
    let added = 0;
    const now = Date.now();
    const updY = now - S.yAt > 2500; // la position des tweets connus n'a pas besoin d'être relue à chaque passage
    if (updY) S.yAt = now;
    for (const article of articles()) {
      const info = statusInfo(article);
      if (!info) continue;
      const prev = S.byId.get(info.id);
      if (prev) { if (updY) prev.y = article.getBoundingClientRect().top + window.scrollY; continue; } // position à jour pour pouvoir y revenir
      if (S.skip.has(info.id)) { S.skipHits++; continue; } // déjà vue avant l'actualisation
      if (S.known.has(info.id)) continue;
      const video = $('video', article);
      if (video ? video.loop : !$('[data-testid="videoPlayer"], [data-testid="videoComponent"]', article)) continue; // pas de vidéo, ou simple GIF
      S.known.add(info.id);
      const nameEl = $('[data-testid="User-Name"] span', article);
      const textEl = $('[data-testid="tweetText"]', article);
      const text = textEl ? textEl.textContent : '';
      const name = nameEl ? nameEl.textContent : info.handle;
      const entry = {
        id: info.id,
        handle: info.handle,
        href: info.href,
        name,
        text,
        lang: (textEl && textEl.getAttribute('lang')) || '',
        poster: (video && video.poster) || '',
        ai: AI_LABEL.test(article.textContent || ''),
        y: article.getBoundingClientRect().top + window.scrollY,
        themes: T.classify(text + ' ' + name),
        regions: T.regions(text + ' ' + name),
        words: T.tokens(text).slice(0, 12),
        norm: T.norm(text + ' ' + name + ' ' + info.handle),
      };
      S.items.push(entry);
      S.byId.set(info.id, entry);
      added++;
    }
    if (added) { prune(); scheduleRails(); }
    return added;
  }

  /* ---- Où l'on est (état de l'interface, exposé sur l'élément de Nocturne pour un éventuel module complémentaire) ---- */

  function sourceTag() {
    const f = new URLSearchParams(location.search).get('f') || '';
    if (S.source === 'channel' && S.channel) return 'chaine:' + S.channel + '/' + S.angle + (f ? ':' + f : '');
    if (S.source === 'search') return 'recherche' + (f ? ':' + f : '');
    return { foryou: 'pourvous', following: 'abonnements' }[S.source] || 'autre';
  }
  function publishState() {
    if (!host) return;
    const ch = chan();
    host.dataset.open = S.open ? '1' : '0';
    host.dataset.source = sourceTag();
    host.dataset.sourceLabel = ch ? ch.label : { foryou: 'Pour vous', following: 'Abonnements', search: 'Recherche' }[S.source] || '';
    const it = cur();
    if (it) host.dataset.current = it.id; else delete host.dataset.current;
  }

  // Garde-fou mémoire : au-delà de 900 vidéos connues, on oublie les plus anciennes déjà vues ou écartées.
  function prune() {
    if (S.items.length <= 900) return;
    const keep = new Set(S.hist.map((x) => x.id));
    let drop = S.items.length - 700;
    S.items = S.items.filter((it) => {
      if (drop > 0 && !keep.has(it.id) && (S.played.has(it.id) || it.dead || why(it))) { drop--; S.byId.delete(it.id); return false; }
      return true;
    });
  }

  const findArticle = (item) => articles().find((a) => { const i = statusInfo(a); return i && i.id === item.id; }) || null;

  // X retire de la page les tweets hors écran : pour en retrouver un, on remonte à peu près à sa place.
  async function locate(item, token) {
    let a = findArticle(item);
    if (a || item.remote || !isFinite(item.y)) return a;
    const H = window.innerHeight;
    for (const off of [0, -0.8, 0.8, -1.6, 1.6, -2.4]) {
      window.scrollTo(0, Math.max(0, item.y - H / 2 + off * H));
      for (let t = 0; t < 5; t++) {
        await sleep(150);
        if (token !== S.token) return null;
        a = findArticle(item);
        if (a) return a;
      }
    }
    return null;
  }

  function resetFeed() {
    S.items = []; S.known = new Set(); S.byId = new Map(); S.played = new Set(); S.hist = []; S.pos = -1; S.deadRun = 0;
    S.token++;
  }

  function detectSource() {
    if (location.pathname.startsWith('/search')) {
      S.source = S.channel && S.chKey === location.search ? 'channel' : 'search';
      S.query = new URLSearchParams(location.search).get('q') || '';
    } else if (location.pathname === '/home') {
      if (S.source === 'search' || S.source === 'other' || S.source === 'channel') S.source = 'foryou';
    } else S.source = 'other';
  }

  const chan = () => (S.source === 'channel' ? C.get(S.channel) : null);

  async function selectHomeTab(which, wait = 8000) {
    const t0 = Date.now();
    let tabs = [];
    while (Date.now() - t0 < wait) {
      tabs = $$('[data-testid="primaryColumn"] [role="tab"]');
      if (tabs.length >= 2) break;
      await sleep(300);
    }
    const tab = tabs[which === 'following' ? 1 : 0];
    if (!tab) return false;
    if (tab.getAttribute('aria-selected') !== 'true') { tab.click(); await sleep(1200); }
    return true;
  }

  /* ======================= Sélection des vidéos ======================= */

  const rankCtx = () => ({ settings: SET(), shares: R.measured(store.state.profile.views).shares, feedback: store.state.feedback });

  // Raison du filtrage d'une vidéo, calculée une seule fois tant que les réglages ne changent pas.
  function why(it) {
    if (it._rv !== S.rev) { it._r = R.reason(it, SET()); it._rv = S.rev; }
    return it._r;
  }

  const pool = () => S.items.filter((it) => !S.played.has(it.id) && !it.dead && !why(it));

  // Les candidates : de préférence celles que X affiche en ce moment (donc proches de l'écran), sinon toutes.
  function windowCands(n = 12) {
    const p = pool();
    const mounted = new Set(tweetIds());
    const near = p.filter((i) => mounted.has(i.id));
    return (near.length ? near : p).slice(0, n);
  }

  // Bilan du filtrage : combien de vidéos X a fournies, combien sont écartées et pourquoi.
  function funnel() {
    const c = { ai: 0, lang: 0, region: 0, word: 0, account: 0, theme: 0 };
    for (const it of S.items) { const r = why(it); if (r) c[r]++; }
    return { total: S.items.length, c, left: pool().length, seen: S.played.size, cut: Object.values(c).reduce((a, b) => a + b, 0) };
  }

  // Fait défiler la vraie page pour que X affiche d'autres tweets. Ne se fait qu'entre deux vidéos.
  function scrollForMore(idle) {
    const arts = articles();
    const last = arts[arts.length - 1];
    if (idle % 2 === 1) window.scrollBy(0, -260); // petit retour pour relancer le chargement de X
    else if (last && idle < 4) last.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, document.documentElement.scrollHeight);
  }

  // Un seul « chargeur » à la fois : si plusieurs demandes arrivent (touches rapides, molette, plein écran), elles attendent le même.
  let feeder = null;
  function fill(want) {
    if (feeder) return feeder;
    feeder = (async () => {
      const t0 = Date.now();
      let idle = 0;
      try {
        for (;;) {
          collect();
          const n = pool().length;
          if (!S.open || n >= want) return;
          if (Date.now() - t0 > (n ? 2500 : S.items.length ? 15000 : 30000)) return;
          const before = S.items.length;
          scrollForMore(idle);
          for (let i = 0; i < 5; i++) { await sleep(250); collect(); if (S.items.length > before) break; }
          idle = S.items.length > before ? 0 : idle + 1;
          if (!n) busy('Recherche de vidéos… ' + S.items.length + ' trouvées');
          if (idle >= 14 && !n) return; // fin du fil
        }
      } finally { feeder = null; scheduleRails(); }
    })();
    return feeder;
  }

  // Attend que X affiche au moins un tweet vidéo (chargement d'une page).
  async function waitForVideos(maxMs) {
    const t0 = Date.now();
    let n = 0;
    while (Date.now() - t0 < maxMs) {
      if (!S.open) return false;
      collect();
      if (S.items.length || S.skipHits) return true; // la page est chargée (même si tout a déjà été vu : la suite défilera)
      if (Date.now() - t0 > 2000 && $('[data-testid="emptyState"]')) return false; // X dit lui-même qu'il n'y a rien
      if (++n % 6 === 0 && articles().length) window.scrollBy(0, window.innerHeight * 0.9);
      await sleep(400);
    }
    return false;
  }

  /* ======================= Lecture ======================= */

  const cur = () => S.hist[S.pos] || null;

  function dropCurrent() {
    if (S.pos >= 0 && S.hist[S.pos]) { S.hist.splice(S.pos, 1); S.pos--; }
  }

  async function goNext() {
    unlockSound();
    stopRetry();
    if (S.pos < S.hist.length - 1) return playAt(S.pos + 1);
    if (S.returnTo) return returnToFeed(); // on était sur la page d'un tweet : retour au flux pour la suite
    if (needsClean()) return cleanReload();
    const token = ++S.token;
    detach();
    clearState();
    busy('Chargement…');
    const want = S.hist.length ? 3 : 1;
    if (pool().length < want) { await fill(want); if (token !== S.token) return; }
    const item = R.pick(windowCands(12), rankCtx());
    if (!item) return noMore();
    S.hist.push(item);
    S.pos = S.hist.length - 1;
    await playItem(item, token);
  }

  // Ce qu'il faut refaire après un rechargement de page (l'overlay se rouvre tout de suite, au même endroit).
  const seenList = () => Array.from(new Set([...S.skip, ...S.played])).slice(-1500);
  // L'historique (40 dernières vidéos) traverse les rechargements : « précédente » marche encore après un nettoyage.
  const KEEP = ['id', 'handle', 'href', 'name', 'text', 'lang', 'poster', 'ai', 'themes', 'regions', 'words', 'norm'];
  const histOut = () => {
    const from = Math.max(0, S.hist.length - 40);
    return { hist: S.hist.slice(from).map((it) => Object.fromEntries(KEEP.map((k) => [k, it[k]]))), pos: Math.min(S.pos, S.hist.length - 1) - from };
  };
  const payload = (extra) => ({ open: true, source: S.source, topics: S.topics, variant: S.variant, channel: S.channel, angle: S.angle, cycle: S.cycle, seen: seenList(), tries: S.tries, returnTo: S.returnTo, ...histOut(), ...extra });

  // Revoir une vidéo qui n'est plus sur la page : on ouvre la page du tweet (où X la montre), puis on revient au flux.
  function openStatus(item) {
    stopRetry();
    S.token++;
    detach();
    busy('Retour à une vidéo précédente…');
    go('https://x.com' + item.href, payload({ mode: 'status', returnTo: S.returnTo || location.href }));
  }
  function returnToFeed() {
    const url = S.returnTo;
    stopRetry();
    S.token++;
    detach();
    busy('Retour au flux…');
    go(url, payload({ mode: null, returnTo: null, pos: S.hist.length - 1 }));
  }

  // Entretien : X garde en mémoire tout ce qui a défilé. Après une longue session (ou si la page rame), on recharge la page
  // entre deux vidéos. Les vidéos déjà vues sont gardées : rien n'est rejoué.
  const CLEAN = { plays: 120, items: 600, minutes: 45 };
  function needsClean() {
    if (S.needClean || S.pagePlays >= CLEAN.plays || S.items.length >= CLEAN.items) return true;
    return !!S.openedAt && Date.now() - S.openedAt > CLEAN.minutes * 60000 && S.pagePlays >= 20;
  }
  function cleanReload() {
    stopRetry();
    S.token++;
    detach();
    clearState();
    busy('Nettoyage de la mémoire de X…');
    go(location.href, payload({ tries: 0, clean: true }));
  }

  // Plus rien à lire. Dans une chaîne, on passe d'abord à l'angle suivant. Sinon Nocturne réessaie tout seul avec des pauses
  // de plus en plus longues (20 s, 40 s, 80 s, 160 s), puis s'arrête : il ne recharge pas X indéfiniment.
  let retryTimer = null;
  const RETRY = [20, 40, 80, 160];
  function stopRetry() { clearTimeout(retryTimer); retryTimer = null; }
  function noMore() {
    stopRetry();
    const ch = chan();
    if (ch && S.cycle < ch.angles.length - 1) {
      const next = (S.angle + 1) % ch.angles.length;
      showEmpty(0, 'Plus rien de neuf ici. Passage à « ' + C.angle(S.channel, next).label + ' »…');
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (!S.open) return;
        if (S.page) return noMore();
        launchChannel(S.channel, next, S.cycle + 1);
      }, 2500);
      return;
    }
    if (S.tries >= RETRY.length) return showEmpty(-1);
    const delay = RETRY[S.tries];
    showEmpty(delay);
    retryTimer = setTimeout(function fire() {
      retryTimer = null;
      if (!S.open) return;
      if (S.page || S.orig) return noMore(); // un panneau est ouvert : on repart plus tard
      if (document.hidden) { retryTimer = setTimeout(fire, 5000); return; } // onglet caché : on attend qu'il revienne
      softRefresh(true);
    }, delay * 1000);
  }

  // Vraie actualisation : on essaie d'abord de faire rafraîchir le fil par X (clic sur Accueil) ; si rien de nouveau n'arrive
  // (X resert souvent le même fil tant que la page n'est pas rechargée), on recharge la page. La liste des vidéos déjà vues
  // est conservée, donc rien n'est rejoué.
  async function softRefresh(auto) {
    stopRetry();
    if (!auto) S.tries = 0; // actualisation demandée par toi : le compteur d'essais repart de zéro
    if (S.pos < S.hist.length - 1) S.pos = S.hist.length - 1;
    const token = ++S.token;
    detach();
    clearState();
    busy('Actualisation…');
    const reload = () => go(location.href, payload({ tries: S.tries + 1 }));
    if (location.pathname !== '/home') return reload();
    window.scrollTo(0, 0);
    const home = $('a[data-testid="AppTabBar_Home_Link"]') || $('[data-testid="primaryColumn"] [role="tab"][aria-selected="true"]');
    if (home) home.click();
    for (let t = 0; t < 8; t++) {
      await sleep(500);
      if (token !== S.token || !S.open) return;
      collect();
      if (pool().length) break;
    }
    if (!pool().length) return reload();
    goNext();
  }

  function goPrev() {
    unlockSound();
    if (S.pos > 0) playAt(S.pos - 1);
  }

  async function playAt(pos) {
    stopRetry();
    S.pos = pos;
    const token = ++S.token;
    detach();
    await playItem(S.hist[pos], token, true);
  }

  function jumpTo(item) {
    S.hist = S.hist.slice(0, S.pos + 1);
    S.hist.push(item);
    return playAt(S.hist.length - 1);
  }

  async function playItem(item, token, replay) {
    S.played.add(item.id);
    fillInfo(item);
    clearState();
    busy('Chargement…');
    const article = await locate(item, token);
    if (token !== S.token) return;
    if (article) article.scrollIntoView({ block: 'center' });
    // X ne monte parfois le <video> qu'une fois le tweet à l'écran.
    let video = article && $('video', article);
    for (let t = 0; t < 14 && article && !video; t++) {
      await sleep(200);
      if (token !== S.token) return;
      const a = findArticle(item);
      video = a && $('video', a);
    }
    const elsewhere = !article && replay && item.href && location.pathname !== item.href; // plus sur cette page : on va la chercher
    if (elsewhere && item.remote) return openStatus(item);
    if (!video || video.loop) {
      if (elsewhere && !S.returnTo) return openStatus(item);
      item.dead = true;
      dropCurrent();
      if (replay) toast('Cette vidéo n\'est plus disponible sur la page.');
      if (++S.deadRun > 10) { S.deadRun = 0; return noMore(); }
      return goNext();
    }
    S.deadRun = 0;
    await attach(video, item, token);
  }

  function waitMeta(video) {
    return new Promise((resolve) => {
      if (video.readyState >= 1 && isFinite(video.duration)) return resolve();
      const done = () => { video.removeEventListener('loadedmetadata', done); clearTimeout(t); resolve(); };
      const t = setTimeout(done, 3000);
      video.addEventListener('loadedmetadata', done);
    });
  }

  async function tryPlay(video) {
    try { await video.play(); return true; } catch (_) {
      // Lecture refusée (pas de geste utilisateur) : on démarre muet et on réactivera le son au premier clic.
      video.muted = true;
      S.soundLocked = true;
      try { await video.play(); } catch (__) {}
      toast('Appuie sur une touche ou clique pour activer le son.');
      return false;
    }
  }

  function unlockSound() {
    if (!S.soundLocked) return;
    S.soundLocked = false;
    if (S.orig) S.orig.muted = SET().muted;
  }

  function listen(el, type, fn) {
    el.addEventListener(type, fn);
    S.off.push(() => el.removeEventListener(type, fn));
  }

  function detach() {
    S.off.forEach((f) => f());
    S.off = [];
    if (S.orig) { try { S.orig.pause(); } catch (_) {} }
    S.orig = null;
    stopRender();
    restoreSize();
    els.fill.style.width = '0';
    els.thumb.style.left = '0';
    els.next.textContent = '';
    els.time.textContent = '';
    els.paused.classList.remove('show');
  }

  // Affichage : on recopie chaque image de la vraie vidéo de X dans un canvas. Contrairement à captureStream, ça ne peut pas
  // « perdre » l'image quand X change la source de sa vidéo (cas où on entendait le son sans voir l'image).
  // Sobriété : on dessine une fois par image réellement décodée (requestVideoFrameCallback, ~30 fois/s) et jamais plus de
  // pixels que ce que le cadre affiche. Rien n'est dessiné quand la vidéo est en pause ou l'onglet caché.
  let stopRenderFn = null;
  function stopRender() {
    if (stopRenderFn) stopRenderFn();
    stopRenderFn = null;
    const c = els.video;
    c.width = 16; c.height = 9; // vider le canvas : jamais l'image de la vidéo précédente
  }

  function startRender(video) {
    stopRender();
    const c = els.video;
    const ctx = c.getContext('2d', { alpha: false });
    let on = true, lastT = -1, shown = false, handle = 0, vw0 = 0, vh0 = 0, lastDraw = performance.now();
    let vfc = typeof video.requestVideoFrameCallback === 'function';
    const fit = () => {
      const vw = video.videoWidth, vh = video.videoHeight;
      const dpr = window.devicePixelRatio || 1;
      const k = S.box && S.box[0] > 0 ? Math.min(1, (S.box[0] * dpr) / vw, (S.box[1] * dpr) / vh) : 1;
      const w = Math.max(2, Math.round(vw * k)), h = Math.max(2, Math.round(vh * k));
      if (Math.abs(c.width - w) > 1 || Math.abs(c.height - h) > 1) {
        c.width = w; c.height = h; lastT = -1;
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      }
    };
    const draw = () => {
      if (!on) return;
      if (video.readyState >= 2 && video.videoWidth && !document.hidden) {
        if (video.videoWidth !== vw0 || video.videoHeight !== vh0) { vw0 = video.videoWidth; vh0 = video.videoHeight; setAr(vw0, vh0); }
        fit();
        const t = video.currentTime;
        if (vfc || t !== lastT) {
          lastT = t;
          try { ctx.drawImage(video, 0, 0, c.width, c.height); lastDraw = performance.now(); if (!shown) { shown = true; clearBusy(); } } catch (_) {}
        }
      }
      next();
    };
    const next = () => { if (on) handle = vfc ? video.requestVideoFrameCallback(draw) : requestAnimationFrame(draw); };
    // Filet de sécurité : si le navigateur ne signale plus d'images alors que la vidéo avance, on repasse au rythme de l'écran.
    const check = () => {
      if (!on || !vfc || video.paused || document.hidden || video.readyState < 2) return;
      if (performance.now() - lastDraw > 1000) { try { video.cancelVideoFrameCallback(handle); } catch (_) {} vfc = false; lastT = -1; next(); }
    };
    video.addEventListener('timeupdate', check);
    stopRenderFn = () => {
      on = false;
      video.removeEventListener('timeupdate', check);
      try { if (vfc) video.cancelVideoFrameCallback(handle); else cancelAnimationFrame(handle); } catch (_) {}
    };
    draw(); // première image tout de suite (même en pause), puis au rythme de la vidéo
  }

  // Netteté : X choisit la qualité de la vidéo selon la taille de son lecteur dans le fil. On agrandit donc (sans rien déplacer)
  // la balise <video> de X, cachée derrière Nocturne, pour qu'il envoie une meilleure définition.
  let restoreFn = null;
  function restoreSize() { if (restoreFn) restoreFn(); restoreFn = null; }
  function enlarge(video) {
    restoreSize();
    try {
      if (getComputedStyle(video).position !== 'absolute') return; // seulement si ça ne peut pas décaler la page
      const keys = ['width', 'height', 'max-width', 'max-height'];
      const prev = keys.map((k) => [k, video.style.getPropertyValue(k), video.style.getPropertyPriority(k)]);
      restoreFn = () => prev.forEach(([k, v, pr]) => (v ? video.style.setProperty(k, v, pr) : video.style.removeProperty(k)));
      const w = 1280, h = Math.round(w / (S.ar || 16 / 9));
      video.style.setProperty('width', w + 'px', 'important');
      video.style.setProperty('height', h + 'px', 'important');
      video.style.setProperty('max-width', 'none', 'important');
      video.style.setProperty('max-height', 'none', 'important');
    } catch (_) {}
  }

  async function attach(video, item, token) {
    const st = SET();
    S.orig = video;
    video.muted = st.muted;
    video.volume = st.volume;
    video.playbackRate = st.rate;
    try { video.currentTime = 0; } catch (_) {}
    startRender(video); // l'image s'affiche dès qu'elle existe, en même temps que le son
    await tryPlay(video);
    if (token !== S.token) return;
    await waitMeta(video);
    if (token !== S.token) return;

    const d = video.duration;
    const maxD = chan() && chan().long ? 0 : st.maxDuration; // documentaires, conférences : pas de limite de durée
    if (maxD > 0 && isFinite(d) && d > maxD) {
      dropCurrent();
      return goNext(); // trop longue pour tes réglages
    }
    S.tries = 0;
    S.cycle = 0;
    S.pagePlays++;
    setAr(video.videoWidth, video.videoHeight);
    enlarge(video);
    if (video.readyState >= 3 && !video.paused) clearState();
    refreshAudioUi();
    refreshLikeState();
    recordView(item);

    S.userPaused = false;
    let prevT = 0, resumes = 0;
    listen(video, 'volumechange', () => { if (++S.enforceCount < 30) setTimeout(enforceAudio, 0); });
    listen(video, 'playing', () => { enforceAudio(); clearBusy(); });
    listen(video, 'waiting', () => busy('Mise en mémoire…'));
    listen(video, 'play', () => { if (S.page) { try { video.pause(); } catch (_) {} } });
    const advance = () => {
      if (token !== S.token) return;
      if (S.drawer === item.id) { try { video.currentTime = 0; video.play().catch(() => {}); } catch (_) {} return; } // tu lis la discussion : la vidéo boucle
      if (SET().auto) goNext();
    };
    listen(video, 'ended', advance);
    listen(video, 'timeupdate', () => {
      updateProgress();
      const dd = video.duration, c = video.currentTime;
      const looped = isFinite(dd) && dd > 0 && prevT > dd * 0.8 && c < prevT - dd * 0.5; // X relance parfois la vidéo en boucle
      prevT = c;
      if (isFinite(dd) && (dd - c < 0.12 || looped)) advance();
    });
    listen(video, 'pause', () => {
      els.paused.classList.toggle('show', !video.ended && video.paused);
      // X met parfois ses vidéos en pause tout seul : on reprend, sauf si c'est toi qui as mis en pause.
      if (!S.userPaused && !S.page && !video.ended && S.open && resumes < 4) {
        resumes++;
        setTimeout(() => { if (token === S.token && !S.userPaused && !S.page && video.paused && !video.ended) video.play().catch(() => {}); }, 200);
      }
    });
    listen(video, 'play', () => els.paused.classList.remove('show'));
    listen(video, 'ratechange', () => { if (S.orig === video && video.playbackRate !== SET().rate) video.playbackRate = SET().rate; });
    updateProgress();
    if (!video.paused && video.readyState >= 3) clearBusy();
  }

  // X réapplique parfois son propre état muet / volume sur ses vidéos : on remet celui que tu as choisi.
  function enforceAudio() {
    const v = S.orig;
    if (!v || S.soundLocked || S.page || !S.open) return;
    const s = SET();
    if (v.muted !== s.muted) v.muted = s.muted;
    if (Math.abs(v.volume - s.volume) > 0.01) v.volume = s.volume;
  }

  // Une seule minuterie lente (1,5 s) : lecture de la page, son, reprise après une pause imposée par X, et surveillance
  // des ralentissements (si la page rame plusieurs fois de suite, on la recharge proprement à la vidéo suivante).
  let tickLast = 0;
  function tick() {
    const now = performance.now();
    const lag = tickLast ? now - tickLast - 1500 : 0;
    tickLast = now;
    if (!S.open || document.hidden) return;
    if (lag > 1200) { if (++S.lagHits >= 3) S.needClean = true; }
    else if (S.lagHits > 0 && lag < 200) S.lagHits = Math.max(0, S.lagHits - 0.25);
    if (!S.page) collect();
    guard();
  }
  // Un panneau est ouvert : toute vidéo de X qui démarre derrière est remise en pause aussitôt (sans surveiller en boucle).
  function onPlayCapture(e) {
    const v = e.target;
    if (S.open && S.page && v && v.tagName === 'VIDEO' && !(host && host.contains(v))) { try { v.pause(); } catch (_) {} }
  }
  function startTimers() {
    stopTimers();
    tickLast = 0;
    S.timer = setInterval(tick, 1500);
    document.addEventListener('play', onPlayCapture, true);
  }
  function stopTimers() {
    clearInterval(S.timer);
    S.timer = null;
    document.removeEventListener('play', onPlayCapture, true);
  }

  function guard() {
    if (!S.open) return;
    S.enforceCount = 0;
    if (S.page) { // un panneau est ouvert : aucune vidéo ne doit jouer derrière
      $$('video').forEach((v) => { if (!v.paused && !v.closest('#nocturne-host')) { try { v.pause(); } catch (_) {} } });
      return;
    }
    enforceAudio();
    const v = S.orig;
    if (v && !S.userPaused && v.paused && !v.ended && v.readyState >= 2) v.play().catch(() => {});
  }

  function recordView(item) {
    if (S.viewed.has(item.id)) return;
    S.viewed.add(item.id);
    store.addView({ id: item.id, handle: item.handle, themes: item.themes, words: item.words, t: Date.now() });
  }

  function seekBy(sec) {
    const v = S.orig;
    if (!v || !isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration - 0.2, v.currentTime + sec));
    updateProgress();
  }
  function seekToPct(p) {
    const v = S.orig;
    if (v && isFinite(v.duration)) { v.currentTime = v.duration * p; updateProgress(); }
  }

  function setVolume(vol) {
    vol = Math.max(0, Math.min(1, vol));
    store.set({ volume: vol, muted: vol === 0 });
  }

  /* ======================= Actions ======================= */

  function currentArticle() { const it = cur(); return it ? findArticle(it) : null; }

  function refreshLikeState() {
    setTimeout(() => {
      const a = currentArticle();
      els.like.classList.toggle('on', !!(a && $('[data-testid="unlike"]', a)));
      els.repost.classList.toggle('on', !!(a && $('[data-testid="unretweet"]', a)));
    }, 300);
  }

  function refreshAudioUi() {
    const s = SET();
    els.mute.innerHTML = ic(s.muted || s.volume === 0 ? 'mute' : 'sound', 18);
    const v = s.muted ? 0 : Math.round(s.volume * 100);
    els.vol.value = String(v);
    els.vol.style.setProperty('--p', v + '%');
    els.rate.textContent = String(s.rate).replace('.', ',') + '×';
    if (S.orig && !S.soundLocked) { S.orig.muted = s.muted; S.orig.volume = s.volume; S.orig.playbackRate = s.rate; }
  }

  // Navigation vraie (rechargement de page) : on mémorise ce qu'il faut refaire à l'arrivée, l'overlay se rouvre tout de suite.
  function go(url, payload) {
    try { sessionStorage.setItem(FLAG, JSON.stringify(payload)); } catch (_) {}
    location.assign(url);
  }

  function searchVariant(list, variant) {
    const st = SET();
    return [
      [R.buildSearchQuery(list, st), 'live'],
      [R.buildSearchQuery(list, st, { video: false }), 'video'],
      [R.buildSearchQuery(list, st, { video: false }), 'top'],
    ][variant];
  }

  function launchSearch(topics, variant = 0) {
    const list = topics.map((t) => t.trim()).filter(Boolean);
    if (!list.length) return;
    if (!variant) list.forEach((t) => store.addRecent(t));
    closePage(true);
    stopRetry();
    S.token++;
    detach();
    const [q, f] = searchVariant(list, variant);
    busy(variant ? 'Autre recherche sur X…' : 'Recherche sur X…');
    go(R.searchUrl(q, f), payload({ source: 'search', topics: list, variant, channel: null, angle: 0, cycle: 0, tries: 0 }));
  }

  // Chaîne thématique : une recherche X préparée (voir shared/channels.js). i = angle, cycle = angles déjà essayés d'affilée.
  function launchChannel(id, i = 0, cycle = 0) {
    const ch = C.get(id);
    if (!ch) return;
    const n = ch.angles.length;
    i = ((i % n) + n) % n;
    const a = ch.angles[i];
    closePage(true);
    stopRetry();
    S.token++;
    detach();
    busy(ch.label + ' · ' + a.label + '…');
    go(R.searchUrl(a.q, a.f), payload({ source: 'channel', channel: id, angle: i, cycle, topics: [], variant: 0, tries: 0 }));
  }

  async function setSource(src) {
    if (src === 'search') return openPage('search');
    if (src === 'channels') return openPage('channels');
    closePage(true);
    stopRetry();
    S.channel = null;
    S.source = src;
    resetFeed();
    detach();
    renderTop();
    busy('Chargement…');
    if (location.pathname !== '/home') {
      // On clique sur le vrai bouton Accueil de X (son propre routeur) ; sinon, vraie navigation.
      const link = $('a[data-testid="AppTabBar_Home_Link"]');
      if (link) {
        link.click();
        for (let t = 0; t < 12 && location.pathname !== '/home'; t++) await sleep(300);
      }
      if (location.pathname !== '/home') return go('https://x.com/home', { open: true, source: src });
    }
    S.path = '/home';
    await selectHomeTab(src);
    window.scrollTo(0, 0);
    if (await waitForVideos(15000)) goNext(); else showEmpty();
  }

  const toggleKey = (k) => store.set({ [k]: !SET()[k] });

  const ACT = {
    'open-overlay': () => openOverlay(),
    close: () => closeOverlay(),
    next: () => goNext(),
    prev: () => goPrev(),
    pause() {
      unlockSound();
      const v = S.orig;
      if (!v) return;
      if (v.paused) { S.userPaused = false; v.play().catch(() => {}); } else { S.userPaused = true; v.pause(); }
    },
    mute() {
      unlockSound();
      const s = SET();
      if (s.muted || s.volume === 0) store.set({ muted: false, volume: s.volume === 0 ? 0.5 : s.volume });
      else store.set({ muted: true });
    },
    rate() { const i = RATES.indexOf(SET().rate); store.set({ rate: RATES[(i + 1) % RATES.length] }); },
    auto() { toggleKey('auto'); },
    like() {
      const a = currentArticle();
      const b = a && $('[data-testid="like"], [data-testid="unlike"]', a);
      if (b) { b.click(); refreshLikeState(); }
    },
    // Un appui reposte, un deuxième retire le repost. On vérifie ensuite sur X que c'est bien fait.
    async repost() {
      const a = currentArticle();
      const b = a && $('[data-testid="retweet"], [data-testid="unretweet"]', a);
      if (!b) return toast('Bouton Reposter introuvable sur ce tweet.');
      const was = b.getAttribute('data-testid') === 'unretweet';
      b.click();
      let ok = null;
      for (let t = 0; t < 8 && !ok; t++) { await sleep(120); ok = $('[data-testid="retweetConfirm"], [data-testid="unretweetConfirm"]'); }
      if (ok) ok.click();
      await sleep(700);
      const a2 = currentArticle();
      const now = !!(a2 && $('[data-testid="unretweet"]', a2));
      refreshLikeState();
      toast(now === was ? 'X n\'a pas confirmé : réessaie.' : now ? 'Reposté sur X.' : 'Repost retiré.');
    },
    thread: () => toggleDrawer(),
    drawerclose: () => closeDrawer(),
    translate: () => translate(),
    mark: () => mark(),
    analyse: () => NCT.send({ type: 'nct-companion', cmd: 'open' }).catch(() => {}),
    fullscreen: () => toggleFullscreen(),
    region(t) { const s = SET(); const v = t.dataset.v; store.set({ regions: s.regions.includes(v) ? s.regions.filter((x) => x !== v) : [...s.regions, v] }); },
    regionMode(t) { store.set({ regionMode: t.dataset.v }); },
    tog(t) { toggleKey(t.dataset.v); },
    langs() {
      const s = SET();
      if (s.languages.length) store.set({ languagesSaved: s.languages, languages: [] });
      else store.set({ languages: s.languagesSaved && s.languagesSaved.length ? s.languagesSaved : ['fr', 'en'] });
    },
    dur() {
      const D = R.DURATIONS;
      const i = D.indexOf(SET().maxDuration);
      store.set({ maxDuration: D[(i + 1) % D.length] });
    },
    relax(t) {
      const k = t.dataset.v;
      if (k === 'ai') store.set({ blockAI: false });
      else if (k === 'lang') store.set({ languages: [] });
      else if (k === 'region') store.set({ regions: [] });
      else if (k === 'theme') return openPage('algo');
      else return openPage('settings');
      if (!cur() || !S.orig) goNext();
    },
    open() { const it = cur(); if (it) window.open('https://x.com' + it.href, '_blank', 'noopener'); },
    profile() { const it = cur(); if (it) window.open('https://x.com/' + it.handle, '_blank', 'noopener'); },
    hide() {
      const it = cur();
      if (!it) return;
      const h = it.handle.toLowerCase();
      store.set({ hiddenAccounts: [...new Set([...SET().hiddenAccounts, h])] });
      // on retire ses vidéos de l'historique pour qu'elles ne reviennent pas avec « précédente »
      const before = S.hist.slice(0, S.pos).filter((x) => x.handle.toLowerCase() !== h).length;
      S.hist = S.hist.filter((x) => x.handle.toLowerCase() !== h);
      S.pos = before - 1;
      toast('@' + it.handle + ' est masqué.', { label: 'Annuler', a: 'unhide', v: h });
      goNext();
    },
    unhide(t) { const h = t.dataset.v; store.set({ hiddenAccounts: SET().hiddenAccounts.filter((x) => x !== h) }); toast('@' + h + ' est de nouveau visible.'); },
    refresh() { softRefresh(); },
    compact() { NCT.send({ type: 'nct-open-compact' }); },
    src(t) { setSource(t.dataset.v); },
    page(t) { openPage(t.dataset.v); },
    back() { closePage(); },
    topic(t) { launchSearch([t.dataset.v]); },
    playid(t) { const it = S.items.find((i) => i.id === t.dataset.v); if (it) jumpTo(it); },
    rmTopic(t) { store.set({ topics: SET().topics.filter((x) => x !== t.dataset.v) }); },
    rmBlock(t) { store.set({ blockWords: SET().blockWords.filter((x) => x !== t.dataset.v) }); },
    channel(t) { const id = t.dataset.v; if (!(S.source === 'channel' && S.channel === id)) launchChannel(id, 0); },
    angle(t) { if (S.channel) launchChannel(S.channel, Number(t.dataset.v)); },
    eye(t) { const k = t.dataset.v; S.show[k] = !S.show[k]; renderRails(true); },
    keys() { S.keysOpen = !S.keysOpen; renderRails(true); },
    toastclose() { hideToast(); },
  };

  /* ======================= Discussion, traduction, marquage ======================= */

  const metricLine = (m) => (m ? [['views', 'vues'], ['likes', 'j\'aime'], ['reposts', 'reposts'], ['replies', 'réponses'], ['bookmarks', 'signets']]
    .filter(([k]) => m[k] != null).map(([k, l]) => `<span><b>${Number(m[k]).toLocaleString('fr-FR')}</b> ${l}</span>`).join('') : '');
  const tweetCard = (o, cls = '', depth = 0) => `<article class="n-tw ${cls}" style="--d:${depth}"><header><b>${esc(o.name || o.handle)}</b> <span>@${esc(o.handle)}${o.ago ? ' · ' + esc(o.ago) : ''}</span></header>
      <p>${esc(o.text || '')}</p>${o.metrics ? `<div class="n-twm">${metricLine(o.metrics)}</div>` : ''}</article>`;

  function closeDrawer() { S.drawer = null; els.overlay.classList.remove('drawer'); els.drawer.innerHTML = ''; fitFrame(); }
  async function toggleDrawer() {
    const it = cur();
    if (!it) return;
    if (S.drawer === it.id) return closeDrawer();
    S.drawer = it.id;
    els.overlay.classList.add('drawer');
    fitFrame();
    const base = 'https://x.com/' + it.handle + '/status/' + it.id;
    const head = `<header class="n-dhead"><div class="n-label">${ic('bubble', 13)}Discussion</div><button class="n-tbtn icon" data-a="drawerclose" aria-label="Fermer la discussion">${ic('close', 18)}</button></header>
      <div class="n-dlinks"><a href="${base}" target="_blank" rel="noopener">Ouvrir sur X</a><a href="${base}/quotes" target="_blank" rel="noopener">Citations</a><a href="${base}/retweets" target="_blank" rel="noopener">Reposts</a></div>`;
    els.drawer.innerHTML = head + `<div class="n-dbody"><div class="n-busy"><i></i><span>Lecture de la discussion sur X…</span></div><p class="n-sub">Une petite fenêtre X s'ouvre quelques secondes puis se ferme.</p></div>`;
    const r = await NCT.send({ type: 'nct-thread', handle: it.handle, id: it.id }).catch((e) => ({ ok: false, error: e.message }));
    if (S.drawer !== it.id) return;
    const d = r && r.ok && r.data;
    if (!d || d.error) { els.drawer.innerHTML = head + `<div class="n-dbody"><p class="n-error">Discussion illisible : ${esc((d && d.error) || (r && r.error) || 'pas de réponse')}</p></div>`; return; }
    const mainH = (d.main ? d.main.handle : it.handle).toLowerCase();
    let prev = null, depth = 0;
    const replies = (d.replies || []).map((o) => {
      const nested = prev && (o.replyTo || []).includes(prev.handle.toLowerCase()) && prev.handle.toLowerCase() !== mainH;
      depth = nested ? Math.min(depth + 1, 3) : 0;
      prev = o;
      return tweetCard(o, depth ? 'nested' : '', depth);
    }).join('');
    els.drawer.innerHTML = head + `<div class="n-dbody">
      ${(d.before || []).map((o) => tweetCard(o, 'ctx')).join('')}
      ${d.main ? tweetCard(d.main, 'main') : ''}
      <div class="n-label">${(d.replies || []).length} réponse${(d.replies || []).length > 1 ? 's' : ''} lue${(d.replies || []).length > 1 ? 's' : ''}</div>
      ${replies || '<p class="n-sub">Pas de réponse visible.</p>'}</div>`;
  }

  // Traduction : on clique sur le bouton « Traduire » de X dans le tweet et on affiche ce que X renvoie.
  async function translate() {
    const it = cur();
    const a = it && findArticle(it);
    if (!a) return toast('Le tweet n\'est plus sur la page.');
    const RX = /^(traduire|translate|voir la traduction|afficher la traduction|show translation)/i;
    const btn = $$('[role="button"], button', a).find((b) => RX.test((b.textContent || '').trim()) && (b.textContent || '').length < 50);
    if (!btn) return toast('X ne propose pas de traduction pour ce post (déjà dans ta langue ?).');
    const before = a.textContent || '';
    btn.click();
    for (let t = 0; t < 20; t++) {
      await sleep(250);
      const a2 = findArticle(it);
      if (!a2 || cur() !== it) return;
      if ((a2.textContent || '') === before) continue;
      // le texte traduit apparaît sous un en-tête « Traduit de … » ; sinon on prend le dernier bloc de texte du tweet
      // l'en-tête le plus précis (texte le plus court), puis le premier parent qui contient aussi la traduction
      const heads = $$('span, div', a2).filter((e) => /^(traduit (de|du|depuis)|translated from)/i.test((e.textContent || '').trim()) && (e.textContent || '').length < 80)
        .sort((x, y) => x.textContent.length - y.textContent.length);
      const blocks = $$('[data-testid="tweetText"]', a2);
      let txt = '';
      if (heads[0]) {
        const h = heads[0].textContent;
        let box = heads[0].parentElement;
        while (box && box !== a2 && (box.textContent || '').trim().length <= h.trim().length + 3) box = box.parentElement;
        if (box && box !== a2) txt = (box.textContent || '').replace(h, '').trim();
      }
      if (!txt && blocks.length > 1) txt = blocks[blocks.length - 1].textContent;
      if (!txt) continue;
      els.text.textContent = txt.slice(0, 600);
      els.tags.textContent = 'Traduit par X';
      return;
    }
    toast('La traduction de X n\'est pas arrivée.');
  }

  // Module complémentaire facultatif (« Nocturne Analyse », installé à part) : Nocturne lui signale juste le tweet affiché.
  let companion = false;
  async function checkCompanion() {
    const r = await NCT.send({ type: 'nct-companion', cmd: 'ping' }).catch(() => null);
    companion = !!(r && r.ok);
    els.analysebtn.hidden = els.markbtn.hidden = !companion;
    return companion;
  }
  async function mark() {
    const it = cur();
    if (!it) return;
    if (!companion && !(await checkCompanion())) return toast('Le module Nocturne Analyse n\'est pas installé.');
    toast('Marqué. Lecture du compte @' + it.handle + '…');
    const r = await NCT.send({ type: 'nct-companion', cmd: 'mark', id: it.id, handle: it.handle, source: sourceTag() }).catch((e) => ({ ok: false, error: e.message }));
    if (r && r.ok && r.data) toast('Fiche de @' + it.handle + ' : ' + r.data.tweets + ' tweets lus, ' + (r.data.medianLikes == null ? '?' : r.data.medianLikes) + ' j\'aime en médiane, ' + r.data.overPerformers + ' au-dessus du lot.');
    else toast('Marqué. Fiche du compte impossible : ' + ((r && r.error) || 'pas de réponse') + '.');
  }

  // Diagnostic : Nocturne retrouve-t-il encore ce dont il a besoin dans la page de X ?
  function diagnose() {
    const arts = articles();
    const n = arts.length;
    const count = (fn) => arts.filter((a) => { try { return fn(a); } catch (_) { return false; } }).length;
    const ratio = (k, warnAt = 0.5, okAt = 0.85) => (!n ? 'bad' : k / n >= okAt ? 'ok' : k / n >= warnAt ? 'warn' : 'bad');
    const pct = (k) => (n ? Math.round((k / n) * 100) + ' %' : '–');
    const st = count((a) => statusInfo(a));
    const groups = count((a) => { const g = $('[role="group"][aria-label]', a); const m = g && O.parseMetrics(g.getAttribute('aria-label')); return m && (m.likes != null || m.views != null || m.replies != null); });
    const rows = [
      ['Tweets sur la page', n ? 'ok' : 'bad', n + ' trouvés'],
      ['Liens des tweets (identifiant, auteur)', ratio(st), pct(st)],
      ['Auteurs', ratio(count((a) => $('[data-testid="User-Name"]', a))), pct(count((a) => $('[data-testid="User-Name"]', a)))],
      ['Textes', ratio(count((a) => $('[data-testid="tweetText"]', a)), 0.3, 0.6), pct(count((a) => $('[data-testid="tweetText"]', a)))],
      ['Dates de publication', ratio(count((a) => $('time[datetime]', a))), pct(count((a) => $('time[datetime]', a)))],
      ['Compteurs (vues, j\'aime…)', ratio(groups), pct(groups)],
      ['Vidéos repérées', count((a) => $('video, [data-testid="videoPlayer"]', a)) ? 'ok' : 'warn', String(count((a) => $('video, [data-testid="videoPlayer"]', a)))],
      ['Bouton J\'aime', ratio(count((a) => $('[data-testid="like"], [data-testid="unlike"]', a))), pct(count((a) => $('[data-testid="like"], [data-testid="unlike"]', a)))],
      ['Bouton Reposter', ratio(count((a) => $('[data-testid="retweet"], [data-testid="unretweet"]', a))), pct(count((a) => $('[data-testid="retweet"], [data-testid="unretweet"]', a)))],
      ['Lien Accueil de X', $('a[data-testid="AppTabBar_Home_Link"]') ? 'ok' : 'warn', ''],
      ['Onglets Pour vous / Abonnements', location.pathname !== '/home' ? 'ok' : $$('[data-testid="primaryColumn"] [role="tab"]').length >= 2 ? 'ok' : 'warn', location.pathname === '/home' ? '' : 'hors accueil'],
    ];
    const session = { page: location.pathname + location.search, version: (ext.runtime.getManifest && ext.runtime.getManifest().version) || '?', videosLues: S.pagePlays, videosConnues: S.items.length, ralentissements: S.lagHits, essais: S.tries, source: sourceTag(), ouvertDepuisMin: S.openedAt ? Math.round((Date.now() - S.openedAt) / 60000) : 0 };
    return { rows, session, at: new Date().toISOString() };
  }
  let diagCache = null;
  const diagLight = () => {
    if (!diagCache || Date.now() - diagCache.t > 15000) { const d = diagnose(); diagCache = { t: Date.now(), worst: d.rows.some((r) => r[1] === 'bad') ? 'bad' : d.rows.some((r) => r[1] === 'warn') ? 'warn' : 'ok' }; }
    return diagCache.worst;
  };

  /* ======================= Pages (panneaux plein écran) ======================= */

  const pageCtx = {
    items: () => S.items,
    played: (id) => S.played.has(id),
    playItem(id) { const it = S.items.find((i) => i.id === id); if (it) { closePage(true); jumpTo(it); } },
    launchSearch,
    launchChannel,
    current: () => (S.source === 'channel' ? { id: S.channel, angle: S.angle } : null),
    diagnose,
    openPage: (n) => openPage(n),
  };

  function openPage(name) {
    const was = S.resumeAfterPage;
    closePage(true);
    S.resumeAfterPage = was;
    if (S.orig && !S.orig.paused) { S.orig.pause(); S.resumeAfterPage = true; }
    S.page = name;
    guard();
    els.overlay.classList.add('page');
    els.pagetitle.textContent = P.titles[name];
    S.pageM = P[name](els.pagebody, pageCtx);
    const first = $('[data-keep="q"]', els.pagebody);
    if (first) first.focus();
  }

  function closePage(silent) {
    if (S.pageM) { S.pageM.destroy(); S.pageM = null; }
    els.overlay.classList.remove('page');
    S.page = null;
    if (!silent && S.resumeAfterPage && S.orig && !S.userPaused) S.orig.play().catch(() => {});
    S.resumeAfterPage = false;
    scheduleRails();
  }

  /* ======================= États affichés dans le cadre ======================= */

  let busyTimer = null;
  function busy(text) {
    els.state.className = 'n-state busy';
    els.state.innerHTML = `<div class="n-busy"><i></i><span>${esc(text)}</span></div>`;
    clearTimeout(busyTimer);
    busyTimer = setTimeout(() => { if (els.state.classList.contains('busy') && S.orig && !S.orig.paused && S.orig.readyState >= 3) clearBusy(); }, 6000);
  }
  function clearBusy() { if (els.state.classList.contains('busy')) clearState(); }
  function clearState() { els.state.className = 'n-state'; els.state.innerHTML = ''; }

  function showError(text) {
    els.state.className = 'n-state card';
    els.state.innerHTML = `<div class="n-big">${ic('ban', 28)}</div><p>${esc(text)}</p><div class="n-btns"><button class="n-btn primary" data-a="refresh">${ic('refresh', 16)}Réessayer</button></div>`;
  }

  // Cadre vide : un petit schéma qui dit où les vidéos se sont arrêtées, avec un bouton pour corriger.
  // delay > 0 : réessai automatique prévu ; -1 : Nocturne a arrêté de réessayer ; forced : titre imposé (changement d'angle).
  function showEmpty(delay, forced) {
    const f = funnel();
    const ch = chan();
    let title, fixes = [];
    if (forced) {
      title = forced;
    } else if (!f.total && S.skipHits) {
      title = 'Plus de nouvelles vidéos pour le moment : X ne renvoie que des vidéos déjà vues.';
      fixes.push(['refresh', 'refresh', 'Actualiser'], ['search', 'search', 'Autre recherche']);
    } else if (!f.total) {
      title = ch ? 'X ne renvoie rien pour « ' + ch.label + ' · ' + C.angle(S.channel, S.angle).label + ' » en ce moment.'
        : S.source === 'search' ? 'X ne renvoie aucune vidéo pour « ' + S.query.replace(/ filter:.*$/, '') + ' ».' : 'Aucune vidéo trouvée sur cette page.';
      fixes.push(['search', 'search', 'Autre recherche'], ['refresh', 'refresh', 'Actualiser']);
    } else if (f.left === 0 && f.cut) {
      title = f.cut + ' vidéo' + (f.cut > 1 ? 's' : '') + ' sur ' + f.total + ' écartée' + (f.cut > 1 ? 's' : '') + ' par tes filtres.';
      const labels = { ai: ['spark', 'Afficher les vidéos IA'], lang: ['lang', 'Toutes les langues'], region: ['globe', 'Retirer la zone'], word: ['tag', 'Voir les mots bloqués'], account: ['eyeoff', 'Voir les comptes masqués'], theme: ['algo', 'Voir les thèmes'] };
      Object.entries(f.c).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([k]) => fixes.push(['relax', labels[k][0], labels[k][1], k]));
      fixes.push(['refresh', 'refresh', 'Actualiser']);
    } else {
      title = 'Plus de nouvelles vidéos pour le moment.';
      fixes.push(['refresh', 'refresh', 'Actualiser le flux']);
    }
    if (ch && !forced) fixes.unshift(['angle', 'forward', 'Angle suivant', String(S.angle + 1)]);
    const note = delay > 0 ? `Nocturne actualise tout seul dans ${delay} secondes.`
      : delay === -1 ? 'Plusieurs essais sans rien de neuf : Nocturne ne recharge plus X tout seul, pour ne pas charger Firefox pour rien. Appuie sur Actualiser quand tu veux.' : '';
    els.state.className = 'n-state card';
    els.state.innerHTML = `<p class="n-etitle">${esc(title)}</p>${f.total ? funnelHTML(f, false) : ''}${note ? `<p class="n-sub">${esc(note)}</p>` : ''}${forced ? '' : `<div class="n-btns">${fixes.map(([a, i, l, v], n) => `<button class="n-btn ${n === 0 ? 'primary' : ''}" data-a="${a === 'search' ? 'page' : a}" ${a === 'search' ? 'data-v="search"' : v ? `data-v="${esc(v)}"` : ''}>${ic(i, 16)}${esc(l)}</button>`).join('')}</div>`}`;
    renderTop();
  }

  function toast(text, undo) {
    clearTimeout(S.toastTimer);
    els.toast.innerHTML = `<span>${esc(text)}</span>${undo ? `<button data-a="${undo.a}" data-v="${esc(undo.v)}">${ic('undo', 14)}${esc(undo.label)}</button>` : ''}`;
    els.toast.classList.add('show');
    S.toastTimer = setTimeout(hideToast, undo ? 6000 : 3200);
  }
  function hideToast() { els.toast.classList.remove('show'); }

  /* ======================= Interface ======================= */

  const GRADS = ['repeating-linear-gradient(45deg,#242320 0 6px,#1C1B19 6px 12px)', 'repeating-linear-gradient(45deg,#2A2622 0 6px,#1D1B18 6px 12px)', 'repeating-linear-gradient(45deg,#22252A 0 6px,#1A1C1F 6px 12px)', 'repeating-linear-gradient(45deg,#272424 0 6px,#1D1B1B 6px 12px)'];

  const act = (a, icon, label, tip, cls = '', el = '') =>
    `<button class="n-act ${cls}" data-a="${a}" ${el ? `data-el="${el}"` : ''} aria-label="${esc(tip)}" data-tip="${esc(tip)}">${ic(icon, 22)}<span>${esc(label)}</span></button>`;

  function buildUI() {
    host = document.createElement('div');
    host.id = 'nocturne-host';
    host.style.cssText = 'all: initial; visibility: hidden;'; // caché jusqu'au chargement de la feuille de style (pas de flash sans style)
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <link rel="stylesheet" href="${CSS_URL}">
      <button class="n-launcher" data-a="open-overlay" aria-label="Ouvrir Nocturne">${ic('play', 16)}Nocturne</button>
      <div class="n-overlay n-root" role="dialog" aria-label="Nocturne">
        <header class="n-top">
          <div class="n-brand"><span class="n-logo"></span><b>Nocturne</b></div>
          <nav class="n-tabs" data-el="sources" aria-label="Source des vidéos">
            <button data-a="src" data-v="foryou">${ic('home', 18)}<span>Pour vous</span></button>
            <button data-a="src" data-v="following">${ic('users', 18)}<span>Abonnements</span></button>
            <button data-a="src" data-v="channels">${ic('channels', 18)}<span data-el="clabel">Chaînes</span></button>
            <button data-a="src" data-v="search">${ic('search', 18)}<span data-el="qlabel">Recherche</span></button>
          </nav>
          <div class="n-top-right">
            <button class="n-autobtn" data-a="auto" data-el="autosw" role="switch" aria-label="Enchaînement automatique" data-tip="Enchaîner automatiquement les vidéos">${ic('autoplay', 18)}<span>Auto</span><i class="n-switch-i"></i></button>
            <span class="n-vsep n-hide-compact"></span>
            <button class="n-tbtn n-hide-compact" data-a="page" data-v="algo" data-tip="Tableau de bord de l'algo">${ic('algo', 20)}<span>Algo</span></button>
            <button class="n-tbtn n-hide-compact" data-a="analyse" data-el="analysebtn" data-tip="Conseils (module Nocturne Analyse)" hidden>${ic('bulb', 20)}<span>Analyse</span></button>
            <button class="n-tbtn n-hide-compact" data-a="page" data-v="settings" data-tip="Réglages">${ic('settings', 20)}<span>Réglages</span></button>
            <span class="n-vsep n-hide-compact"></span>
            <button class="n-tbtn icon n-hide-compact" data-a="compact" data-tip="Fenêtre compacte" aria-label="Fenêtre compacte">${ic('window', 20)}</button>
            <button class="n-tbtn icon" data-a="fullscreen" data-tip="Plein écran (F)" aria-label="Plein écran">${ic('expand', 20)}</button>
            <button class="n-tbtn icon close" data-a="close" data-tip="Fermer (Échap)" aria-label="Fermer">${ic('close', 20)}</button>
          </div>
        </header>
        <div class="n-body">
          <aside class="n-rail l" data-el="railL"></aside>
          <main class="n-stage" data-el="stage">
            <div class="n-frame" data-a="pause" data-el="frame">
              <canvas class="n-canvas" data-el="video" width="16" height="9"></canvas>
              <div class="n-paused" data-el="paused">${ic('play', 56)}</div>
              <div class="n-pill left" data-el="pos"></div>
              <div class="n-pill right" data-el="next"></div>
              <div class="n-state" data-el="state"></div>
              <div class="n-info"><div class="n-handle" data-el="handle"></div><div class="n-text" data-el="text"></div><div class="n-irow"><div class="n-tags" data-el="tags"></div><button class="n-tr" data-a="translate" aria-label="Traduire le texte (T)">${ic('lang', 14)}Traduire</button></div></div>
              <div class="n-controls" data-el="controls">
                <div class="n-seek" data-el="seek" role="slider" aria-label="Position dans la vidéo" tabindex="-1"><i class="n-seek-fill" data-el="fill"></i><i class="n-seek-thumb" data-el="thumb"></i><span class="n-seek-tip" data-el="tip"></span></div>
                <div class="n-crow">
                  <span class="n-time" data-el="time"></span>
                  <div class="n-vol">
                    <button class="n-cbtn" data-a="mute" data-el="mute" aria-label="Couper ou remettre le son (M)"></button>
                    <input class="n-volrange" type="range" min="0" max="100" step="1" data-el="vol" aria-label="Volume">
                    <button class="n-cbtn rate" data-a="rate" data-el="rate" aria-label="Vitesse de lecture"></button>
                    <button class="n-cbtn" data-a="fullscreen" aria-label="Plein écran (F)">${ic('expand', 18)}</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="n-actions" data-el="actions">
              ${act('profile', 'plus', 'Profil', 'Voir le profil', 'follow')}
              ${act('like', 'like', 'J\'aime', 'J\'aime sur X (L)', '', 'like')}
              ${act('repost', 'repost', 'Reposter', 'Reposter / retirer le repost (P)', '', 'repost')}
              ${act('thread', 'bubble', 'Discu.', 'Discussion : réponses et citations (D)')}
              ${act('open', 'open', 'Ouvrir', 'Ouvrir le post sur X (O)')}
              ${act('mark', 'flag', 'Marquer', 'Marquer (module Nocturne Analyse) (A)', '', 'markbtn')}
              <div class="n-sep"></div>
              ${act('hide', 'userx', 'Masquer', 'Ne plus voir ce compte (H)', 'danger')}
              <div class="n-sep"></div>
              ${act('prev', 'up', 'Préc.', 'Vidéo précédente (K)')}
              ${act('next', 'down', 'Suiv.', 'Vidéo suivante (J)', 'strong')}
              ${act('refresh', 'refresh', 'Actu.', 'Actualiser le flux (R)')}
            </div>
          </main>
          <aside class="n-rail r" data-el="railR"></aside>
          <aside class="n-drawer" data-el="drawer" aria-label="Discussion"></aside>
        </div>
        <section class="n-page">
          <header class="n-page-top"><button class="n-btn" data-a="back">${ic('back', 16)}Retour au flux</button><h2 data-el="pagetitle"></h2></header>
          <div class="n-page-body" data-el="pagebody"></div>
        </section>
        <div class="n-toast" data-el="toast" role="status"></div>
      </div>`;
    const link = $('link', shadow);
    const reveal = () => { host.style.visibility = ''; };
    link.addEventListener('load', reveal);
    link.addEventListener('error', () => {
      fetch(CSS_URL).then((r) => r.text()).then((css) => {
        const st = document.createElement('style');
        st.textContent = css;
        shadow.prepend(st);
      }).catch(() => {}).finally(reveal);
    });
    setTimeout(reveal, 1500);
    $$('[data-el]', shadow).forEach((el) => (els[el.dataset.el] = el));
    els.overlay = $('.n-overlay', shadow);
    els.markbtn.hidden = true; // visible seulement si le module Nocturne Analyse est installé
    // À document_start la racine peut ne pas exister encore : on attend qu'elle apparaisse.
    if (document.documentElement) document.documentElement.appendChild(host);
    else new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); document.documentElement.appendChild(host); } }).observe(document, { childList: true });

    // clics (délégation)
    shadow.addEventListener('click', (e) => {
      e.stopPropagation();
      unlockSound();
      if (e.composedPath().includes(els.pagebody)) return; // les panneaux gèrent leurs propres clics (le test se fait sur le chemin d'origine : le panneau a pu redessiner le bouton)
      const t = e.target.closest ? e.target.closest('[data-a]') : null;
      if (!t || !ACT[t.dataset.a]) return;
      if (t.blur && t.tagName === 'BUTTON') t.blur(); // sinon Espace « clique » encore sur le bouton
      if (t.dataset.a === 'pause' && e.target.closest('.n-controls, .n-state')) return;
      ACT[t.dataset.a](t, e);
    });
    // Les touches tapées dans l'interface ne doivent pas déclencher les raccourcis de X.
    ['keydown', 'keyup', 'keypress'].forEach((t) => shadow.addEventListener(t, (e) => e.stopPropagation(), false));
    shadow.addEventListener('submit', (e) => {
      const f = e.target.closest ? e.target.closest('[data-s]') : null;
      if (!f || !String(f.dataset.s).startsWith('rail')) return; // les formulaires des panneaux sont gérés par panels.js
      e.preventDefault();
      const v = (f.elements.w.value || '').trim();
      f.reset();
      if (f.dataset.s === 'railSearch' && v) launchSearch([v]);
      if (f.dataset.s === 'railBlock' && v) store.set({ blockWords: [...new Set([...SET().blockWords, v.toLowerCase()])] });
    });
    // curseur « goûts / découverte » du rail gauche
    shadow.addEventListener('input', (e) => {
      const r = e.target.closest && e.target.closest('[data-r="discover"]');
      if (r) { const v = Number(r.value); r.style.setProperty('--p', v + '%'); store.set({ discover: v }); }
    });
    els.overlay.addEventListener('wheel', onWheel, { passive: false });
    els.overlay.addEventListener('mousemove', wakeControls);
    els.frame.addEventListener('dblclick', (e) => { if (!e.target.closest('.n-controls, .n-state')) toggleFullscreen(); });
    // repli (plein écran d'élément) : seulement si le plein écran de fenêtre n'est pas disponible
    document.addEventListener('fullscreenchange', () => setFs(document.fullscreenElement === host));
    // F11 ou Échap pressé par toi : on suit l'état réel de la fenêtre
    let rz = null;
    window.addEventListener('resize', () => {
      clearTimeout(rz);
      rz = setTimeout(async () => {
        if (!S.open || document.fullscreenElement) return;
        const r = await NCT.send({ type: 'nct-fullscreen-state' }).catch(() => null);
        if (r && r.ok && typeof r.fullscreen === 'boolean' && r.fullscreen !== S.fs) setFs(r.fullscreen);
      }, 250);
    });
    new ResizeObserver(fitFrame).observe(els.stage);
    new ResizeObserver((e) => { const r = e[e.length - 1].contentRect; S.box = [r.width, r.height]; }).observe(els.frame);
    window.addEventListener('keydown', onKey, true);

    // volume
    els.vol.addEventListener('input', () => setVolume(Number(els.vol.value) / 100));
    els.vol.addEventListener('click', (e) => e.stopPropagation());
    els.mute.parentElement.addEventListener('wheel', (e) => {
      e.preventDefault(); e.stopPropagation();
      const s = SET();
      setVolume((s.muted ? 0 : s.volume) + (e.deltaY < 0 ? 0.05 : -0.05));
    }, { passive: false });

    // barre de progression : clic et glisser pour avancer ou reculer
    const seekFrom = (clientX) => {
      const r = els.seek.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    };
    els.seek.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      S.dragging = true;
      els.seek.classList.add('drag');
      els.seek.setPointerCapture(e.pointerId);
      const p = seekFrom(e.clientX);
      els.fill.style.width = p * 100 + '%'; els.thumb.style.left = p * 100 + '%';
      seekToPct(p);
    });
    els.seek.addEventListener('pointermove', (e) => {
      const p = seekFrom(e.clientX);
      const v = S.orig;
      els.tip.style.left = p * 100 + '%';
      els.tip.textContent = v && isFinite(v.duration) ? fmt(p * v.duration) : '';
      if (S.dragging) { els.fill.style.width = p * 100 + '%'; els.thumb.style.left = p * 100 + '%'; seekToPct(p); }
    });
    const endDrag = () => { S.dragging = false; els.seek.classList.remove('drag'); };
    els.seek.addEventListener('pointerup', endDrag);
    els.seek.addEventListener('pointercancel', endDrag);
    els.seek.addEventListener('click', (e) => e.stopPropagation());
  }

  function fillInfo(item) {
    if (S.drawer && S.drawer !== item.id) closeDrawer();
    els.handle.textContent = item.name + '  @' + item.handle;
    els.text.textContent = item.text;
    els.tags.textContent = item.themes.map((id) => T.LABEL[id]).join(' · ');
    els.pos.textContent = 'N° ' + (S.pos + 1);
    renderTop();
    scheduleRails();
  }

  /* ---- Format de la vidéo et plein écran ---- */

  function setAr(w, h) {
    if (!w || !h) return;
    S.ar = w / h;
    els.frame.classList.toggle('wide', S.ar > 1.2);
    els.overlay.classList.toggle('wide', S.ar > 1.2); // vidéo large : on libère la place du rail de droite
    fitFrame();
  }

  // Le cadre prend la plus grande taille possible avec le format de la vidéo (vertical, carré ou large).
  function fitFrame() {
    if (!els.frame || !els.stage) return;
    const compact = window.innerWidth <= 640;
    if (compact) { els.frame.style.width = els.frame.style.height = ''; return; }
    const fs = els.overlay.classList.contains('fs');
    const r = els.stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const actW = fs ? 0 : els.actions.offsetWidth + 22;
    const pad = fs ? 0 : 32;
    const scale = fs ? 1 : { s: 0.72, m: 0.92, l: 1 }[SET().size] || 0.92;
    const aw = (r.width - pad - actW) * scale, ah = (r.height - pad) * scale;
    const w = Math.max(120, Math.min(aw, ah * S.ar));
    els.frame.style.width = Math.round(w) + 'px';
    els.frame.style.height = Math.round(w / S.ar) + 'px';
  }

  function setFs(on) {
    S.fs = on;
    els.overlay.classList.toggle('fs', on);
    wakeControls();
    fitFrame();
    scheduleRails();
  }

  async function toggleFullscreen() {
    const want = !S.fs;
    const r = await NCT.send({ type: 'nct-fullscreen', on: want }).catch(() => null);
    if (r && r.ok) return setFs(want);
    if (document.fullscreenElement) return document.exitFullscreen().catch(() => {});
    host.requestFullscreen().catch(() => toast('Le plein écran est refusé par le navigateur.'));
  }

  function wakeControls() {
    els.overlay.classList.remove('idle');
    clearTimeout(S.idleTimer);
    if (els.overlay.classList.contains('fs')) S.idleTimer = setTimeout(() => els.overlay.classList.add('idle'), 2500);
  }

  function updateProgress() {
    const v = S.orig;
    if (!v) return;
    const d = v.duration, c = v.currentTime;
    if (!isFinite(d) || d <= 0) { els.time.textContent = fmt(c); return; }
    if (!S.dragging) {
      const p = Math.min(100, (c / d) * 100);
      els.fill.style.width = p + '%';
      els.thumb.style.left = p + '%';
    }
    els.time.textContent = fmt(c) + ' / ' + fmt(d);
    els.next.textContent = (SET().auto ? 'Suivante dans ' : 'Reste ') + fmt(d - c);
  }

  function renderTop() {
    publishState();
    const tab = S.source === 'channel' ? 'channels' : S.source;
    $$('[data-a="src"]', els.sources).forEach((b) => b.classList.toggle('on', b.dataset.v === tab));
    els.qlabel.textContent = S.source === 'search' && S.query ? S.query.replace(/ filter:.*$/, '').slice(0, 22) : 'Recherche';
    const ch = chan();
    els.clabel.textContent = ch ? ch.label : 'Chaînes';
    els.autosw.classList.toggle('on', SET().auto);
    els.autosw.setAttribute('aria-checked', String(SET().auto));
  }

  function applyLayout() {
    const s = SET();
    els.stage.className = 'n-stage ' + (s.side === 'left' ? 'left ' : '') + s.size;
    fitFrame();
    els.railL.hidden = els.railR.hidden = !s.rails;
  }

  let railTimer = null;
  function scheduleRails() {
    if (!S.open || railTimer) return;
    railTimer = setTimeout(() => {
      railTimer = null;
      // Ne jamais redessiner les rails pendant qu'on écrit dans un champ ou qu'on déplace un curseur.
      const a = shadow.activeElement;
      if (a && (els.railL.contains(a) || els.railR.contains(a)) && /^(INPUT|TEXTAREA)$/.test(a.tagName)) { scheduleRails(); return; }
      renderRails(); renderTop();
    }, 600);
  }

  const ZONE_CODE = { france: 'FR', europe: 'EU', usa: 'US', uk: 'UK', maghreb: 'MAG', afrique: 'AF', orient: 'MO', asie: 'AS', latam: 'LAT' };
  const ZONE_NAME = { uk: 'R.-Uni', orient: 'Moy.-Orient', latam: 'Am. latine', usa: 'États-Unis' };
  const langLabel = (l) => (l.length ? l.map((x) => x.toUpperCase()).join(' · ') : 'Toutes');

  function funnelHTML(f, links = true) {
    const rows = [['ai', 'spark', 'IA'], ['lang', 'lang', 'Langue'], ['region', 'globe', 'Zone'], ['word', 'tag', 'Mots'], ['account', 'eyeoff', 'Comptes'], ['theme', 'algo', 'Thèmes']].filter(([k]) => f.c[k]);
    const max = Math.max(1, f.total);
    const bar = (n, cls) => `<i class="n-fbar ${cls}"><u style="width:${Math.max(n ? 4 : 0, Math.round((n / max) * 100))}%"></u></i>`;
    return `<div class="n-funnel">
      <div class="n-frow"><span class="n-fl">${ic('video', 15)}Trouvées sur X</span>${bar(f.total, 'all')}<b>${f.total}</b></div>
      ${rows.map(([k, i, l]) => `<${links ? 'button data-a="relax" data-v="' + k + '" data-tip="Cliquer pour relâcher ce filtre"' : 'div'} class="n-frow cut"><span class="n-fl">${ic(i, 15)}${l}</span>${bar(f.c[k], 'cut')}<b>−${f.c[k]}</b></${links ? 'button' : 'div'}>`).join('')}
      <div class="n-frow"><span class="n-fl">${ic('check', 15)}Déjà vues</span>${bar(f.seen, 'seen')}<b>${f.seen}</b></div>
      <div class="n-frow keep"><span class="n-fl">${ic('play', 15)}À voir</span>${bar(f.left, 'keep')}<b>${f.left}</b></div>
    </div>`;
  }

  // Les rails ne sont calculés que s'ils sont visibles (pas en plein écran, pas derrière un panneau, pas masqués).
  const railVisible = (el) => S.open && !S.page && !S.fs && el.getClientRects().length > 0;

  // Liste repliée derrière un œil (comme un mot de passe) : on voit le nombre, on clique pour afficher la liste.
  function maskList(key, icon, label, items, row, empty, extra = '') {
    const open = S.show[key];
    const n = items.length;
    return `<section class="n-block n-mask"><div class="n-mhead"><div class="n-label">${ic(icon, 13)}${esc(label)}<b class="n-count">${n}</b></div>
      <button class="n-eye ${open ? 'on' : ''}" data-a="eye" data-v="${key}" aria-pressed="${open}" aria-label="${open ? 'Cacher' : 'Afficher'} la liste" data-tip="${open ? 'Cacher' : 'Afficher'} la liste">${ic(open ? 'eyeoff' : 'eye', 16)}</button></div>
      ${open ? (n ? `<ul class="n-mlist">${items.map(row).join('')}</ul>` : `<p class="n-sub">${esc(empty)}</p>`) : ''}${extra}</section>`;
  }

  function renderRails(force) {
    if (!els.railL) return;
    const s = SET();
    if (railVisible(els.railL)) renderLeft(s, force);
    if (railVisible(els.railR)) renderRight(s, force);
  }

  function renderLeft(s, force) {
    const tile = (a, v, icon, label, value, on) => `<button class="n-tile ${on ? 'on' : ''}" data-a="${a}" ${v ? `data-v="${v}"` : ''}>${ic(icon, 20)}<span class="n-tl">${esc(label)}</span><b>${esc(value)}</b></button>`;
    const topics = s.topics.length
      ? s.topics.map((t) => `<span class="n-chip accent"><button class="n-link" data-a="topic" data-v="${esc(t)}">${esc(t)}</button><button class="n-x" data-a="rmTopic" data-v="${esc(t)}" aria-label="Retirer ${esc(t)}">×</button></span>`).join('')
      : '';
    const ch = chan();
    const channels = `<section class="n-block"><div class="n-label">${ic('channels', 13)}Chaînes</div>
        <div class="n-chans">${C.all().map((c) => `<button class="n-chan ${ch && ch.id === c.id ? 'on' : ''}" data-a="channel" data-v="${c.id}" aria-pressed="${!!(ch && ch.id === c.id)}" aria-label="${esc(c.label)}">${ic(c.icon, 18)}<span>${esc(c.short)}</span></button>`).join('')}</div>
        ${ch ? `<div class="n-angles">${ch.angles.map((a, i) => `<button class="n-angle ${i === S.angle ? 'on' : ''}" data-a="angle" data-v="${i}" data-tip="${esc(a.hint)}">${esc(a.label)}</button>`).join('')}</div>${ch.long ? '<p class="n-sub">Vidéos longues autorisées sur cette chaîne.</p>' : ''}` : ''}
      </section>`;
    const words = maskList('words', 'tag', 'Mots bloqués', s.blockWords,
      (w) => `<li><span>${esc(w)}</span><button class="n-mbtn" data-a="rmBlock" data-v="${esc(w)}">Retirer</button></li>`, 'Aucun mot bloqué.',
      `<form class="n-searchbox sm" data-s="railBlock">${ic('plus', 15)}<input name="w" placeholder="Bloquer un mot" aria-label="Bloquer un mot" autocomplete="off"></form>`);
    const accounts = maskList('accounts', 'eyeoff', 'Comptes masqués', s.hiddenAccounts,
      (h) => `<li><span>@${esc(h)}</span><button class="n-mbtn" data-a="unhide" data-v="${esc(h)}">Démasquer</button></li>`, 'Aucun compte masqué. Touche H sur une vidéo pour masquer son compte.');
    const htmlL = `
      <form class="n-searchbox" data-s="railSearch">${ic('search', 18)}<input name="w" placeholder="Chercher un sujet…" aria-label="Chercher un sujet" autocomplete="off"><kbd class="n-kbd">/</kbd></form>
      ${topics ? `<div class="n-chips">${topics}</div>` : ''}
      ${channels}
      <section class="n-block"><div class="n-label">${ic('filter', 13)}Filtres</div>
        <div class="n-tiles">
          ${tile('tog', 'blockAI', 'spark', 'Sans IA', s.blockAI ? 'activé' : 'désactivé', s.blockAI)}
          ${tile('langs', '', 'lang', 'Langues', langLabel(s.languages), s.languages.length > 0)}
          ${tile('dur', '', 'clock', 'Durée max', ch && ch.long ? 'libre ici' : R.durationLabel(s.maxDuration), s.maxDuration > 0 && !(ch && ch.long))}
        </div>
      </section>
      <section class="n-block"><div class="n-label">${ic('globe', 13)}Zone</div>
        <div class="n-zones">${T.REGIONS.map((r) => `<button class="n-zone ${s.regions.includes(r.id) ? 'on' : ''}" data-a="region" data-v="${r.id}" aria-pressed="${s.regions.includes(r.id)}"><b>${ZONE_CODE[r.id] || r.id.slice(0, 2).toUpperCase()}</b><span>${esc(ZONE_NAME[r.id] || r.label)}</span></button>`).join('')}</div>
        ${s.regions.length ? `<div class="n-seg sm full">${[['only', 'Seulement'], ['prefer', 'Préférer'], ['exclude', 'Exclure']].map(([v, l]) => `<button class="${s.regionMode === v ? 'on' : ''}" data-a="regionMode" data-v="${v}">${l}</button>`).join('')}</div>` : ''}
      </section>
      <section class="n-block"><div class="n-label">${ic('algo', 13)}Mix du flux</div>
        <input class="n-range" type="range" min="0" max="100" step="5" value="${s.discover}" data-r="discover" style="--p:${s.discover}%" aria-label="Part de découverte">
        <div class="n-mixlab"><span>Mes goûts ${100 - s.discover} %</span><span>Découverte ${s.discover} %</span></div></section>
      ${words}
      ${accounts}`;
    if (force || els.railL.__h !== htmlL) { els.railL.innerHTML = htmlL; els.railL.__h = htmlL; }
  }

  function renderRight(s, force) {
    const m = R.measured(store.state.profile.views);
    const top = T.THEMES.map((t) => [t.label, Math.round(m.shares[t.id] * 100)]).filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const ctx = rankCtx();
    const up = windowCands(12).map((it) => [it, R.score(it, ctx)]).sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x[0]);
    const f = funnel();
    const htmlR = `
      <section class="n-block"><div class="n-qhead"><div class="n-label">${ic('play', 13)}À suivre</div><button class="n-chip ${s.auto ? 'accent' : ''}" data-a="auto">${s.auto ? 'Auto' : 'Manuel'}</button></div>
        ${up.length ? up.map((it, i) => `<button class="n-q" data-a="playid" data-v="${esc(it.id)}"><span class="n-qthumb" style="background:${it.poster ? `center/cover url('${esc(it.poster)}'), ` : ''}${GRADS[i % 4]}"></span><span><b>@${esc(it.handle)}</b><span class="t">${esc(it.text || 'Vidéo')}</span></span></button>`).join('') : '<span class="n-sub">La file se remplit au fil du défilement.</span>'}
      </section>
      <section class="n-block"><div class="n-label">${ic('filter', 13)}Parcours des vidéos</div>${funnelHTML(f)}</section>
      <button class="n-algocard" data-a="page" data-v="algo"><b>Ton flux penche vers</b>${top.length ? top.map(([l, p]) => `<div class="n-bar"><span>${esc(l)}</span><div class="n-meter"><i style="width:${p}%"></i></div></div>`).join('') : '<span class="n-sub">Regarde quelques vidéos pour le voir.</span>'}</button>
      <section class="n-block"><button class="n-keytoggle" data-a="keys">${ic('keys', 16)}Raccourcis clavier<span>${S.keysOpen ? '−' : '+'}</span></button>
        ${S.keysOpen ? `<div class="n-keyrows">
          <div><span>Suivante / Précédente</span><kbd class="n-kbd">J K</kbd></div><div><span>Pause</span><kbd class="n-kbd">Espace</kbd></div>
          <div><span>Avancer / reculer</span><kbd class="n-kbd">← →</kbd></div><div><span>Volume · Muet</span><kbd class="n-kbd">+ − M</kbd></div>
          <div><span>Plein écran</span><kbd class="n-kbd">F</kbd></div><div><span>Masquer le compte</span><kbd class="n-kbd">H</kbd></div>
          <div><span>J'aime · Ouvrir</span><kbd class="n-kbd">L O</kbd></div><div><span>Chercher</span><kbd class="n-kbd">/</kbd></div>
          <div><span>Angle suivant (chaîne)</span><kbd class="n-kbd">C</kbd></div><div><span>Reposter · Discussion</span><kbd class="n-kbd">P D</kbd></div>
          <div><span>Traduire · Marquer</span><kbd class="n-kbd">T A</kbd></div></div>` : ''}</section>
      <button class="n-diagbtn" data-a="page" data-v="diag"><i class="n-dot ${diagLight()}"></i>Diagnostic : X ${diagLight() === 'ok' ? 'répond bien' : diagLight() === 'warn' ? 'à surveiller' : 'a changé ?'}</button>`;
    if (force || els.railR.__h !== htmlR) { els.railR.innerHTML = htmlR; els.railR.__h = htmlR; }
  }

  /* ======================= Clavier et molette ======================= */

  let lastWheel = 0, lastWheelEvt = 0;
  function onWheel(e) {
    const path = e.composedPath ? e.composedPath() : [];
    // Panneaux et rails latéraux : défilement normal.
    if (S.page || path.includes(els.railL) || path.includes(els.railR)) return;
    e.preventDefault();
    const now = Date.now();
    const newGesture = now - lastWheelEvt > 220; // l'inertie du pavé tactile ne doit compter qu'une fois
    lastWheelEvt = now;
    if (!newGesture || now - lastWheel < 400 || Math.abs(e.deltaY) < 8) return;
    lastWheel = now;
    e.deltaY > 0 ? ACT.next() : ACT.prev();
  }

  const isEditable = (e) => {
    const t = (e.composedPath && e.composedPath()[0]) || e.target;
    return !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && t.type !== 'range');
  };

  function onKey(e) {
    if (!S.open) return;
    // Quand on écrit dans un champ (recherche, mots bloqués…), on ne touche à rien : chiffres, pavé numérique et lettres vont au champ.
    if (isEditable(e)) {
      if (e.key === 'Escape') { const t = e.composedPath()[0]; if (t && t.blur) t.blur(); if (S.page) closePage(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (S.page) {
      if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closePage(); }
      return;
    }
    let handled = true;
    const lk = k.length === 1 ? k.toLowerCase() : k;
    if (lk === 'j' || k === 'ArrowDown') ACT.next();
    else if (lk === 'k' || k === 'ArrowUp') ACT.prev();
    else if (k === ' ') ACT.pause();
    else if (k === 'ArrowRight') seekBy(e.shiftKey ? 10 : 5);
    else if (k === 'ArrowLeft') seekBy(e.shiftKey ? -10 : -5);
    else if (/^[0-9]$/.test(k)) seekToPct(Number(k) / 10);
    else if (k === '+' || k === '=') setVolume((SET().muted ? 0 : SET().volume) + 0.05);
    else if (k === '-' || k === '_') setVolume((SET().muted ? 0 : SET().volume) - 0.05);
    else if (lk === 'm') ACT.mute();
    else if (lk === 'f') toggleFullscreen();
    else if (lk === 'l') ACT.like();
    else if (lk === 'h') ACT.hide();
    else if (lk === 'r') ACT.refresh();
    else if (lk === 'o') ACT.open();
    else if (lk === 'p') ACT.repost();
    else if (lk === 'd') toggleDrawer();
    else if (lk === 't') translate();
    else if (lk === 'a') mark();
    else if (lk === 'c' && S.source === 'channel') launchChannel(S.channel, S.angle + 1);
    else if (k === '/') { const i = $('input[name="w"]', els.railL); if (i) i.focus(); else openPage('search'); }
    else if (k === '>' || k === '<') {
      const i = RATES.indexOf(SET().rate);
      store.set({ rate: RATES[Math.max(0, Math.min(RATES.length - 1, i + (k === '>' ? 1 : -1)))] });
    } else if (k === 'Escape') { if (S.fs) toggleFullscreen(); else ACT.close(); }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopImmediatePropagation(); unlockSound(); }
    else if (k.length === 1) e.stopImmediatePropagation(); // pas de raccourcis X derrière Nocturne
  }

  /* ======================= Ouverture / fermeture ======================= */

  async function openOverlay(auto) {
    if (S.open) return;
    if (auto && auto.channel && C.get(auto.channel)) { S.channel = auto.channel; S.angle = auto.angle || 0; S.cycle = auto.cycle || 0; S.chKey = location.search; }
    detectSource();
    if (auto && auto.topics) { S.topics = auto.topics; S.variant = auto.variant || 0; }
    if (auto && auto.seen) S.skip = new Set(auto.seen);
    if (auto && auto.tries) S.tries = auto.tries;
    if (!S.openedAt) S.openedAt = Date.now();
    const key = location.pathname + location.search;
    const firstOnPath = S.path !== key;
    if (firstOnPath) { resetFeed(); S.path = key; if (location.pathname === '/home') S.source = (auto && auto.source) || (SET().source === 'following' ? 'following' : 'foryou'); }
    let restored = false;
    if (auto) S.returnTo = auto.returnTo || null;
    if (auto && firstOnPath && Array.isArray(auto.hist) && auto.hist.length) {
      S.hist = auto.hist.filter((x) => x && x.id && x.href).map((x) => ({ themes: [], regions: [], words: [], norm: '', ...x, remote: true }));
      const last = S.hist.length - 1;
      S.pos = auto.mode === 'status' && Number.isInteger(auto.pos) ? Math.max(0, Math.min(auto.pos, last)) : last;
      restored = S.hist.length > 0;
    }
    S.open = true;
    els.overlay.classList.add('open');
    applyLayout(); renderTop(); renderRails(true); refreshAudioUi();
    startTimers();
    checkCompanion();
    // la fenêtre est peut-être déjà en plein écran (après un rechargement) : on se cale dessus
    NCT.send({ type: 'nct-fullscreen-state' }).then((r) => { if (r && r.ok && typeof r.fullscreen === 'boolean' && r.fullscreen !== S.fs) setFs(r.fullscreen); }).catch(() => {});

    const ch = chan();
    busy(auto && auto.clean ? 'Reprise du flux…' : ch ? ch.label + ' · ' + C.angle(S.channel, S.angle).label + '…' : S.source === 'search' ? 'Recherche sur X…' : 'Recherche de vidéos…');
    if (firstOnPath && location.pathname === '/home' && S.source === 'following') await selectHomeTab('following');
    if (!S.open) return;
    const found = await waitForVideos(S.source === 'search' ? 22000 : 25000);
    if (!S.open) return;
    renderTop();
    if (auto && auto.mode === 'status' && S.pos >= 0) return playAt(S.pos);
    if (!found) {
      if (S.returnTo) return returnToFeed();
      // Recherche sans résultat : on essaie la variante suivante (onglet Vidéos de X, puis À la une).
      if (S.source === 'search' && S.topics.length && S.variant < 2) return launchSearch(S.topics, S.variant + 1);
      // chaîne : noMore() passe à l'angle suivant
      return noMore();
    }
    if (S.pos >= 0 && !restored) playAt(S.pos);
    else goNext();
  }

  function closeOverlay() {
    S.open = false;
    S.token++;
    publishState();
    stopTimers();
    stopRetry();
    if (document.fullscreenElement === host) document.exitFullscreen().catch(() => {});
    if (S.fs && !document.fullscreenElement) { NCT.send({ type: 'nct-fullscreen', on: false }).catch(() => {}); setFs(false); }
    closePage(true);
    detach();
    els.overlay.classList.remove('open');
  }

  function onStore(what) {
    if (what === 'settings') { S.rev++; applyLayout(); refreshAudioUi(); renderTop(); scheduleRails(); }
    else if (['profile', 'feedback', 'recent'].includes(what)) scheduleRails();
  }

  function readAutorun() {
    let p = null;
    try {
      const raw = sessionStorage.getItem(FLAG);
      if (raw) { sessionStorage.removeItem(FLAG); p = raw === '1' ? { open: true } : JSON.parse(raw); }
    } catch (_) {}
    if (location.hash.startsWith('#nocturne')) {
      p = { ...(p || {}), open: true, compact: true };
      history.replaceState(null, '', location.pathname + location.search);
    }
    return p;
  }

  /* ======================= Mode lecture (petite fenêtre temporaire) ======================= */
  // Discussion : l'arrière-plan ouvre la page du tweet avec #nct-scan=thread : on lit ce qui s'affiche, on renvoie, la fenêtre se ferme.
  // Rien n'est enregistré.
  async function runScan(kind) {
    const t0 = Date.now();
    const done = (data) => NCT.send({ type: 'nct-scan-done', data }).catch(() => {});
    try {
      while (Date.now() - t0 < 15000 && !articles().length) await sleep(300);
      await sleep(600);
      const seen = new Map();
      const grab = (fn) => { for (const a of articles()) { const o = fn(a); if (o && !seen.has(o.id)) seen.set(o.id, o); } };
      if (kind === 'thread') {
        const id = (location.pathname.match(/\/status\/(\d+)/) || [])[1];
        const replyTo = (a) => { const m = (a.textContent || '').slice(0, 400).match(/(?:en réponse à|replying to)\s*((?:@\w{1,15}[\s,et and]*)+)/i); return m ? (m[1].match(/@\w{1,15}/g) || []).map((h) => h.slice(1).toLowerCase()) : []; };
        const order = [];
        for (let i = 0; i < 6 && seen.size < 50; i++) {
          grab((a) => { const o = O.tweet(a, 'discussion'); if (o) { o.replyTo = replyTo(a); o.ago = (($('time', a) || {}).textContent || '').trim(); if (!seen.has(o.id)) order.push(o.id); } return o; });
          window.scrollBy(0, window.innerHeight * 1.5);
          await sleep(900);
        }
        const all = order.map((k) => seen.get(k));
        const at = all.findIndex((o) => o.id === id);
        return done({ main: at >= 0 ? all[at] : null, before: at > 0 ? all.slice(0, at) : [], replies: at >= 0 ? all.slice(at + 1) : all });
      }
      done({ error: 'lecture inconnue' });
    } catch (e) { done({ error: String((e && e.message) || e) }); }
  }

  async function boot() {
    const scanKind = (location.hash.match(/^#nct-scan=(\w+)/) || [])[1];
    if (scanKind) return runScan(scanKind);
    await store.load();
    buildUI();
    applyLayout();
    store.on(onStore);
    document.addEventListener('visibilitychange', () => { tickLast = 0; if (!document.hidden) scheduleRails(); });
    ext.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'nct-toggle') S.open ? closeOverlay() : openOverlay();
    });
    const auto = readAutorun();
    if (auto && auto.open) openOverlay(auto); // l'overlay se rouvre tout de suite, sans montrer la page de X
  }

  boot().catch((e) => console.error('[Nocturne]', e));
})();
