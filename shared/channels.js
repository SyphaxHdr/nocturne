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
        { label: 'Explications', hint: 'Kubernetes, Docker, Terraform, CI/CD, Linux…', q: '(kubernetes OR k8s OR docker OR terraform OR ansible OR devops OR "ci/cd" OR linux OR "github actions" OR sre OR homelab)' + V, f: 'top' },
        { label: 'Récents', hint: 'Les dernières vidéos DevOps et cloud', q: '(kubernetes OR docker OR terraform OR devops OR linux OR cloud OR aws OR azure OR homelab OR selfhosted)' + V + ' min_faves:5', f: 'live' },
        { label: 'Conférences', hint: 'Talks de KubeCon, FOSDEM, Devoxx…', q: '(kubecon OR fosdem OR devoxx OR "conference talk" OR keynote OR "re:invent" OR "devops days" OR "platform engineering")' + V, f: 'top' },
      ],
    },
    {
      id: 'docs', label: 'Documentaires', short: 'Docs', icon: 'doc', long: true,
      angles: [
        { label: 'Documentaires', hint: 'Reportages et docs, à la ARTE', q: '(documentaire OR documentary OR reportage OR "doc complet" OR "full documentary" OR arte)' + V + ' min_faves:20', f: 'top' },
        { label: 'Vulgarisation', hint: 'Science, histoire, explications', q: '(vulgarisation OR histoire OR history OR "le saviez-vous" OR explained OR expliqué OR "did you know")' + V + ' min_faves:200', f: 'top' },
        { label: 'Récents', hint: 'Les derniers documentaires publiés', q: '(documentaire OR documentary OR reportage OR arte)' + V, f: 'live' },
      ],
    },
    {
      id: 'science', label: 'Science & espace', short: 'Science', icon: 'spark',
      angles: [
        { label: 'Espace', hint: 'Fusées, télescopes, astronomie', q: '(nasa OR spacex OR esa OR fusée OR rocket OR telescope OR astronomie OR astronomy OR "james webb")' + V + ' min_faves:100', f: 'top' },
        { label: 'Expériences', hint: 'Physique, chimie, expériences étonnantes', q: '(science OR physique OR physics OR chimie OR chemistry OR experiment OR expérience)' + V + ' min_faves:300', f: 'top' },
        { label: 'Récents', hint: 'Les dernières vidéos de science', q: '(science OR nasa OR spacex OR astronomie OR physique)' + V + ' min_faves:10', f: 'live' },
      ],
    },
    {
      id: 'sport', label: 'Sport', short: 'Sport', icon: 'play',
      angles: [
        { label: 'Actions', hint: 'Les plus belles actions', q: '(goal OR but OR highlights OR "what a" OR incroyable OR skills)' + V + ' min_faves:2000', f: 'top' },
        { label: 'Foot', hint: 'Football', q: '(football OR foot OR ligue1 OR "champions league" OR "ligue des champions")' + V + ' min_faves:500', f: 'top' },
        { label: 'Récents', hint: 'Les derniers moments sportifs', q: '(sport OR football OR nba OR tennis OR f1 OR rugby)' + V + ' min_faves:50', f: 'live' },
      ],
    },
    {
      id: 'humour', label: 'Humour', short: 'Humour', icon: 'like',
      angles: [
        { label: 'Populaires', hint: 'Ce qui fait rire en ce moment', q: '(mdr OR ptdr OR lol OR humour OR sketch OR funny OR "😂")' + V + ' min_faves:1000', f: 'top' },
        { label: 'Récents', hint: 'Les dernières vidéos drôles', q: '(mdr OR ptdr OR humour OR sketch OR funny)' + V + ' min_faves:50', f: 'live' },
      ],
    },
    {
      id: 'cuisine', label: 'Cuisine', short: 'Cuisine', icon: 'bulb',
      angles: [
        { label: 'Recettes', hint: 'Recettes en vidéo', q: '(recette OR recipe OR cuisine OR cooking OR "fait maison")' + V + ' min_faves:100', f: 'top' },
        { label: 'Récents', hint: 'Les dernières recettes', q: '(recette OR recipe OR cuisine OR cooking)' + V + ' min_faves:5', f: 'live' },
      ],
    },
    {
      id: 'nature', label: 'Animaux & nature', short: 'Nature', icon: 'globe',
      angles: [
        { label: 'Animaux', hint: 'Animaux, nature sauvage', q: '(animaux OR animals OR wildlife OR chat OR cat OR chien OR dog OR nature)' + V + ' min_faves:1000', f: 'top' },
        { label: 'Paysages', hint: 'Voyages et paysages', q: '(paysage OR landscape OR voyage OR travel OR montagne OR mountains OR océan OR ocean)' + V + ' min_faves:500', f: 'top' },
      ],
    },
    {
      id: 'art', label: 'Art & création', short: 'Art', icon: 'tag',
      angles: [
        { label: 'Processus', hint: 'Dessin, peinture, 3D, animation en train de se faire', q: '(drawing OR dessin OR painting OR peinture OR blender OR "3d art" OR animation OR timelapse OR "speed paint" OR pixelart)' + V + ' min_faves:200', f: 'top' },
        { label: 'Récents', hint: 'Les dernières créations', q: '(drawing OR dessin OR painting OR animation OR blender OR pixelart)' + V + ' min_faves:10', f: 'live' },
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

  // Recherches utilisées par le mélange de « Pour vous » quand un thème du tableau de bord manque (voir rank.lacking).
  const THEME_CH = { gaming: ['jeux'], tech: ['devops'], music: ['musique'], art: ['art', 'films'], humor: ['humour'], sport: ['sport'], science: ['science', 'docs'] };
  const NEWS = '(actu OR actualité OR "breaking news" OR "flash info" OR "dernière minute" OR urgent OR reportage OR breaking OR news)';
  const POL = '(politique OR "assemblée nationale" OR gouvernement OR élection OR débat OR ministre OR politics OR election OR parliament)';
  const THEME_Q = {
    news: [{ label: 'Actu', q: NEWS + V + ' min_faves:300', f: 'top' }, { label: 'Actu récente', q: NEWS + V + ' min_faves:30', f: 'live' }],
    politics: [{ label: 'Politique', q: POL + V + ' min_faves:300', f: 'top' }, { label: 'Politique récente', q: POL + V + ' min_faves:30', f: 'live' }],
  };
  function forTheme(theme) {
    if (THEME_Q[theme]) return THEME_Q[theme];
    const out = [];
    for (const id of THEME_CH[theme] || []) { const c = get(id); if (c) out.push(...c.angles); }
    return out;
  }

  NCT.channels = { LIST, all, get, angle, toChannel, forTheme };
})();
