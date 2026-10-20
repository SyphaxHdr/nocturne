/* Lecture d'un tweet tel que X l'affiche (texte, auteur, compteurs), pour le volet Discussion et le diagnostic.
 * Rien n'est enregistré ni envoyé : ces fonctions ne font que lire la page affichée.
 * Les fonctions « parse… » sont pures (testées dans tests/core.test.js). */
(() => {
  'use strict';
  const NCT = (globalThis.NCT = globalThis.NCT || {});

  // « 21 033 », « 21,033 », « 21.033 » → 21033 ; « 12,4 k », « 1.2M », « 3 Md » → nombres complets.
  function parseCount(s) {
    if (s == null) return null;
    const t = String(s).replace(/[  ]/g, ' ').trim().toLowerCase();
    const u = t.match(/^(\d+(?:[.,]\d+)?)\s*(k|md|mrd|mio|mille|m|b)(?![a-z])/);
    if (u) {
      const mult = { k: 1e3, mille: 1e3, m: 1e6, mio: 1e6, md: 1e9, mrd: 1e9, b: 1e9 }[u[2]];
      return Math.round(parseFloat(u[1].replace(',', '.')) * mult);
    }
    const m = t.match(/^\d+(?:[ .,]\d{3})*/);
    if (!m) return null;
    const n = Number(m[0].replace(/[ .,]/g, ''));
    if (!isFinite(n)) return null;
    const mult = 1;
    return Math.round(n * mult);
  }

  // aria-label du groupe de boutons d'un tweet, ex. « 12 réponses, 48 reposts, 530 J'aime, 40 signets, 21033 vues ».
  const KEYS = [['replies', /r[ée]pon|repl|respuest|antwort/i], ['reposts', /repost|retweet|republi/i], ['likes', /j.aime|like|gusta|gefällt/i], ['bookmarks', /signet|bookmark|marcador|lesezeichen/i], ['views', /vue|view|affichage|visualiz|aufruf/i]];
  function parseMetrics(label) {
    const out = { views: null, likes: null, reposts: null, replies: null, bookmarks: null };
    if (!label) return out;
    const re = /(\d[\d   .,]*)\s*([^\d,]+)/g;
    let m;
    while ((m = re.exec(String(label)))) {
      const n = parseCount(m[1].replace(/[\s.,]+$/, ''));
      const word = m[2];
      for (const [k, rx] of KEYS) if (out[k] == null && rx.test(word)) { out[k] = n; break; }
    }
    return out;
  }

  const EMOJI = /\p{Extended_Pictographic}/gu;
  function textFeatures(text) {
    const t = String(text || '');
    return {
      hashtags: [...new Set((t.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.slice(1).toLowerCase()))].slice(0, 30),
      mentions: [...new Set((t.match(/@[A-Za-z0-9_]{1,15}/g) || []).map((h) => h.slice(1).toLowerCase()))].slice(0, 30),
      chars: [...t].length,
      emojis: (t.match(EMOJI) || []).length,
      links: (t.match(/https?:\/\/\S+|\b\w+\.(?:com|fr|io|gg|ly|co|net|org|tv)\/\S*/gi) || []).length,
    };
  }

  const ratioOf = (w, h) => (!w || !h ? null : w / h > 1.15 ? 'horizontal' : h / w > 1.15 ? 'vertical' : 'carre');

  /* ---------- Lecture dans la page ---------- */

  const $ = (s, r) => r.querySelector(s);
  function statusOf(article) {
    const time = $('time', article);
    const link = time && time.closest('a');
    const href = link && link.getAttribute('href');
    const m = href && href.match(/^\/([^/]+)\/status\/(\d+)/);
    return m ? { handle: m[1], id: m[2], time } : null;
  }
  const isPromoted = (a) => !!$('[data-testid="placementTracking"]', a) || /^(sponsoris|promoted|publicit|ad$)/i.test(((($('[data-testid="socialContext"]', a) || {}).textContent) || '').trim());

  // Un tweet → une observation (null si ce n'est pas un vrai tweet lisible, ou une pub).
  function tweet(article, source) {
    const st = statusOf(article);
    if (!st || isPromoted(article)) return null;
    const textEl = $('[data-testid="tweetText"]', article);
    let text = '';
    if (textEl) {
      // les emojis sont des images : on reprend leur texte alternatif
      text = Array.from(textEl.childNodes).map((n) => (n.nodeType === 3 ? n.textContent : n.tagName === 'IMG' ? n.alt || '' : n.textContent)).join('');
    }
    const f = textFeatures(text);
    const group = $('[role="group"][aria-label]', article);
    const video = $('video', article);
    const media = video ? (video.loop ? 'gif' : 'video') : $('[data-testid="videoPlayer"], [data-testid="videoComponent"]', article) ? 'video' : $('[data-testid="tweetPhoto"]', article) ? 'image' : 'texte';
    const names = article.querySelectorAll('[data-testid="User-Name"]');
    const nameEl = $('[data-testid="User-Name"] span', article);
    return {
      id: st.id,
      handle: st.handle,
      name: nameEl ? nameEl.textContent.slice(0, 60) : null,
      source: source || null,
      postedAt: st.time.getAttribute('datetime') || null,
      text: text.slice(0, 1000),
      lang: (textEl && textEl.getAttribute('lang')) || null,
      ...f,
      media,
      video: video && media === 'video' ? { duration: isFinite(video.duration) ? video.duration : null, ratio: ratioOf(video.videoWidth, video.videoHeight) } : null,
      metrics: parseMetrics(group && group.getAttribute('aria-label')),
      verified: !!(names[0] && $('[data-testid="icon-verified"], svg[aria-label*="ertifi"], svg[aria-label*="erified"]', names[0])),
      isReply: /(en réponse à|replying to)\s*@/i.test((article.textContent || '').slice(0, 400)),
      quote: names.length > 1,
    };
  }

  NCT.observe = { parseCount, parseMetrics, textFeatures, ratioOf, tweet, statusOf, isPromoted };
})();
