/* Stockage local (browser.storage.local) avec cache en mémoire et notifications de changement. */
(() => {
  'use strict';
  const NCT = (globalThis.NCT = globalThis.NCT || {});
  const ext = typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : null;

  const DEFAULTS = {
    source: 'foryou', // foryou | following | search
    regions: [], // zones ciblées (voir themes.js)
    regionMode: 'prefer', // only | prefer | exclude
    regionKeepUnknown: false, // en mode « seulement », garder les vidéos sans lieu détecté
    blockAI: true, // masque les vidéos générées par IA (détection par libellés et mots-clés)
    noViolence: false, // écarte les vidéos classées « violence » (bagarres, armes, guerre…)
    videoQuality: 'rapide', // rapide : X choisit la définition (démarrage rapide) ; nette : on lui demande une meilleure définition
    discover: 30, // % de vidéos choisies hors de tes préférences
    maxDuration: 120, // secondes, 0 = illimitée
    languages: ['fr', 'en'], // vide = toutes
    languagesSaved: ['fr', 'en'], // mémorise tes langues quand on passe sur « Toutes »
    auto: true,
    muted: false,
    volume: 1,
    rate: 1,
    side: 'right',
    size: 'm',
    rails: true,
    favWords: [],
    blockWords: [],
    hiddenAccounts: [],
    topics: [],
    targets: {},
    customChannels: [], // chaînes perso : { id, label, terms, accounts, videoOnly, long }
  };

  const KEYS = ['settings', 'profile', 'feedback', 'recent', 'quality'];
  const fresh = (k) =>
    k === 'settings' ? { ...DEFAULTS } : k === 'profile' ? { views: [] } : k === 'feedback' ? { handles: {}, words: {}, themes: {} } : k === 'recent' ? [] : k === 'quality' ? {} : null;

  const state = { settings: fresh('settings'), profile: fresh('profile'), feedback: fresh('feedback'), recent: [], quality: {} };
  const listeners = new Set();
  const timers = {};
  const emit = (what) => listeners.forEach((fn) => { try { fn(what, state); } catch (e) { console.error('[Nocturne]', e); } });

  function normalize(k, v) {
    if (k === 'settings') return { ...DEFAULTS, ...(v || {}) };
    if (k === 'profile') return { views: Array.isArray(v && v.views) ? v.views : [] };
    if (k === 'feedback') return { handles: {}, words: {}, themes: {}, ...(v || {}) };
    if (k === 'recent') return Array.isArray(v) ? v : [];
    if (k === 'quality') return v && typeof v === 'object' ? v : {};
    return v || null;
  }

  function persist(k, delay = 250) {
    if (!ext) return;
    clearTimeout(timers[k]);
    timers[k] = setTimeout(() => {
      ext.storage.local.set({ [k]: state[k] }).catch((e) => console.error('[Nocturne] stockage', e));
    }, delay);
  }

  async function load() {
    if (ext) {
      const d = await ext.storage.local.get(KEYS);
      for (const k of KEYS) state[k] = normalize(k, d[k]);
      // 0.5 : l'import YouTube n'existe plus, on efface ce qui en restait.
      const st = state.settings;
      if ('useYoutube' in st || 'ytSubs' in st || 'ytHistory' in st) { delete st.useYoutube; delete st.ytSubs; delete st.ytHistory; persist('settings', 0); }
      if (ext.storage.local.remove) ext.storage.local.remove('youtube').catch(() => {});
    }
    return state;
  }

  if (ext && ext.storage && ext.storage.onChanged) {
    ext.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      for (const k of KEYS) {
        if (!changes[k]) continue;
        const next = normalize(k, changes[k].newValue);
        if (JSON.stringify(next) === JSON.stringify(state[k])) continue; // écho de notre propre écriture
        state[k] = next;
        emit(k);
      }
    });
  }

  const store = {
    state,
    load,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(patch) { state.settings = { ...state.settings, ...patch }; persist('settings'); emit('settings'); },
    resetSettings() { state.settings = { ...DEFAULTS }; persist('settings'); emit('settings'); },
    addView(v) {
      state.profile.views.push(v);
      if (state.profile.views.length > 300) state.profile.views = state.profile.views.slice(-300);
      persist('profile', 800);
      emit('profile');
    },
    clearProfile() {
      state.profile = fresh('profile');
      state.feedback = fresh('feedback');
      persist('profile', 0);
      persist('feedback', 0);
      emit('profile');
      emit('feedback');
    },
    addFeedback(item, delta) {
      const f = state.feedback;
      const clamp = (n) => Math.max(-6, Math.min(6, n));
      const h = item.handle.toLowerCase();
      f.handles[h] = clamp((f.handles[h] || 0) + delta);
      for (const id of item.themes || []) f.themes[id] = clamp((f.themes[id] || 0) + delta);
      for (const w of (item.words || []).slice(0, 6)) f.words[w] = clamp((f.words[w] || 0) + delta * 0.5);
      persist('feedback');
      emit('feedback');
    },
    // Qualité d'une chaîne / d'un angle : combien de vidéos vues, combien « marchent bien » (compteurs seulement).
    addQuality(key, good) {
      const q = state.quality[key] || { n: 0, good: 0 };
      q.n++; if (good) q.good++;
      state.quality[key] = q;
      persist('quality', 2000);
    },
    addRecent(q) {
      const r = [q, ...state.recent.filter((x) => x !== q)].slice(0, 8);
      state.recent = r;
      persist('recent');
      emit('recent');
    },
  };

  NCT.store = store;
  NCT.send = (msg) => (ext ? ext.runtime.sendMessage(msg) : Promise.resolve(null));
  NCT.getURL = (p) => (ext ? ext.runtime.getURL(p) : p);
})();
