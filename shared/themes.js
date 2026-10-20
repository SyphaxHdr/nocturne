/* Thèmes, normalisation de texte et extraction de mots-clés.
 * Tout se fait en local : aucune donnée ne quitte le navigateur. */
(() => {
  'use strict';
  const NCT = (globalThis.NCT = globalThis.NCT || {});

  // Minuscules, sans accents ni ponctuation, entouré d'espaces (pour chercher des mots entiers).
  const norm = (s) =>
    ' ' +
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim() +
    ' ';

  const RAW = [
    { id: 'gaming', label: 'Jeux vidéo', words: ['jeu video', 'jeux video', 'jeu', 'jeux', 'game', 'games', 'gaming', 'gamer', 'gamedev', 'devlog', 'indie', 'speedrun', 'steam', 'playstation', 'ps5', 'xbox', 'nintendo', 'fortnite', 'minecraft', 'twitch', 'unity', 'unreal', 'godot', 'rpg', 'fps', 'esport', 'roguelike', 'boss fight', 'pixel art'] },
    { id: 'tech', label: 'Tech et dev', words: ['dev', 'developpeur', 'developer', 'code', 'coding', 'programmation', 'programming', 'devops', 'linux', 'github', 'docker', 'kubernetes', 'python', 'javascript', 'rust', 'api', 'cloud', 'serveur', 'server', 'ia', 'ai', 'llm', 'openai', 'robot', 'cyber', 'hack', 'open source', 'opensource', 'startup', 'logiciel', 'software'] },
    { id: 'music', label: 'Musique', words: ['musique', 'music', 'chanson', 'song', 'album', 'concert', 'rap', 'rock', 'metal', 'synthwave', 'remix', 'dj', 'guitare', 'guitar', 'piano', 'playlist', 'beat', 'live set', 'chanteur', 'singer', 'instrumental'] },
    { id: 'art', label: 'Art et création', words: ['art', 'dessin', 'drawing', 'illustration', 'animation', 'peinture', 'painting', 'sketch', 'blender', 'design', 'photo', 'photographie', 'sculpture', 'pixel', 'artwork', 'cinema', 'film', 'court metrage', '3d'] },
    { id: 'humor', label: 'Humour', words: ['meme', 'memes', 'lol', 'mdr', 'ptdr', 'humour', 'humor', 'funny', 'drole', 'blague', 'joke', 'comedie', 'comedy', 'parodie', 'troll', 'fail'] },
    { id: 'news', label: 'Actu', words: ['actu', 'actualite', 'actualites', 'info', 'infos', 'breaking', 'urgent', 'journal', 'news', 'reportage', 'alerte', 'flash info', 'journaliste', 'presse'] },
    { id: 'sport', label: 'Sport', words: ['sport', 'foot', 'football', 'soccer', 'nba', 'basket', 'basketball', 'match', 'goal', 'ufc', 'mma', 'boxe', 'tennis', 'f1', 'formule 1', 'rugby', 'cyclisme', 'tour de france', 'natation', 'athletisme', 'olympique', 'ligue des champions'] },
    { id: 'science', label: 'Science', words: ['science', 'sciences', 'espace', 'space', 'nasa', 'spacex', 'physique', 'physics', 'chimie', 'chemistry', 'biologie', 'biology', 'astronomie', 'astronomy', 'climat', 'climate', 'recherche', 'research', 'experience', 'experiment', 'cerveau', 'brain', 'medecine', 'fusee', 'rocket', 'telescope'] },
    { id: 'violence', label: 'Violence', words: ['violence', 'violent', 'bagarre', 'fight', 'attaque', 'attack', 'agression', 'sang', 'blood', 'guerre', 'war', 'tuer', 'kill', 'killed', 'arme', 'gun', 'fusillade', 'shooting', 'accident', 'crash', 'explosion', 'massacre', 'gore', 'tabasse'] },
    { id: 'politics', label: 'Politique', words: ['politique', 'politics', 'election', 'elections', 'vote', 'gouvernement', 'government', 'president', 'ministre', 'minister', 'depute', 'senat', 'assemblee', 'parti', 'loi', 'manifestation', 'greve', 'democratie', 'gauche', 'droite', 'campagne', 'referendum'] },
  ];

  const THEMES = RAW.map((t) => ({ id: t.id, label: t.label, needles: t.words.map(norm) }));
  const LABEL = Object.fromEntries(THEMES.map((t) => [t.id, t.label]));

  function classify(text) {
    const hay = norm(text);
    const out = [];
    for (const t of THEMES) if (t.needles.some((n) => hay.includes(n))) out.push(t.id);
    return out;
  }

  const STOP = new Set(
    ('avec dans pour sans cette ces mais donc alors comme tout tous tres plus moins vous nous elle elles leur leurs sont etre avoir fait faire dont aussi bien cela cest entre chez apres avant depuis encore deja jamais toujours rien quand quel quelle ainsi etait sera peut peuvent veut voir voici voila notre votre ' +
      'that this with from have been will your just they them then than what when where which while about into over also more most some such only very like make made does done were there their would could should being those these because after before again every other http https www com').split(' ')
  );

  function tokens(text) {
    const seen = new Set();
    const out = [];
    for (const w of norm(text).trim().split(' ')) {
      if (w.length < 4 || /^\d+$/.test(w) || STOP.has(w) || seen.has(w)) continue;
      seen.add(w);
      out.push(w);
    }
    return out;
  }

  // Zones géographiques : détection par lieux, personnalités et institutions cités dans le texte.
  const REGION_RAW = [
    { id: 'france', label: 'France', words: ['france', 'francais', 'francaise', 'francaises', 'hexagone', 'tricolore', 'paris', 'parisien', 'marseille', 'marseillais', 'lyon', 'lyonnais', 'toulouse', 'nantes', 'strasbourg', 'montpellier', 'bordeaux', 'lille', 'rennes', 'reims', 'toulon', 'grenoble', 'dijon', 'angers', 'cannes', 'antibes', 'nimes', 'brest', 'le havre', 'saint etienne', 'clermont ferrand', 'villeurbanne', 'bretagne', 'normandie', 'alsace', 'corse', 'occitanie', 'provence', 'ile de france', 'cote d azur', 'banlieue', 'seine saint denis', 'val de marne', 'bouches du rhone', 'alpes maritimes', 'macron', 'elysee', 'matignon', 'assemblee nationale', 'senat', 'gendarmerie', 'police nationale', 'sncf', 'ratp', 'tour eiffel', 'champs elysees', 'le pen', 'bardella', 'melenchon', 'retailleau', 'darmanin', 'attal', 'bayrou', 'lecornu', 'prefecture', 'prefet', 'cnews', 'bfmtv', 'lfi'] },
    { id: 'europe', label: 'Europe', words: ['europe', 'europeen', 'europeenne', 'union europeenne', 'bruxelles', 'belgique', 'allemagne', 'germany', 'berlin', 'munich', 'italie', 'italy', 'rome', 'milan', 'espagne', 'spain', 'madrid', 'barcelone', 'portugal', 'lisbonne', 'pays bas', 'amsterdam', 'suisse', 'geneve', 'zurich', 'autriche', 'vienne', 'pologne', 'varsovie', 'ukraine', 'kiev', 'kyiv', 'russie', 'russia', 'moscou', 'grece', 'athenes', 'suede', 'stockholm', 'norvege', 'danemark', 'irlande', 'dublin', 'roumanie', 'hongrie', 'budapest', 'prague', 'zelensky', 'poutine', 'putin'] },
    { id: 'usa', label: 'États-Unis', words: ['usa', 'etats unis', 'united states', 'america', 'american', 'americain', 'americaine', 'washington', 'new york', 'nyc', 'california', 'californie', 'texas', 'florida', 'floride', 'miami', 'chicago', 'los angeles', 'las vegas', 'white house', 'maison blanche', 'trump', 'biden', 'nypd', 'fbi', 'wall street', 'hollywood', 'nfl', 'nba', 'maga'] },
    { id: 'uk', label: 'Royaume-Uni', words: ['uk', 'royaume uni', 'united kingdom', 'london', 'londres', 'england', 'angleterre', 'britain', 'british', 'britannique', 'scotland', 'ecosse', 'galles', 'manchester', 'liverpool', 'starmer', 'buckingham', 'brexit'] },
    { id: 'maghreb', label: 'Maghreb', words: ['algerie', 'algeria', 'algerien', 'algerienne', 'alger', 'algiers', 'oran', 'constantine', 'kabylie', 'tizi ouzou', 'bejaia', 'annaba', 'setif', 'blida', 'maroc', 'morocco', 'marocain', 'casablanca', 'rabat', 'marrakech', 'tanger', 'tunisie', 'tunisia', 'tunis', 'libye', 'tripoli', 'mauritanie'] },
    { id: 'afrique', label: 'Afrique', words: ['afrique', 'africa', 'africain', 'africaine', 'senegal', 'dakar', 'cote d ivoire', 'abidjan', 'cameroun', 'yaounde', 'douala', 'nigeria', 'lagos', 'ghana', 'accra', 'kenya', 'nairobi', 'congo', 'kinshasa', 'mali', 'bamako', 'burkina', 'niger', 'niamey', 'afrique du sud', 'ethiopie', 'madagascar', 'gabon', 'togo', 'benin'] },
    { id: 'orient', label: 'Moyen-Orient', words: ['gaza', 'israel', 'israelien', 'palestine', 'palestinien', 'liban', 'beyrouth', 'syrie', 'damas', 'iran', 'teheran', 'irak', 'bagdad', 'yemen', 'turquie', 'istanbul', 'ankara', 'dubai', 'arabie saoudite', 'riyad', 'qatar', 'doha', 'egypte', 'le caire', 'jordanie', 'amman', 'hezbollah', 'hamas', 'tsahal', 'idf', 'tel aviv', 'jerusalem'] },
    { id: 'asie', label: 'Asie', words: ['chine', 'china', 'chinois', 'pekin', 'beijing', 'shanghai', 'japon', 'japan', 'japonais', 'tokyo', 'osaka', 'coree', 'seoul', 'inde', 'india', 'delhi', 'mumbai', 'pakistan', 'thailande', 'bangkok', 'vietnam', 'indonesie', 'taiwan', 'taipei', 'singapour', 'philippines', 'hong kong'] },
    { id: 'latam', label: 'Amérique latine', words: ['bresil', 'brazil', 'bresilien', 'rio de janeiro', 'sao paulo', 'argentine', 'buenos aires', 'mexique', 'mexico', 'colombie', 'bogota', 'perou', 'cuba', 'venezuela', 'amerique latine'] },
  ];
  const REGIONS = REGION_RAW.map((r) => ({ id: r.id, label: r.label, needles: r.words.map(norm) }));
  const REGION_LABEL = Object.fromEntries(REGIONS.map((r) => [r.id, r.label]));

  function regions(text) {
    const hay = norm(text);
    const out = [];
    for (const r of REGIONS) if (r.needles.some((n) => hay.includes(n))) out.push(r.id);
    return out;
  }

  NCT.themes = { THEMES, LABEL, REGIONS, REGION_LABEL, regions, norm, classify, tokens };
})();
