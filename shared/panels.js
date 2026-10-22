/* Panneaux réutilisables : tableau de bord de l'algo, réglages, recherche, chaînes thématiques.
 * Utilisés à la fois dans l'overlay (sur x.com) et dans la page d'options de l'extension. */
(() => {
  'use strict';
  const NCT = (globalThis.NCT = globalThis.NCT || {});
  const { esc, icon: ic } = NCT;
  const S = () => NCT.store;
  const T = () => NCT.themes;
  const R = () => NCT.rank;
  const pct = (v) => Math.round((v || 0) * 100);
  const initial = (h) => esc((h || '?').replace(/^@/, '').charAt(0).toUpperCase());

  /* ---------- Mécanique commune ---------- */

  function mount(container, { view, click = {}, input = {}, change = {}, submit = {}, keys = [] }) {
    const draw = () => {
      const root = container.getRootNode();
      const active = root && root.activeElement;
      const keep = active && active.dataset && active.dataset.keep ? { k: active.dataset.keep, v: active.value } : null;
      container.innerHTML = view();
      if (keep) {
        const el = container.querySelector('[data-keep="' + keep.k + '"]');
        if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.v.length, keep.v.length); } catch (_) {} }
      }
    };
    const find = (e, attr) => (e.target && e.target.closest ? e.target.closest('[' + attr + ']') : null);
    const onClick = (e) => { const t = find(e, 'data-a'); if (t && click[t.dataset.a]) click[t.dataset.a](t, e); };
    const onInput = (e) => { const t = find(e, 'data-i'); if (t && input[t.dataset.i]) input[t.dataset.i](t, e); };
    const onChange = (e) => { const t = find(e, 'data-c'); if (t && change[t.dataset.c]) change[t.dataset.c](t, e); };
    const onSubmit = (e) => { const f = find(e, 'data-s'); if (f && submit[f.dataset.s]) { e.preventDefault(); submit[f.dataset.s](f, e); } };
    container.addEventListener('click', onClick);
    container.addEventListener('input', onInput);
    container.addEventListener('change', onChange);
    container.addEventListener('submit', onSubmit);
    const off = S().on((what) => { if (keys.includes(what)) draw(); });
    draw();
    return {
      draw,
      destroy() {
        container.removeEventListener('click', onClick);
        container.removeEventListener('input', onInput);
        container.removeEventListener('change', onChange);
        container.removeEventListener('submit', onSubmit);
        off();
        container.innerHTML = '';
      },
    };
  }

  const chip = (label, cls, action, value) =>
    `<span class="n-chip ${cls}">${esc(label)}${action ? `<button class="n-x" data-a="${action}" data-v="${esc(value == null ? label : value)}" aria-label="Retirer ${esc(label)}">×</button>` : ''}</span>`;

  const sw = (key, on, label) =>
    `<button class="n-switch ${on ? 'on' : ''}" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" data-a="toggle" data-k="${key}"></button>`;

  const seg = (key, cur, opts) =>
    `<div class="n-seg">${opts.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" data-a="set" data-k="${key}" data-v="${esc(v)}" data-t="${typeof v}">${esc(l)}</button>`).join('')}</div>`;

  const uniqAdd = (list, v) => (v && !list.includes(v) ? [...list, v] : list);

  /* ---------- Radar ---------- */

  function radar(themes, values, targets) {
    const n = themes.length, cx = 230, cy = 200, Rr = 130;
    const pt = (i, r) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    const f = (p) => p.map((x) => x.toFixed(1)).join(',');
    const poly = (fn) => themes.map((t, i) => f(pt(i, Rr * fn(t.id)))).join(' ');
    const rings = [0.25, 0.5, 0.75, 1].map((k) => `<polygon class="n-ring" points="${poly(() => k)}"/>`).join('');
    const axes = themes.map((_, i) => `<line class="n-ring" x1="${cx}" y1="${cy}" x2="${f(pt(i, Rr)).split(',')[0]}" y2="${f(pt(i, Rr)).split(',')[1]}"/>`).join('');
    const data = poly((id) => Math.max(0.02, values[id] || 0));
    const tgt = poly((id) => (typeof targets[id] === 'number' ? Math.max(0.02, targets[id]) : Math.max(0.02, values[id] || 0)));
    const dots = themes.map((t, i) => { const [x, y] = pt(i, Rr * Math.max(0.02, values[t.id] || 0)); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" class="n-dot"/>`; }).join('');
    const labels = themes.map((t, i) => {
      const [x, y] = pt(i, Rr + 18);
      const c = Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / n);
      const sn = Math.sin(-Math.PI / 2 + (2 * Math.PI * i) / n);
      const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
      const dy = sn < -0.5 ? -2 : sn > 0.5 ? 12 : 4;
      const down = typeof targets[t.id] === 'number' && targets[t.id] < (values[t.id] || 0);
      return `<text class="n-rlabel ${down ? 'red' : ''}" x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}">${esc(t.label)}</text>`;
    }).join('');
    return `<svg viewBox="0 0 460 400" width="100%" role="img" aria-label="Radar des thèmes de ton flux" class="n-radar">${rings}${axes}<polygon class="n-rdata" points="${data}"/><polygon class="n-rtarget" points="${tgt}"/>${dots}${labels}</svg>`;
  }

  /* ---------- Agrégats ---------- */

  function aggregate(views) {
    const recent = (views || []).slice(-200);
    const acc = {}, words = {};
    for (const v of recent) {
      acc[v.handle] = (acc[v.handle] || 0) + 1;
      for (const w of v.words || []) words[w] = (words[w] || 0) + 1;
    }
    const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
    return { total: recent.length, accounts: top(acc, 5), words: top(words, 14) };
  }

  /* ---------- Tableau de bord de l'algo ---------- */

  function rowState(mp, tp) {
    const eff = tp == null ? mp : tp;
    const dir = tp == null || tp === mp ? 'same' : tp > mp ? 'up' : 'down';
    const label = tp == null ? `${mp} % · stable` : tp <= 3 ? `${mp} → bloqué` : `${mp} → ${tp} %`;
    return { eff, lo: Math.min(mp, eff), hi: Math.max(mp, eff), dir, label };
  }

  function algo(container) {
    let draft = { ...(S().state.settings.targets || {}) };
    const saved = () => S().state.settings.targets || {};
    const dirty = () => {
      const a = saved(), b = draft;
      return [...new Set([...Object.keys(a), ...Object.keys(b)])].some((k) => a[k] !== b[k]);
    };
    const measuredPct = (id) => pct(R().measured(S().state.profile.views).shares[id]);

    const view = () => {
      const st = S().state.settings;
      const themes = T().THEMES;
      const m = R().measured(S().state.profile.views);
      const agg = aggregate(S().state.profile.views);
      const rows = themes.map((t) => {
        const mp = pct(m.shares[t.id]);
        const tp = typeof draft[t.id] === 'number' ? Math.round(draft[t.id] * 100) : null;
        const r = rowState(mp, tp);
        return `<div class="n-trow" data-row="${t.id}">
          <div class="n-tname ${r.dir === 'down' ? 'red' : ''}">${esc(t.label)}</div>
          <div class="n-ttrack ${r.dir}" style="--lo:${r.lo};--hi:${r.hi}"><i class="n-tbase"></i><i class="n-tfill"></i><i class="n-tdelta"></i>
            <input type="range" min="0" max="100" step="1" value="${r.eff}" data-i="target" data-c="target" data-id="${t.id}" aria-label="Cible pour ${esc(t.label)}"></div>
          <div class="n-tval ${r.dir}" data-out="${t.id}">${r.label}</div>
          <div class="n-tbtns"><button class="n-sq ${r.dir === 'down' ? 'red' : ''}" data-a="dec" data-id="${t.id}" aria-label="Moins de ${esc(t.label)}">−</button><button class="n-sq ${r.dir === 'up' ? 'acc' : ''}" data-a="inc" data-id="${t.id}" aria-label="Plus de ${esc(t.label)}">+</button></div>
        </div>`;
      }).join('');
      const changed = Object.keys(draft).length;
      const accounts = agg.accounts.length
        ? agg.accounts.map(([h, n]) => {
            const hidden = st.hiddenAccounts.includes(h.toLowerCase());
            return `<div class="n-acc"><div class="n-avatar">${initial(h)}</div><div class="n-grow"><div class="n-accname">@${esc(h)}</div><div class="n-mini"><i style="width:${Math.round((n / agg.total) * 100)}%"></i></div></div><div class="n-pct">${Math.round((n / agg.total) * 100)} %</div><button class="n-btn sm ${hidden ? '' : 'danger'}" data-a="hide" data-v="${esc(h)}">${hidden ? 'Réafficher' : 'Masquer'}</button></div>`;
          }).join('')
        : '<p class="n-sub">Les comptes que tu regardes le plus apparaîtront ici.</p>';
      const kws = agg.words.length
        ? agg.words.map(([w]) => {
            const cls = st.favWords.includes(w) ? 'accent' : st.blockWords.includes(w) ? 'red' : 'violet';
            return `<button class="n-chip ${cls}" data-a="kw" data-v="${esc(w)}">${esc(w)}</button>`;
          }).join('')
        : '<p class="n-sub">Les mots-clés détectés apparaîtront après quelques vidéos.</p>';
      const empty = m.total < 5 ? `<p class="n-empty">Pas encore assez de vidéos vues (${m.total} sur 5 minimum). Regarde quelques vidéos dans Nocturne et le radar se remplira.</p>` : '';
      return `<div class="n-algo">
        <section class="n-card n-radar-card">
          <h3>Ce vers quoi penche ton flux</h3>
          <p class="n-sub">Thèmes détectés dans les ${m.total} dernières vidéos que tu as vues. Tout est calculé dans ton navigateur.</p>
          ${empty}
          ${radar(themes, m.shares, draft)}
          <div class="n-legend"><span><i class="n-sw violet"></i>Mesuré</span><span><i class="n-sw dash"></i>Cible réglée</span></div>
          <div class="n-note">Dans « Pour vous », Nocturne respecte ces cibles : quand un thème que tu montes manque dans ce que tu viens de voir, il prend une vidéo de ce thème dans le fil de X, ou fait un petit détour (3 à 6 vidéos d'une recherche X sur ce thème) puis revient à Pour vous. Les parts sont ramenées à 80 % au plus, pour garder toujours un peu du vrai Pour vous : Jeux 100 % et Actu 60 % donnent environ 50 % de jeux, 30 % d'actu et 20 % du fil de X.</div>
        </section>
        <section class="n-card n-themes-card">
          <div class="n-head"><div><h3>Ajuster les thèmes</h3><p class="n-sub">Déplace la cible : plus (vert) ou moins (rouge). Sous 3 %, le thème est exclu.</p></div></div>
          <div class="n-trows">${rows}</div>
          <div class="n-foot">
            <div class="n-sub">${changed ? changed + ' thème' + (changed > 1 ? 's' : '') + ' réglé' + (changed > 1 ? 's' : '') + '.' : 'Aucune cible : le flux suit tes goûts mesurés.'}</div>
            <div class="n-btns"><button class="n-btn" data-a="reset">Réinitialiser</button><button class="n-btn violet-solid" data-a="apply" ${dirty() ? '' : 'disabled'}>${dirty() ? 'Appliquer au flux' : 'Appliqué'}</button></div>
          </div>
        </section>
        <div class="n-side">
          <section class="n-card"><h3>Comptes qui dominent</h3>${accounts}</section>
          <section class="n-card"><h3>Mots-clés détectés</h3><div class="n-chips">${kws}</div><p class="n-sub">Clique pour passer un mot en favori (vert), bloqué (rouge) ou neutre.</p></section>
        </div>
      </div>`;
    };

    const setDraft = (id, v) => { draft[id] = Math.max(0, Math.min(1, v)); };

    const mountRef = mount(container, {
      view,
      keys: ['settings', 'profile'],
      input: {
        target(t) {
          const id = t.dataset.id;
          const v = Number(t.value);
          setDraft(id, v / 100);
          const r = rowState(measuredPct(id), v);
          const row = container.querySelector('[data-row="' + id + '"]');
          if (!row) return;
          const track = row.querySelector('.n-ttrack');
          track.style.setProperty('--lo', r.lo);
          track.style.setProperty('--hi', r.hi);
          track.className = 'n-ttrack ' + r.dir;
          const out = row.querySelector('[data-out]');
          out.textContent = r.label;
          out.className = 'n-tval ' + r.dir;
        },
      },
      change: { target() { mountRef.draw(); } },
      click: {
        inc(t) { const id = t.dataset.id; const base = typeof draft[id] === 'number' ? draft[id] : measuredPct(id) / 100; setDraft(id, Math.round((base + 0.05) * 100) / 100); mountRef.draw(); },
        dec(t) { const id = t.dataset.id; const base = typeof draft[id] === 'number' ? draft[id] : measuredPct(id) / 100; setDraft(id, Math.round((base - 0.05) * 100) / 100); mountRef.draw(); },
        apply() { S().set({ targets: { ...draft } }); },
        reset() { draft = {}; S().set({ targets: {} }); },
        hide(t) {
          const h = t.dataset.v.toLowerCase();
          const cur = S().state.settings.hiddenAccounts;
          S().set({ hiddenAccounts: cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h] });
        },
        kw(t) {
          const w = t.dataset.v;
          const s = S().state.settings;
          if (s.favWords.includes(w)) S().set({ favWords: s.favWords.filter((x) => x !== w), blockWords: uniqAdd(s.blockWords, w) });
          else if (s.blockWords.includes(w)) S().set({ blockWords: s.blockWords.filter((x) => x !== w) });
          else S().set({ favWords: uniqAdd(s.favWords, w) });
        },
      },
    });
    return mountRef;
  }

  /* ---------- Réglages ---------- */

  const LANGS = [['fr', 'Français'], ['en', 'Anglais'], ['es', 'Espagnol'], ['ar', 'Arabe'], ['de', 'Allemand'], ['it', 'Italien'], ['pt', 'Portugais']];
  const RATES = [0.75, 1, 1.25, 1.5, 2];
  const SHORTCUTS = [['Vidéo suivante', 'J ou ↓'], ['Vidéo précédente', 'K ou ↑'], ['Pause / lecture', 'Espace'], ['Reculer / avancer de 5 s', '← →'], ['Aller à 0 – 90 %', '0 – 9'], ['Volume', '+ / −'], ['Son coupé', 'M'], ['Vitesse', '< >'], ['Plein écran', 'F'], ['Aimer sur X', 'L'], ['Masquer le compte', 'H'], ['Chercher', '/'], ['Actualiser', 'R'], ['Ouvrir le post', 'O'], ['Angle suivant (chaîne)', 'C'], ['Reposter / retirer', 'P'], ['Discussion', 'D'], ['Traduire', 'T'], ['Fermer', 'Échap']];

  function settings(container, ctx = {}) {
    const addForm = (name, key, ph) => `<form class="n-add" data-s="${name}"><input class="n-input sm" name="w" data-keep="${key}" placeholder="${ph}" autocomplete="off"><button class="n-btn" type="submit">Ajouter</button></form>`;
    const show = { words: false, accounts: false }; // listes repliées derrière l'œil
    let hostInfo = null;
    const checkHost = () => NCT.send({ type: 'nct-companion', cmd: 'ping' }).then((r) => { hostInfo = r || { ok: false }; }).catch(() => { hostInfo = { ok: false }; }).then(() => mountRef && mountRef.draw());
    const mask = (key, label, items, action, shown, btn, form) => {
      const open = show[key];
      const list = open ? (items.length ? `<ul class="n-mlist">${items.map((x) => `<li><span>${esc(shown(x))}</span><button class="n-mbtn" data-a="${action}" data-v="${esc(x)}">${btn}</button></li>`).join('')}</ul>` : '<p class="n-sub">Liste vide.</p>') : '';
      return `<div class="n-field n-mask"><div class="n-mhead"><div class="n-label">${esc(label)} <b class="n-count">${items.length}</b></div><button class="n-eye ${open ? 'on' : ''}" data-a="eye" data-v="${key}" aria-pressed="${open}" aria-label="${open ? 'Cacher' : 'Afficher'} la liste">${ic(open ? 'eyeoff' : 'eye', 16)}</button></div>${list}${form}</div>`;
    };
    const rangeOut = (k, v) => (k === 'discover' ? v + ' %' : k === 'volume' ? v + ' %' : R().durationLabel(R().DURATIONS[v]));

    const view = () => {
      const s = S().state.settings;
      const di = Math.max(0, R().DURATIONS.indexOf(s.maxDuration));
      const rng = (k, min, max, val, label) => `<div class="n-field"><div class="n-flabel"><span>${esc(label)}</span><b data-out-k="${k}">${rangeOut(k, val)}</b></div><input class="n-range" type="range" min="${min}" max="${max}" step="1" value="${val}" style="--p:${((val - min) / (max - min)) * 100}%" data-i="range" data-c="range" data-k="${k}" aria-label="${esc(label)}"></div>`;
      const row = (label, ctrl, hint) => `<div class="n-srow"><div><div class="n-sl">${esc(label)}</div>${hint ? `<div class="n-hint">${esc(hint)}</div>` : ''}</div>${ctrl}</div>`;
      const mixes = [[10, 'Mes goûts'], [30, 'Équilibré'], [60, 'Découverte']];
      const mixOn = mixes.reduce((b, m) => (Math.abs(m[0] - s.discover) < Math.abs(b[0] - s.discover) ? m : b), mixes[1])[0];
      return `<div class="n-cols">
        <div class="n-col">
          <section class="n-card"><h3>1. Lecture</h3>
            ${row('Enchaîner les vidéos automatiquement', sw('auto', s.auto, 'Enchaînement automatique'))}
            ${row('Son au démarrage', sw('muted', !s.muted, 'Son au démarrage'))}
            ${rng('volume', 0, 100, Math.round(s.volume * 100), 'Volume')}
            <div class="n-field"><div class="n-flabel"><span>Vitesse</span></div>${seg('rate', s.rate, RATES.map((r) => [r, String(r).replace('.', ',') + '×']))}</div>
            ${rng('maxDuration', 0, R().DURATIONS.length - 1, di, 'Durée maximale d\'une vidéo')}
          </section>
          <section class="n-card"><h3>2. Ce que tu vois</h3>
            <div class="n-field"><div class="n-flabel"><span>Ton mélange</span></div><div class="n-seg">${mixes.map(([v, l]) => `<button class="${mixOn === v ? 'on' : ''}" data-a="set" data-k="discover" data-v="${v}" data-t="number">${l}</button>`).join('')}</div>
              <p class="n-hint">Mes goûts : surtout des vidéos proches de ce que tu regardes. Découverte : beaucoup de nouveautés.</p></div>
            ${row('Sans vidéos IA', sw('blockAI', s.blockAI, 'Sans vidéos IA'), 'Écarte les vidéos déclarées générées par IA (libellés de X, #aiart, Sora, Veo…).')}
            ${row('Sans violence', sw('noViolence', s.noViolence, 'Sans violence'), 'Écarte les vidéos que X marque comme sensibles et celles qui parlent de bagarres, agressions, armes, guerre, accidents graves…')}
            <div class="n-field"><div class="n-flabel"><span>Langues</span></div><div class="n-chips">${LANGS.map(([c, l]) => `<button class="n-chip ${s.languages.includes(c) ? 'accent' : ''}" data-a="lang" data-v="${c}">${l}</button>`).join('')}<button class="n-chip ${s.languages.length ? '' : 'accent'}" data-a="lang" data-v="*">Toutes</button></div></div>
            <div class="n-field"><div class="n-flabel"><span>Zone</span></div>
              <div class="n-chips"><button class="n-chip ${s.regions.length ? '' : 'accent'}" data-a="zone" data-v="">Partout</button>${T().REGIONS.map((r) => `<button class="n-chip ${s.regions.includes(r.id) ? 'accent' : ''}" data-a="zone" data-v="${r.id}">${esc(r.label)}</button>`).join('')}</div>
              ${s.regions.length ? seg('regionMode', s.regionMode, [['prefer', 'En priorité'], ['only', 'Seulement'], ['exclude', 'Sauf cette zone']]) : ''}
              <p class="n-hint">D'après les lieux cités dans le texte du tweet.</p></div>
          </section>
          <section class="n-card"><h3>3. Mots et comptes</h3>
            <div class="n-field"><div class="n-label">Mots favoris (mis en avant)</div><div class="n-chips">${s.favWords.map((w) => chip(w, 'accent', 'rmFav')).join('')}</div>${addForm('addFav', 'fav', 'Ajouter un mot favori')}</div>
            ${mask('words', 'Mots bloqués', s.blockWords, 'rmBlock', (w) => w, 'Retirer', addForm('addBlock', 'block', 'Bloquer un mot'))}
            ${mask('accounts', 'Comptes masqués', s.hiddenAccounts, 'rmHide', (h) => '@' + h, 'Démasquer', addForm('addHide', 'hide', 'Masquer un compte (@pseudo)'))}
          </section>
        </div>
        <div class="n-col">
          <section class="n-card"><h3>4. Affichage</h3>
            ${row('Fil au démarrage', seg('source', s.source === 'following' ? 'following' : 'foryou', [['foryou', 'Pour vous'], ['following', 'Abonnements']]))}
            ${row('Taille de la vidéo', seg('size', s.size, [['s', 'Petite'], ['m', 'Moyenne'], ['l', 'Grande']]))}
            ${row('Boutons d\'action', seg('side', s.side, [['left', 'À gauche'], ['right', 'À droite']]))}
            ${row('Colonnes latérales', sw('rails', s.rails, 'Afficher les colonnes latérales'))}
          </section>
          <section class="n-card"><h3>Raccourcis clavier</h3><div class="n-keys">${SHORTCUTS.map(([a, k]) => `<div class="n-krow"><span>${a}</span><kbd class="n-kbd">${k}</kbd></div>`).join('')}</div></section>
          <section class="n-card"><h3>Vérifications</h3>
            ${(() => { let pol = null; try { pol = navigator.getAutoplayPolicy ? navigator.getAutoplayPolicy('mediaelement') : null; } catch (_) {} return pol && pol !== 'allowed' ? '<div class="n-status-line"><i class="n-dot"></i>Firefox coupe le son automatique sur X. Pour ne plus avoir à cliquer : icône à gauche de l\'adresse (x.com) &gt; Lecture automatique &gt; Autoriser l\'audio et la vidéo.</div>' : ''; })()}
            <div class="n-status-line"><i class="n-dot ${hostInfo ? (hostInfo.ok ? 'ok' : '') : ''}"></i>${hostInfo ? (hostInfo.ok ? 'Module Nocturne Analyse installé : son analyse s\'affiche à droite du fil' : 'Module Nocturne Analyse : non installé (facultatif)') : 'Vérification…'}</div>
            ${ctx.openPage ? '<div class="n-btns"><button class="n-btn" data-a="diag">Diagnostic de X</button></div>' : ''}
          </section>
          <section class="n-card"><h3>Données</h3>
            <p class="n-hint">Tout est stocké dans ton navigateur. Rien n'est envoyé ailleurs.</p>
            <div class="n-btns"><button class="n-btn" data-a="clearProfile">Effacer ce que Nocturne a appris</button><button class="n-btn danger" data-a="resetSettings">Réinitialiser les réglages</button></div>
          </section>
        </div>
      </div>`;
    };

    const addTo = (key, normalizer) => (f) => {
      const v = normalizer(f.elements.w.value);
      f.reset();
      if (v) S().set({ [key]: uniqAdd(S().state.settings[key], v) });
      else mountRef.draw();
    };
    const lower = (x) => x.trim().toLowerCase();
    const handle = (x) => x.trim().toLowerCase().replace(/^@/, '');
    const rm = (key, fn = (x) => x) => (t) => S().set({ [key]: S().state.settings[key].filter((x) => fn(x) !== t.dataset.v) });

    const mountRef = mount(container, {
      view,
      keys: ['settings'],
      click: {
        set(t) { let v = t.dataset.v; if (t.dataset.t === 'number') v = Number(v); S().set({ [t.dataset.k]: v }); },
        toggle(t) { const k = t.dataset.k; S().set({ [k]: !S().state.settings[k] }); },
        region(t) { const s = S().state.settings; const v = t.dataset.v; S().set({ regions: s.regions.includes(v) ? s.regions.filter((x) => x !== v) : [...s.regions, v] }); },
        zone(t) { S().set({ regions: t.dataset.v ? [t.dataset.v] : [] }); },
        lang(t) {
          const s = S().state.settings;
          const v = t.dataset.v;
          if (v === '*') return S().set({ languages: [] });
          S().set({ languages: s.languages.includes(v) ? s.languages.filter((x) => x !== v) : [...s.languages, v] });
        },
        rmFav: rm('favWords'),
        rmBlock: rm('blockWords'),
        rmHide: rm('hiddenAccounts'),
        eye(t) { show[t.dataset.v] = !show[t.dataset.v]; mountRef.draw(); },
        diag() { ctx.openPage('diag'); },
        clearProfile() { if (confirm('Effacer ce que Nocturne a appris de ce que tu regardes ?')) S().clearProfile(); },
        resetSettings() { if (confirm('Remettre tous les réglages par défaut ?')) S().resetSettings(); },
      },
      input: {
        range(t) {
          const k = t.dataset.k, v = Number(t.value);
          const out = container.querySelector('[data-out-k="' + k + '"]');
          if (out) out.textContent = rangeOut(k, v);
          t.style.setProperty('--p', ((v - Number(t.min)) / (Number(t.max) - Number(t.min))) * 100 + '%');
        },
      },
      change: {
        range(t) {
          const k = t.dataset.k, v = Number(t.value);
          if (k === 'discover') S().set({ discover: v });
          else if (k === 'volume') S().set({ volume: v / 100 });
          else if (k === 'maxDuration') S().set({ maxDuration: R().DURATIONS[v] });
        },
      },
      submit: { addFav: addTo('favWords', lower), addBlock: addTo('blockWords', lower), addHide: addTo('hiddenAccounts', handle) },
    });
    checkHost();
    return mountRef;
  }

  /* ---------- Recherche (overlay) ---------- */

  function search(container, ctx) {
    const grad = (i) => ['repeating-linear-gradient(45deg,#242320 0 6px,#1C1B19 6px 12px)', 'repeating-linear-gradient(45deg,#2A2622 0 6px,#1D1B18 6px 12px)', 'repeating-linear-gradient(45deg,#22252A 0 6px,#1A1C1F 6px 12px)', 'repeating-linear-gradient(45deg,#272424 0 6px,#1D1B1B 6px 12px)'][i % 4];
    const view = () => {
      const s = S().state.settings;
      const items = ctx.items().slice(0, 24);
      const grid = items.length
        ? items.map((it, i) => `<button class="n-thumb ${ctx.played(it.id) ? 'seen' : ''}" data-a="play" data-v="${esc(it.id)}"><span class="n-thumb-img" style="background:${it.poster ? `center/cover url('${esc(it.poster)}'), ` : ''}${grad(i)}"></span><b>@${esc(it.handle)}</b><span class="n-sub">${esc((it.text || 'Vidéo').slice(0, 60))}</span></button>`).join('')
        : '<p class="n-sub">Aucune vidéo chargée pour l\'instant.</p>';
      return `<div class="n-search">
        <form class="n-bigsearch" data-s="go">${ic('search', 20)}<input name="q" data-keep="q" placeholder="Sujet ou #hashtag" autocomplete="off" autofocus><button class="n-btn primary" type="submit">Chercher</button></form>
        <div class="n-chips">
          <span class="n-chip accent solid">Vidéos</span>
          <button class="n-chip violet" data-a="cycleDur">Moins de ${esc(R().durationLabel(s.maxDuration))}</button>
          ${LANGS.slice(0, 3).map(([c, l]) => `<button class="n-chip ${s.languages.includes(c) ? 'violet' : ''}" data-a="lang" data-v="${c}">${l}</button>`).join('')}
          <span class="n-chip ${s.blockWords.length ? 'red' : ''}">Exclure : ${s.blockWords.length ? esc(s.blockWords.join(', ')) : 'rien'}</span>
        </div>
        <div class="n-cols">
          <section class="n-card"><h3>Sujets épinglés</h3><div class="n-chips">${s.topics.map((t) => `<span class="n-chip accent"><button class="n-link" data-a="topic" data-v="${esc(t)}">${esc(t)}</button><button class="n-x" data-a="rmTopic" data-v="${esc(t)}" aria-label="Retirer ${esc(t)}">×</button></span>`).join('') || '<span class="n-sub">Aucun sujet. Ajoute-en pour mélanger plusieurs recherches.</span>'}</div>
            <form class="n-add" data-s="addTopic"><input class="n-input sm" name="w" data-keep="topic" placeholder="Ajouter un sujet" autocomplete="off"><button class="n-btn" type="submit">Ajouter</button></form>
            <button class="n-btn primary" data-a="launchAll" ${s.topics.length ? '' : 'disabled'}>Lancer ${s.topics.length > 1 ? 'les ' + s.topics.length + ' sujets' : 'en flux'}</button></section>
          <section class="n-card"><h3>Recherches récentes</h3>${S().state.recent.map((q) => `<button class="n-rec" data-a="topic" data-v="${esc(q)}">${ic('search', 14)}${esc(q)}</button>`).join('') || '<span class="n-sub">Rien pour le moment.</span>'}</section>
        </div>
        <section><h3>Dans la file (${ctx.items().length})</h3><div class="n-grid">${grid}</div></section>
      </div>`;
    };
    const m = mount(container, {
      view,
      keys: ['settings', 'recent'],
      submit: {
        go(f) { const q = f.elements.q.value.trim(); if (q) ctx.launchSearch([q]); },
        addTopic(f) { const v = f.elements.w.value.trim(); f.reset(); if (v) S().set({ topics: uniqAdd(S().state.settings.topics, v) }); else m.draw(); },
      },
      click: {
        play(t) { ctx.playItem(t.dataset.v); },
        topic(t) { ctx.launchSearch([t.dataset.v]); },
        launchAll() { ctx.launchSearch(S().state.settings.topics); },
        addTopic(t) { S().set({ topics: uniqAdd(S().state.settings.topics, t.dataset.v) }); },
        rmTopic(t) { S().set({ topics: S().state.settings.topics.filter((x) => x !== t.dataset.v) }); },
        cycleDur() { const D = R().DURATIONS; const i = D.indexOf(S().state.settings.maxDuration); S().set({ maxDuration: D[(i + 1) % D.length] }); },
        lang(t) { const s = S().state.settings; const v = t.dataset.v; S().set({ languages: s.languages.includes(v) ? s.languages.filter((x) => x !== v) : [...s.languages, v] }); },
      },
    });
    return m;
  }

  /* ---------- Chaînes thématiques (overlay) ---------- */

  function channels(container, ctx) {
    const card = (c, cur) => `<section class="n-chcard ${cur && cur.id === c.id ? 'on' : ''}"><header>${ic(c.icon, 24)}<h3>${esc(c.label)}</h3>${c.custom ? `<button class="n-x" data-a="rmChan" data-v="${esc(c.id)}" aria-label="Supprimer la chaîne ${esc(c.label)}" style="margin-left:auto">×</button>` : ''}</header>
        ${c.long ? '<p class="n-sub">Vidéos longues autorisées : la durée max ne s\'applique pas ici.</p>' : ''}
        ${c.angles.map((a, i) => { const q = (S().state.quality || {})['chaine:' + c.id + '/' + i]; return `<button class="n-chang ${cur && cur.id === c.id && cur.angle === i ? 'on' : ''}" data-a="go" data-ch="${esc(c.id)}" data-v="${i}"><b>${esc(a.label)}</b><span>${esc(a.hint)}</span>${q && q.n >= 5 ? `<span class="n-qual"><i style="width:${Math.round((q.good / q.n) * 100)}%"></i></span><span class="n-sub">${Math.round((q.good / q.n) * 100)} % des vidéos marchent bien (${q.n} vues)</span>` : ''}</button>`; }).join('')}</section>`;
    const view = () => {
      const cur = ctx.current ? ctx.current() : null;
      const mine = NCT.channels.all().filter((c) => c.custom);
      return `<p class="n-sub" style="max-width:760px;margin-bottom:18px">Des fils prêts à l'emploi, construits avec la recherche de X. Choisis un angle : quand il ne donne plus rien de neuf, Nocturne passe tout seul au suivant (touche C pour changer toi-même). Tes filtres (IA, langues, mots, comptes) s'appliquent aussi ici.</p>
      <div class="n-chgrid">${NCT.channels.LIST.map((c) => card(c, cur)).join('')}</div>
      <h3 style="margin:28px 0 12px">Mes chaînes</h3>
      <div class="n-chgrid">${mine.map((c) => card(c, cur)).join('')}
        <section class="n-chcard"><header>${ic('plus', 24)}<h3>Créer une chaîne</h3></header>
          <p class="n-sub">Ta niche à toi : des mots ou hashtags, et / ou des comptes à suivre (concurrents, modèles). Pratique pour suivre ce qui sort dans une niche.</p>
          <form class="n-chform" data-s="addChan">
            <input class="n-input sm" name="label" data-keep="clabel" placeholder="Nom (ex. Ma niche)" autocomplete="off" maxlength="30">
            <input class="n-input sm" name="terms" placeholder="Mots ou #hashtags, séparés par des virgules" autocomplete="off">
            <input class="n-input sm" name="accounts" placeholder="Comptes à suivre : @un, @autre (facultatif)" autocomplete="off">
            <label class="n-check"><input type="checkbox" name="all"> Inclure les posts sans vidéo</label>
            <label class="n-check"><input type="checkbox" name="long"> Vidéos longues autorisées</label>
            <button class="n-btn primary" type="submit">Créer</button>
          </form>
          ${err ? `<p class="n-error">${esc(err)}</p>` : ''}
        </section></div>`;
    };
    let err = '';
    const split = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
    const m = mount(container, {
      view,
      keys: ['settings'],
      click: {
        go(t) { ctx.launchChannel(t.dataset.ch, Number(t.dataset.v)); },
        rmChan(t) { if (confirm('Supprimer cette chaîne ?')) S().set({ customChannels: S().state.settings.customChannels.filter((c) => c.id !== t.dataset.v) }); },
      },
      submit: {
        addChan(f) {
          const c = { id: 'perso-' + Date.now().toString(36), label: f.elements.label.value.trim() || 'Ma chaîne', terms: split(f.elements.terms.value), accounts: split(f.elements.accounts.value), videoOnly: !f.elements.all.checked, long: f.elements.long.checked };
          if (!NCT.channels.toChannel(c).angles.length) { err = 'Ajoute au moins un mot, un #hashtag ou un @compte valide.'; return m.draw(); }
          err = '';
          S().set({ customChannels: [...(S().state.settings.customChannels || []), c].slice(0, 20) });
        },
      },
    });
    return m;
  }

  /* ---------- Diagnostic : X a-t-il changé ? ---------- */

  function diag(container, ctx) {
    let d = ctx.diagnose ? ctx.diagnose() : null, host = null, copied = false;
    const icon = { ok: 'n-dot ok', warn: 'n-dot warn', bad: 'n-dot bad' };
    const report = () => JSON.stringify({ ...d, moduleAnalyse: !!(host && host.ok) }, null, 1);
    const view = () => `<div class="n-cols"><div class="n-col"><section class="n-card"><h3>Ce que Nocturne retrouve dans la page de X</h3>
        <p class="n-sub">Si une ligne passe au rouge alors que la page de X s'affiche bien, X a probablement changé son site : copie le rapport et envoie-le à Claude.</p>
        ${d ? `<table class="n-diag">${d.rows.map(([l, st, v]) => `<tr><td><i class="${icon[st]}"></i></td><td>${esc(l)}</td><td>${esc(v)}</td></tr>`).join('')}
          <tr><td><i class="n-dot ${host && host.ok ? 'ok' : ''}"></i></td><td>Module Nocturne Analyse (facultatif)</td><td>${host ? (host.ok ? 'installé' : 'absent') : '…'}</td></tr></table>` : '<p class="n-sub">Ouvre Nocturne sur x.com pour lancer le diagnostic.</p>'}
        <div class="n-btns"><button class="n-btn" data-a="again">Relancer</button><button class="n-btn primary" data-a="copy">${copied ? 'Copié ✓' : 'Copier le rapport'}</button></div></section></div>
      <div class="n-col"><section class="n-card"><h3>Session</h3><div class="n-pre">${esc(d ? JSON.stringify(d.session, null, 1) : '')}</div></section></div></div>`;
    const m = mount(container, {
      view,
      click: {
        again() { d = ctx.diagnose ? ctx.diagnose() : null; copied = false; m.draw(); },
        async copy() { try { await navigator.clipboard.writeText(report()); copied = true; } catch (_) { copied = false; } m.draw(); },
      },
    });
    NCT.send({ type: 'nct-companion', cmd: 'ping' }).then((r) => { host = r || { ok: false }; m.draw(); }).catch(() => {});
    return m;
  }

  NCT.panels = {
    algo,
    settings,
    search,
    channels,
    diag,
    titles: { algo: "Tableau de bord de l'algo", settings: 'Réglages et filtres', search: 'Recherche et sujets', channels: 'Chaînes thématiques', diag: 'Diagnostic' },
    aggregate,
    rowState,
    radar,
  };
})();
