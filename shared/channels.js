/* Chaînes thématiques : des fils prêts à l'emploi, construits avec la recherche de X.
 * Chaque chaîne a plusieurs « angles » (indés, tendances, sorties…). Quand un angle ne donne plus rien de neuf,
 * Nocturne passe tout seul au suivant. Les filtres locaux (IA, langues, mots, comptes) s'appliquent comme partout.
 * f : 'live' = les plus récents, 'top' = les plus populaires (onglet « À la une » de X). */
(() => {
  'use strict';
  const NCT = (globalThis.NCT = globalThis.NCT || {});
  const V = ' filter:native_video';
  const GAME_TAGS = '(#indiedev OR #gamedev OR #screenshotsaturday OR #indiegame OR #devlog OR #madewithunity OR #godotengine OR #madewithunreal OR #pixelart)';

  const LIST = [
    {
      id: 'jeux', label: 'Jeux vidéo', short: 'Jeux', icon: 'gamepad',
      angles: [
        { label: 'Indés & devlogs', hint: 'Petits studios et devs solo qui montrent leur jeu', q: GAME_TAGS + V + ' -filter:replies min_faves:10', f: 'live' },
        { label: 'Pépites indé', hint: 'Les projets indés qui marchent le mieux', q: GAME_TAGS + V + ' min_faves:300', f: 'top' },
        { label: 'Annonces & trailers', hint: 'Nouveaux jeux, dates de sortie, bandes-annonces', q: '(trailer OR "reveal trailer" OR "release date" OR "out now" OR "bande-annonce" OR "wishlist") (game OR jeu OR steam OR ps5 OR xbox OR nintendo OR switch)' + V + ' min_faves:100', f: 'live' },
        { label: 'Tendances', hint: 'Ce qui tourne le plus en ce moment', q: '(gaming OR gameplay OR "jeu vidéo" OR speedrun OR esport OR "video game")' + V + ' min_faves:2000', f: 'top' },
      ],
    },
    {
      id: 'films', label: 'Films & séries', short: 'Films', icon: 'film',
      angles: [
        { label: 'Bandes-annonces', hint: 'Les nouveaux trailers de films et de séries', q: '(trailer OR "bande-annonce" OR teaser) (film OR movie OR série OR series OR netflix OR cinéma OR cinema)' + V + ' min_faves:200', f: 'live' },
        { label: 'Analyses & coulisses', hint: 'Video essays, making-of, décryptages', q: '("video essay" OR analyse OR "behind the scenes" OR "making of" OR coulisses OR "breakdown") (film OR movie OR cinéma OR cinema OR série)' + V + ' min_faves:50', f: 'top' },
        { label: 'Tendances', hint: 'Les scènes et extraits qui tournent', q: '(film OR movie OR cinéma OR série OR "scène culte" OR scene)' + V + ' min_faves:5000', f: 'top' },
      ],
    },
    {
      id: 'musique', label: 'Musique', short: 'Musique', icon: 'music',
      angles: [
        { label: 'Nouveautés', hint: 'Nouveaux sons et clips', q: '("new single" OR "new music" OR "out now" OR "nouveau son" OR "nouveau clip" OR "clip officiel" OR "official video")' + V + ' min_faves:100', f: 'live' },
        { label: 'Lives & sessions', hint: 'Concerts, sessions acoustiques, Tiny Desk, COLORS…', q: '("live session" OR "tiny desk" OR "colors show" OR "en live" OR "live at" OR concert OR acoustic OR "boiler room")' + V + ' min_faves:200', f: 'top' },
        { label: 'Artistes indé', hint: 'Découvertes et artistes sans label', q: '(#newmusic OR #indiemusic OR "independent artist" OR "artiste indépendant" OR "bedroom producer" OR "unsigned artist")' + V + ' min_faves:20', f: 'live' },
        { label: 'Tendances', hint: 'Ce qui tourne le plus', q: '(music OR musique OR song OR chanson OR rap OR rock OR "live")' + V + ' min_faves:5000', f: 'top' },
      ],
    },
    {
      id: 'devops', label: 'DevOps & tech', short: 'DevOps', icon: 'terminal', long: true,
      angles: [
        { label: 'Explications', hint: 'Tutos et explications : Kubernetes, Docker, Terraform, CI/CD…', q: '(kubernetes OR k8s OR docker OR terraform OR ansible OR devops OR "ci/cd" OR linux OR "github actions" OR sre OR observability) (explained OR tutorial OR tuto OR "how to" OR "in 100 seconds" OR expliqué OR demo OR démo)' + V, f: 'top' },
        { label: 'Conférences', hint: 'Talks de KubeCon, FOSDEM, Devoxx…', q: '(kubecon OR fosdem OR devoxx OR "conference talk" OR keynote OR "re:invent" OR "devops days" OR "platform engineering")' + V, f: 'top' },
        { label: 'Actus', hint: 'Nouveautés cloud, homelab, outils', q: '(devops OR kubernetes OR cloud OR aws OR azure OR gcp OR homelab OR selfhosted OR "open source")' + V + ' min_faves:50', f: 'live' },
      ],
    },
    {
      id: 'docs', label: 'Documentaires', short: 'Docs', icon: 'doc', long: true,
      angles: [
        { label: 'Documentaires', hint: 'Reportages et docs, à la ARTE', q: '(documentaire OR documentary OR reportage OR "doc complet" OR "full documentary" OR arte)' + V + ' min_faves:100', f: 'top' },
        { label: 'Vulgarisation', hint: 'Science, histoire, explications', q: '(vulgarisation OR science OR histoire OR history OR astronomie OR physique OR "le saviez-vous" OR explained OR expliqué)' + V + ' min_faves:500', f: 'top' },
        { label: 'Récents', hint: 'Les derniers documentaires publiés', q: '(documentaire OR documentary OR reportage OR arte)' + V + ' min_faves:20', f: 'live' },
      ],
    },
  ];

  // Chaînes perso : tes mots / hashtags et / ou des comptes à suivre (réglage customChannels).
  const quote = (t) => (/\s/.test(t) ? '"' + t.replace(/"/g, '') + '"' : t);
  const clean = (list, re) => (Array.isArray(list) ? list : []).map((x) => String(x).trim()).filter((x) => x && re.test(x)).slice(0, 20);
  function toChannel(c) {
    const terms = clean(c.terms, /^[#@]?[\p{L}\p{N}_' .-]{1,40}$/u).map(quote);
    const accounts = clean(c.accounts, /^@?[A-Za-z0-9_]{1,15}$/).map((h) => h.replace(/^@/, ''));
    const v = c.videoOnly === false ? '' : V;
    const angles = [];
    if (terms.length) {
      const q = (terms.length > 1 ? '(' + terms.join(' OR ') + ')' : terms[0]) + v;
      angles.push({ label: 'Récents', hint: 'Les derniers posts de ta niche', q: q + ' -filter:replies', f: 'live' });
      angles.push({ label: 'Populaires', hint: 'Ce qui marche le mieux dans ta niche', q: q + ' min_faves:30', f: 'top' });
    }
    if (accounts.length) {
      const q = (accounts.length > 1 ? '(' + accounts.map((h) => 'from:' + h).join(' OR ') + ')' : 'from:' + accounts[0]) + v;
      angles.push({ label: 'Comptes suivis', hint: accounts.map((h) => '@' + h).join(', '), q, f: 'live' });
    }
    return { id: String(c.id), label: String(c.label || 'Ma chaîne').slice(0, 30), short: String(c.label || 'Perso').slice(0, 12), icon: 'tag', custom: true, long: !!c.long, angles, terms, accounts };
  }
  const custom = () => ((NCT.store && NCT.store.state.settings.customChannels) || []).map(toChannel).filter((c) => c.angles.length);
  const all = () => [...LIST, ...custom()];
  const get = (id) => all().find((c) => c.id === id) || null;
  const angle = (id, i) => { const c = get(id); return c ? c.angles[((i % c.angles.length) + c.angles.length) % c.angles.length] : null; };

  NCT.channels = { LIST, all, get, angle, toChannel };
})();
