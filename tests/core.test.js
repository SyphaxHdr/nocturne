const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Charge les modules partagés dans un contexte isolé (comme dans un content script).
function load(files) {
  const ctx = vm.createContext({ console });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
  return ctx.NCT;
}
const NCT = load(['shared/icons.js', 'shared/themes.js', 'shared/store.js', 'shared/rank.js', 'shared/channels.js', 'shared/observe.js']);
const { themes: T, rank: R, channels: C, observe: O } = NCT;

const mk = (text, handle = 'someone', extra = {}) => ({
  id: String(Math.random()),
  handle,
  text,
  lang: 'fr',
  themes: T.classify(text),
  words: T.tokens(text),
  norm: T.norm(text + ' ' + handle),
  ...extra,
});
const st = (o = {}) => ({ discover: 0, favWords: [], blockWords: [], hiddenAccounts: [], targets: {}, languages: [], ...o });
const ctx = (settings, shares = {}) => ({ settings, shares, feedback: { handles: {}, words: {}, themes: {} } });

test('classify détecte les thèmes sans tenir compte des accents ni de la casse', () => {
  assert.deepEqual(Array.from(T.classify('Mon premier DEVLOG de jeu vidéo')), ['gaming']);
  assert.ok(T.classify('Un match de FOOTBALL ce soir').includes('sport'));
  assert.deepEqual(Array.from(T.classify('rien de particulier ici')), []);
});

test('classify ne confond pas les mots entiers et les morceaux de mots', () => {
  assert.ok(!T.classify('un enjeu important').includes('gaming'));
});

test('tokens retire les mots vides, les nombres et les doublons', () => {
  const t = T.tokens('Le pipeline pipeline avec 2024 et les tests');
  assert.deepEqual(Array.from(t), ['pipeline', 'tests']);
});

test('measured calcule la part de vidéos par thème', () => {
  const views = [{ themes: ['gaming'] }, { themes: ['gaming', 'music'] }, { themes: [] }, { themes: ['music'] }];
  const m = R.measured(views);
  assert.equal(m.total, 4);
  assert.equal(m.shares.gaming, 0.5);
  assert.equal(m.shares.music, 0.5);
  assert.equal(m.shares.sport, 0);
});

test('excluded : mots bloqués, comptes masqués, cibles ≤ 3 % et langues', () => {
  assert.ok(R.excluded(mk('une bagarre filmée'), st({ blockWords: ['bagarre'] })));
  assert.ok(R.excluded(mk('salut', 'Bob'), st({ hiddenAccounts: ['bob'] })));
  assert.ok(R.excluded(mk('une violence extrême'), st({ targets: { violence: 0.02 } })));
  assert.ok(!R.excluded(mk('une violence extrême'), st({ targets: { violence: 0.4 } })));
  assert.ok(R.excluded(mk('hello', 'x', { lang: 'es' }), st({ languages: ['fr', 'en'] })));
  assert.ok(!R.excluded(mk('hello', 'x', { lang: 'und' }), st({ languages: ['fr'] })));
  assert.ok(!R.excluded(mk('hello', 'x', { lang: 'qme' }), st({ languages: ['fr'] })));
  assert.ok(!R.excluded(mk('salut', 'x', { lang: 'fr' }), st({ languages: ['fr'] })));
});

test('pick favorise les mots favoris et les thèmes à augmenter (sans découverte)', () => {
  const a = mk('une recette de cuisine');
  const b = mk('mon devlog de jeu vidéo');
  assert.equal(R.pick([a, b], ctx(st({ favWords: ['devlog'] }))), b);
  assert.equal(R.pick([a, b], ctx(st({ targets: { gaming: 0.9 } }), { gaming: 0.1 })), b);
  // à égalité, on garde l'ordre naturel de la timeline
  assert.equal(R.pick([a, mk('autre chose')], ctx(st())), a);
});

test('pick avec 100 % de découverte choisit au hasard dans la fenêtre', () => {
  const items = [mk('un'), mk('deux'), mk('trois')];
  const got = R.pick(items, ctx(st({ discover: 100 })), () => 0.99);
  assert.equal(got, items[2]);
});

test('buildSearchQuery garde le texte tapé, sans filtres cachés', () => {
  assert.equal(R.buildSearchQuery(['17 octobre'], st({ blockWords: ['x'], languages: ['fr'], blockAI: true })), '17 octobre filter:native_video');
  assert.equal(R.buildSearchQuery(['17 octobre'], st(), { video: false }), '17 octobre');
  assert.equal(R.buildSearchQuery(['synthwave', 'pixel art'], st()), '(synthwave OR "pixel art") filter:native_video');
  assert.ok(R.searchUrl('a b').startsWith('https://x.com/search?q=a%20b&'));
  assert.ok(R.searchUrl('a', 'video').endsWith('&f=video'));
});

