// ==UserScript==
// @name         Bulk Rare Commander – legality marker
// @namespace    mfheimbach.bulk-rare-commander
// @version      __VERSION__
// @description  Greys out or hides cards banned in the house format (top 10% EDHREC rank, frozen).
// @match        https://scryfall.com/*
// @match        https://edhrec.com/*
// @match        https://www.edhrec.com/*
// @match        https://moxfield.com/*
// @match        https://www.moxfield.com/*
// @match        https://tappedout.net/*
// @match        https://www.tappedout.net/*
// @updateURL    https://raw.githubusercontent.com/mfheimbach/bulk-rare-commander/main/userscript/bulk-rare-commander.user.js
// @downloadURL  https://raw.githubusercontent.com/mfheimbach/bulk-rare-commander/main/userscript/bulk-rare-commander.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      api.scryfall.com
// @run-at       document-idle
// ==/UserScript==

/*
  Frozen list: __DATE__
  Banned: top 10% of Commander-legal cards by EDHREC rank (rank <= __CUTOFF__).
  __N__ cards. Anything not on the list (incl. new releases) counts as legal.
  Scryfall: matched by oracle ID (printing links resolved via api.scryfall.com, cached).
  EDHREC:   matched by card slug in /cards/<slug> links.
*/

(function () {
  'use strict';

  const BANNED_IDS = new Set(__IDS__);
  const BANNED_SLUGS = new Set(__SLUGS__);
  const H = location.hostname;
  const SITE = H.includes('edhrec') ? 'edhrec' : H.includes('moxfield') ? 'moxfield'
             : H.includes('tappedout') ? 'tappedout' : 'scryfall';
  let bannedCount = null;   // shown in the toggle on deck pages

  // ---------- mode toggle: grey / hide / off ----------
  const MODES = ['grey', 'hide', 'off'];
  const LABEL = { grey: 'Banned: greyed', hide: 'Banned: hidden', off: 'Banned: shown' };
  let mode = GM_getValue('pc_mode', 'grey');
  if (!MODES.includes(mode)) mode = 'grey';

  const style = document.createElement('style');
  style.textContent = `
    html[data-pc-mode="grey"] .pc-banned { opacity: .28 !important; filter: grayscale(1) !important; }
    html[data-pc-mode="grey"] .pc-banned:hover { opacity: .75 !important; }
    html[data-pc-mode="hide"] .pc-banned, html[data-pc-mode="hide"] .pc-combo-banned { display: none !important; }
    html[data-pc-mode="grey"] .pc-combo-box { outline: 2px dashed rgba(128,128,128,.8); outline-offset: 2px; border-radius: 8px;
                                               background: rgba(128,128,128,.10) !important; }
    html[data-pc-mode="grey"] .pc-dim { opacity: .35 !important; filter: grayscale(1) !important; }
    html[data-pc-mode="grey"] .pc-ccard { filter: grayscale(1) brightness(1.25) contrast(.45) !important; }
    html[data-pc-mode="grey"] .pc-ccard:hover { filter: grayscale(1) !important; }
    html:not([data-pc-mode="grey"]) .pc-combo-badge { display: none !important; }
    .pc-combo-badge { display: inline-block; margin: 4px 0; padding: 0 6px; border-radius: 4px; background: #555; color: #fff;
                      font: 700 11px/1.6 system-ui, sans-serif; pointer-events: none; }
    html[data-pc-mode="off"] .pc-badge, html[data-pc-mode="off"] .pc-banner { display: none !important; }
    .pc-banned { position: relative; }
    .pc-badge { position: absolute; top: 6px; left: 6px; z-index: 5; background: #b3261e; color: #fff;
                font: 700 11px/1.6 system-ui, sans-serif; padding: 0 6px; border-radius: 4px; pointer-events: none; }
    .pc-banner { background: #b3261e; color: #fff; font: 600 14px/1.4 system-ui, sans-serif;
                 padding: 8px 14px; text-align: center; position: relative; z-index: 9999; }
    #pc-toggle { position: fixed; right: 14px; bottom: 14px; z-index: 2147483647; cursor: pointer;
                 font: 600 12px/1 system-ui, sans-serif; padding: 9px 12px; border-radius: 18px; border: 0;
                 background: #1f1f1f; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.3); opacity: .85; }
    #pc-toggle:hover { opacity: 1; }`;
  style.id = 'pc-style';

  function applyMode() {
    document.documentElement.dataset.pcMode = mode;
    const b = document.getElementById('pc-toggle');
    if (b) b.textContent = LABEL[mode] + (bannedCount !== null ? ` · ${bannedCount} in deck` : '');
  }
  const btn = document.createElement('button');
  btn.id = 'pc-toggle';
  btn.title = 'Cycle: greyed → hidden → shown (Alt+B)';
  btn.addEventListener('click', cycle);
  // React/Next (EDHREC) re-renders <head>/<body> after load and drops foreign nodes.
  // Keep our nodes as direct children of <html>, outside React's tree, and re-attach if removed.
  function ensureUi() {
    const root = document.documentElement;
    if (!style.isConnected) root.appendChild(style);
    if (!btn.isConnected) root.appendChild(btn);
    if (root.dataset.pcMode !== mode) root.dataset.pcMode = mode;
  }
  ensureUi();
  function cycle() {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    GM_setValue('pc_mode', mode);
    applyMode();
  }
  document.addEventListener('keydown', e => { if (e.altKey && (e.key === 'b' || e.key === 'B')) cycle(); });
  applyMode();

  // ---------- marking ----------
  function mark(el) {
    if (!el) return;
    // only touch the class when missing: re-adding queues a mutation and would re-trigger the scan forever
    if (!el.classList.contains('pc-banned')) el.classList.add('pc-banned');
    if (el.classList.contains('pc-combo') && !el.querySelector(':scope > .pc-badge')) {
      const b = document.createElement('span'); b.className = 'pc-badge'; b.textContent = 'COMBO BANNED';
      el.appendChild(b); return;
    }
    if (el.tagName !== 'TR' && !el.querySelector(':scope > .pc-badge')) {
      const b = document.createElement('span');
      b.className = 'pc-badge';
      b.textContent = 'BANNED';
      el.appendChild(b);
    }
  }
  function banner(text) {
    if (document.querySelector('.pc-banner')) return;
    const bar = document.createElement('div');
    bar.className = 'pc-banner';
    bar.textContent = text;
    document.body.prepend(bar);
  }
  function clearBanner() {
    const b = document.querySelector('.pc-banner');
    if (b) b.remove();
  }

  // ---------- Scryfall ----------
  const CACHE_KEY = 'pc_print_to_oracle_v1';
  const cache = (() => { try { return JSON.parse(GM_getValue(CACHE_KEY, '{}')); } catch (e) { return {}; } })();
  const saveCache = () => { try { GM_setValue(CACHE_KEY, JSON.stringify(cache)); } catch (e) {} };
  const CARD_RE = /^\/card\/([^/]+)\/([^/]+)(?:\/|$)/;
  const keyOf = (set, cn) => `${set.toLowerCase()}/${decodeURIComponent(cn)}`;
  const pending = new Set();

  function fetchOracle(keys) {
    for (let i = 0; i < keys.length; i += 75) {
      const identifiers = keys.slice(i, i + 75).map(k => {
        const j = k.indexOf('/');
        return { set: k.slice(0, j), collector_number: k.slice(j + 1) };
      });
      GM_xmlhttpRequest({
        method: 'POST',
        url: 'https://api.scryfall.com/cards/collection',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        data: JSON.stringify({ identifiers }),
        onload: (res) => {
          try {
            const d = JSON.parse(res.responseText);
            for (const c of d.data || []) {
              const oid = c.oracle_id || (c.card_faces && c.card_faces[0] && c.card_faces[0].oracle_id);
              if (oid) cache[keyOf(c.set, c.collector_number)] = oid;
            }
            saveCache();
            scanScryfall();
          } catch (e) { console.warn('[pricecap] parse failed', e); }
        },
      });
    }
  }

  function scanScryfall() {
    const missing = [];
    document.querySelectorAll('a[href*="/card/"]').forEach(a => {
      let path;
      try { path = new URL(a.href, location.origin).pathname; } catch (e) { return; }
      const m = path.match(CARD_RE);
      if (!m) return;
      const k = keyOf(m[1], m[2]);
      const oid = cache[k];
      if (oid) { if (BANNED_IDS.has(oid)) mark(a.closest('.card-grid-item, tr, .card-profile, .card-text, li') || a); }
      else if (!pending.has(k)) { pending.add(k); missing.push(k); }
    });
    const pm = location.pathname.match(CARD_RE);
    if (pm) {
      const k = keyOf(pm[1], pm[2]);
      const oid = cache[k];
      if (oid && BANNED_IDS.has(oid)) banner('Banned in house format (top 10% EDHREC rank)');
      else if (!oid && !pending.has(k)) { pending.add(k); missing.push(k); }
    }
    if (missing.length) fetchOracle(missing);
  }

  // ---------- EDHREC ----------
  const EDH_RE = /^\/(?:cards|commanders)\/([a-z0-9-]+)/;
  function edhContainer(a) {
    // EDHREC uses CSS-module class names like "Card_container__abc12"; fall back to the link's parent.
    return a.closest('[class*="Card_container"], [class*="CardView_"], [class*="cardWrapper"], li') || a.parentElement || a;
  }
  function slugOf(a) {
    let path;
    try { path = new URL(a.href, location.origin).pathname; } catch (e) { return null; }
    const m = path.match(EDH_RE);
    return m ? { slug: m[1], path } : null;
  }
  function slugSet(el) {
    const set = new Set();
    el.querySelectorAll('a[href*="/cards/"], a[href*="/commanders/"]').forEach(a => {
      const s = slugOf(a); if (s && s.path !== location.pathname) set.add(s.slug);
    });
    return set;
  }
  const sameSet = (x, y) => x.size === y.size && [...x].every(v => y.has(v));

  // Combo tiles: each card in a combo links to /combos/<colors>/<combo-id> and shows its name;
  // the tile is the surrounding <li>. One banned card -> whole tile.
  const COMBO_RE = /^\/combos\/[a-z-]+\/[0-9]+(?:-[0-9]+)+/;
  function slugify(name) {
    return name.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase()
      .replace(/['\u2019.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function markCombo(tile) {
    if (tile.classList.contains('pc-combo-banned')) return;
    tile.classList.add('pc-combo-banned');
    const box = tile.firstElementChild || tile;
    box.classList.add('pc-combo-box');
    // dim everything in the tile except the block holding the cards
    [...box.children].forEach(ch => { if (!ch.querySelector('a[href*="/combos/"]')) ch.classList.add('pc-dim'); });
    const info = box.querySelector(':scope > .pc-dim') || box;
    const b = document.createElement('span');
    b.className = 'pc-combo-badge';
    b.textContent = 'COMBO BANNED';
    info.prepend(b);
  }

  function scanCombos() {
    document.querySelectorAll('a[href^="/combos/"], a[href^="https://edhrec.com/combos/"]').forEach(a => {
      let path;
      try { path = new URL(a.href, location.origin).pathname; } catch (e) { return; }
      if (!COMBO_RE.test(path)) return;
      const nameEl = a.querySelector('[class*="_name"]') || a;
      const name = (nameEl.textContent || '').trim();
      if (!name) return;
      const slug = slugify(name);
      const front = name.includes(' // ') ? slugify(name.split(' // ')[0]) : slug;
      if (!BANNED_SLUGS.has(slug) && !BANNED_SLUGS.has(front)) return;
      const tile = a.closest('li') || a.closest('[class*="_container"]');
      if (!tile) return;
      markCombo(tile);
      // grey only the banned card itself (its wrapper carries style="--num:N")
      const card = a.closest('[style*="--num"]') || a.closest('[class*="_card"]:not([class*="_cards"])') || a;
      if (!card.classList.contains('pc-ccard')) card.classList.add('pc-ccard');
    });
  }

  function scanEdhrec() {
    scanCombos();
    const links = document.querySelectorAll('a[href*="/cards/"], a[href*="/commanders/"]');
    links.forEach(a => {
      const s = slugOf(a);
      if (!s || !BANNED_SLUGS.has(s.slug)) return;
      // skip nav/breadcrumb links that point at the page we're already on
      if (s.path === location.pathname) return;
      // cards inside an already-marked combo tile: the tile carries the mark
      if (a.closest('.pc-combo')) return;
      mark(edhContainer(a));
    });
    const pm = location.pathname.match(EDH_RE);
    if (pm && BANNED_SLUGS.has(pm[1])) banner('Banned in house format (top 10% EDHREC rank)');
    else clearBanner();
  }

  // ---------- generic slug-link scanner (Moxfield, TappedOut) ----------
  // re: pathname regex whose group 1 is the card slug; container: element to mark for a link
  function scanSlugLinks(selector, re, container, isDeck) {
    const seen = new Set();
    document.querySelectorAll(selector).forEach(a => {
      let path;
      try { path = new URL(a.href, location.origin).pathname; } catch (e) { return; }
      const m = path.match(re);
      if (!m || !BANNED_SLUGS.has(m[1])) return;
      if (path === location.pathname) return;
      const el = container(a);
      if (el) { mark(el); if (isDeck) seen.add(m[1]); }
    });
    const pm = location.pathname.match(re);
    if (pm && BANNED_SLUGS.has(pm[1])) banner('Banned in house format (top 10% EDHREC rank)');
    if (isDeck) {
      const n = seen.size;
      if (n !== bannedCount) { bannedCount = n; applyMode(); }
    }
  }

  // Moxfield: /cards/<5-char id>-<slug>; deck rows are li[data-testid="deck-view-table-row"]
  function scanMoxfield() {
    const isDeck = /^\/decks\//.test(location.pathname);
    scanSlugLinks('a[href*="/cards/"]', /^\/cards\/[A-Za-z0-9_]+-([a-z0-9-]+)\/?$/,
      a => a.closest('[data-testid="deck-view-table-row"], [data-row-key], li, tr') || a, isDeck);
  }

  // TappedOut: /mtg-card/<slug>/
  function scanTappedout() {
    const isDeck = /^\/mtg-decks\//.test(location.pathname);
    scanSlugLinks('a[href*="/mtg-card/"]', /^\/mtg-card\/([a-z0-9-]+)\/?$/,
      a => a.closest('li.member, li, tr') || a, isDeck);
  }

  // ---------- run ----------
  const scanSite = { edhrec: scanEdhrec, moxfield: scanMoxfield, tappedout: scanTappedout }[SITE] || scanScryfall;
  const scan = () => { ensureUi(); scanSite(); };
  scan();
  let t;
  // observe <html>, not <body>: the body element itself can be replaced during hydration
  new MutationObserver(() => { ensureUi(); clearTimeout(t); t = setTimeout(scan, 150); })
    .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
})();