test('chaînes : identifiants uniques, angles valides, uniquement des vidéos', () => {
  const ids = C.LIST.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of C.LIST) {
    assert.ok(c.angles.length >= 2, c.id);
    for (const a of c.angles) {
      assert.ok(a.q.includes('filter:native_video'), c.id + ' ' + a.label);
      assert.ok(['live', 'top'].includes(a.f));
      assert.ok(a.q.length < 480, 'requête trop longue pour X : ' + a.label);
      assert.equal((a.q.match(/\(/g) || []).length, (a.q.match(/\)/g) || []).length, 'parenthèses : ' + a.label);
      assert.equal((a.q.match(/"/g) || []).length % 2, 0, 'guillemets : ' + a.label);
      assert.ok(a.label && a.hint);
    }
  }
  assert.ok(C.get('jeux') && !C.get('nope'));
  const n = C.get('jeux').angles.length;
  assert.equal(C.angle('jeux', n), C.get('jeux').angles[0]); // les angles bouclent
  assert.equal(C.angle('jeux', -1), C.get('jeux').angles[n - 1]);
  assert.ok(C.get('docs').long && C.get('devops').long && !C.get('jeux').long);
});

test('durationLabel', () => {
  assert.equal(R.durationLabel(0), 'Illimitée');
  assert.equal(R.durationLabel(30), '30 s');
  assert.equal(R.durationLabel(120), '2 min');
});

test('isAI repère les vidéos générées par IA et laisse passer le reste', () => {
  const ai = ['Made with AI #aiart', 'Clip généré par IA', 'Test de Veo 3 sur ce prompt', 'ai-generated cat', 'Midjourney video', 'Nouveau #aiart du jour'];
  for (const t of ai) assert.ok(R.isAI(mk(t)), t);
  const ok = ['Mon chat joue au piano', 'Sora joue à Kingdom Hearts', 'Un défilé de mode sur le runway', 'Il a said hello', "j'ai vu ça hier", 'Nouvelle IA de Google : ce que ça change', 'AI news: the model is out #AI', "J'ai fini mon devlog, l'ai-je dit ?", 'Il y a un mail ici'];
  for (const t of ok) assert.ok(!R.isAI(mk(t)), t);
  assert.ok(R.excluded(mk('Made with AI'), st({ blockAI: true })));
  assert.ok(!R.excluded(mk('Made with AI'), st({ blockAI: false })));
  assert.ok(R.isAI({ ...mk('rien'), ai: true }));
});

test('regions détecte les lieux et le filtre de zone agit', () => {
  assert.deepEqual(Array.from(T.regions('Incendie à Marseille, la préfecture réagit')), ['france']);
  assert.ok(T.regions('Trump à la Maison Blanche').includes('usa'));
  assert.deepEqual(Array.from(T.regions('un chat qui dort')), []);
  const mkr = (text, lang = 'fr') => ({ ...mk(text, 'x', { lang }), regions: T.regions(text) });
  const fr = mkr('Marseille ce soir'), us = mkr('Trump à Washington', 'en'), none = mkr('un chat mignon', 'en'), frLang = mkr('un chat mignon');
  const only = st({ regions: ['france'], regionMode: 'only' });
  assert.ok(!R.excluded(fr, only));
  assert.ok(R.excluded(us, only));
  assert.ok(R.excluded(none, only));
  assert.ok(!R.excluded(none, { ...only, regionKeepUnknown: true }));
  assert.ok(!R.excluded(frLang, only), 'langue fr sans autre lieu = France');
  assert.ok(R.excluded(fr, st({ regions: ['france'], regionMode: 'exclude' })));
  assert.ok(!R.excluded(us, st({ regions: ['france'], regionMode: 'exclude' })));
  const pref = st({ regions: ['france'], regionMode: 'prefer' });
  assert.equal(R.pick([us, fr], ctx(pref)), fr);
});

test('lecture des compteurs de X (aria-label, nombres abrégés)', () => {
  assert.deepEqual({ ...O.parseMetrics("12 réponses, 48 reposts, 530 J'aime, 40 signets, 21033 vues") }, { views: 21033, likes: 530, reposts: 48, replies: 12, bookmarks: 40 });
  assert.deepEqual({ ...O.parseMetrics('1,204 replies, 3,511 reposts, 52,001 likes, 900 bookmarks, 2,345,678 views') }, { views: 2345678, likes: 52001, reposts: 3511, replies: 1204, bookmarks: 900 });
  assert.deepEqual({ ...O.parseMetrics("21\u202f033 vues, 7 J'aime") }, { views: 21033, likes: 7, reposts: null, replies: null, bookmarks: null });
  assert.equal(O.parseCount('12,4 k'), 12400);
  assert.equal(O.parseCount('1.2M'), 1200000);
  assert.equal(O.parseCount('1 234'), 1234);
  assert.equal(O.parseCount('987'), 987);
  assert.equal(O.parseCount('abc'), null);
});

test('caractéristiques du texte : hashtags, mentions, emojis, liens', () => {
  const f = O.textFeatures('Nouveau devlog 🔥🎮 #IndieDev #gamedev @ami https://t.co/abc store.steampowered.com/app/1');
  assert.deepEqual(Array.from(f.hashtags), ['indiedev', 'gamedev']);
  assert.deepEqual(Array.from(f.mentions), ['ami']);
  assert.equal(f.emojis, 2);
  assert.equal(f.links, 2);
  assert.equal(O.ratioOf(1920, 1080), 'horizontal');
  assert.equal(O.ratioOf(720, 1280), 'vertical');
  assert.equal(O.ratioOf(1000, 1000), 'carre');
});

test('chaînes perso : requêtes construites et protégées', () => {
  const c = C.toChannel({ id: 'perso-1', label: 'Ma niche', terms: ['#roguelike', 'pixel art', 'bad"); DROP', ''], accounts: ['@dev_solo', 'pas un pseudo !'] });
  assert.equal(c.angles.length, 3);
  assert.equal(c.angles[0].q, '(#roguelike OR "pixel art") filter:native_video -filter:replies');
  assert.equal(c.angles[1].f, 'top');
  assert.equal(c.angles[2].q, 'from:dev_solo filter:native_video');
  assert.equal(C.toChannel({ id: 'x', label: 'vide', terms: [], accounts: [] }).angles.length, 0);
});

test('verdict automatique selon les chiffres', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');
  const h = (n) => new Date(now - n * 3600000).toISOString();
  assert.equal(R.verdict({ views: 2500000, likes: 90000, reposts: 8000, replies: 1200 }, h(10), now).level, 3);
  assert.equal(R.verdict({ views: 40000, likes: 1500, reposts: 100, replies: 40 }, h(20), now).level, 2);
  assert.equal(R.verdict({ views: 3000, likes: 40, reposts: 2, replies: 1 }, h(5), now).level, 1);
  assert.equal(R.verdict({ views: 300, likes: 2, reposts: 0, replies: 0 }, h(5), now).level, 0);
  assert.equal(R.verdict({ views: null, likes: 1500, reposts: 10, replies: 3 }, null, now).level, 2);
  assert.equal(R.verdict(null), null);
});

test('filtre sans violence', () => {
  const v = mk('Grosse bagarre dans la rue');
  assert.equal(R.reason(v, st({ noViolence: true })), 'violence');
  assert.equal(R.reason(v, st({ noViolence: false })), null);
});

test('sans violence : mots ambigus et avertissement de X', () => {
  const on = st({ noViolence: true });
  assert.equal(R.reason(mk('Il a été tabassé devant chez lui'), on), 'violence');
  assert.equal(R.reason(mk('Police violence in the street'), on), 'violence');
  assert.equal(R.reason(mk('âmes sensibles s’abstenir'), on), 'violence');
  assert.equal(R.reason(mk('Accident spectaculaire, la police sur place'), on), 'violence');
  assert.equal(R.reason(mk('Un boss fight incroyable dans mon jeu'), on), null); // jeu vidéo : « fight » ne compte pas
  assert.equal(R.reason(mk('new kill streak record in fortnite'), on), null);
  assert.equal(R.reason(mk('Recette du gâteau au chocolat'), on), null);
  assert.equal(R.reason(mk('Une vidéo', 'x', { sensitive: true }), on), 'violence'); // X l'a marquée sensible
  assert.equal(R.reason(mk('Une vidéo', 'x', { sensitive: true }), st()), null);
});

test('mélange du tableau de bord : parts voulues et thème qui manque', () => {
  const w = R.wanted({ gaming: 1, news: 0.6, politics: 0.02 });
  assert.equal(Math.round(w.gaming * 1000), 500); // ramené à 80 % au total : 20 % restent au fil de X
  assert.equal(Math.round(w.news * 1000), 300);
  assert.equal(Math.round(R.wanted({ music: 0.4 }).music * 100), 40);
  assert.ok(!('politics' in w)); // sous 3 % : thème exclu, pas visé
  assert.equal(R.lacking({ gaming: 1, news: 0.6 }, []).id, 'gaming');
  const log = [['news'], ['news'], ['news'], ['news'], ['gaming']];
  assert.equal(R.lacking({ gaming: 1, news: 0.6 }, log).id, 'gaming');
  assert.equal(R.lacking({ gaming: 1, news: 0.6 }, [['gaming'], ['gaming'], ['gaming'], ['news']], 0.15), null); // écart trop petit
  assert.equal(R.lacking({}, log), null);
  assert.ok(C.forTheme('gaming').length >= 2);
  assert.ok(C.forTheme('news').length >= 1);
  assert.equal(C.forTheme('violence').length, 0);
});
