// =====================================================================
// STATE & DATA MODEL
// =====================================================================

const State = {
    decks: [],
    curDeckId: '',
    gatheredCards: [],
    drillSession: null,
    editIdx: 0,
    editCards: [],
    selectedTableRow: null,
    modalCallback: null,
    selCriteriaId: '',
    selBundleIds: new Set(),
    selCatIds: new Set(),
    selCritMgrId: '',
    bvSelCards: new Set(),
    bvSelBundleCards: new Set(),
    drillCountdownTimer: null,
    drillCountdownSec: 0,
    userSelectedSort: false,

    get deck() { return this.decks.find(d => d.id === this.curDeckId) || null }
};

const Utils = {
    uid: () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    now: () => Date.now(),
    dayMs: 86400000,
    escH: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    escAttr: (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;'),
    // Attributes for a clickable element handled by the delegated listener in
    // views.js. Ids travel as escaped attribute text, never as inline JS.
    act: (name, id) => `data-act="${name}" data-id="${Utils.escH(id)}"`,
    dlBlob: (blob, name) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
    },
    flash: (id, msg) => {
        const el = document.getElementById(id);
        if (!el) return;
        const prev = el.textContent;
        el.textContent = msg;
        setTimeout(() => el.textContent = prev, 1500);
    }
};

const DEFAULT_DATE = 946684800000; // 2000-01-01T00:00:00Z

function mkCard(front = '', back = '', categoryId = '', frequency = 0) {
    const mk = () => ({ timesRight: 0, timesWrong: 0, timesRightSinceWrong: 0, dateLastRight: DEFAULT_DATE, dateLastWrong: DEFAULT_DATE });
    return { id: Utils.uid(), front, back, categoryId, frequency, editedDate: Date.now(), fb: mk(), bf: mk() };
}

function mkDeck(name = 'New Deck') {
    const catId = Utils.uid();
    return {
        id: Utils.uid(),
        name,
        createdDate: Date.now(),
        categories: [{ id: catId, name: 'General' }],
        bundles: [],
        criteria: [
            { id: Utils.uid(), name: 'Spaced Repetition', logic: '(NOW - LastRightTime) > (LastRightTime - LastWrongTime)' },
            { id: Utils.uid(), name: 'All Cards', logic: '' },
            { id: Utils.uid(), name: 'Missed Once', logic: 'TimesWrong > 0' },
            { id: Utils.uid(), name: 'Streak < 3', logic: 'TimesRightSinceWrong < 3' },
            { id: Utils.uid(), name: 'Never Studied', logic: 'TimesRight == 0 AND TimesWrong == 0' },
        ],
        cards: [],
        settings: { fontSize: 28, headTmpl: '', frontTmpl: '', backTmpl: '' },
    };
}

// Copies a card's metrics to the same card in other decks; returns the decks it changed.
function syncCardAcrossDecks(cardId, dir, metrics) {
    const curDeck = State.deck;
    const curCard = curDeck?.cards.find(c => c.id === cardId);
    const changed = [];
    for (const otherDeck of State.decks) {
        if (otherDeck.id === State.curDeckId) continue;
        if (!otherDeck.cards) continue; // catalog stub whose body isn't loaded
        const otherCard = otherDeck.cards.find(c => c.id === cardId || (curCard && curDeck.src && otherDeck.src && c.front === curCard.front));
        if (otherCard) {
            otherCard[dir] = { ...metrics };
            changed.push(otherDeck);
        }
    }
    return changed;
}

function buildAthenazeDeck(ch) {
    const d = mkDeck(`Athenaze Book I — Chapter ${ch.num}: ${ch.title}`);
    d.src = { kind: 'athenaze', ch: ch.num };
    d.settings.fontSize = 28;

    const posSet = [...new Set(ch.cards.map(c => c.pos || 'General'))];
    const catMap = {};
    d.categories = posSet.map(name => {
        const id = 'cat_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        catMap[name] = id;
        return { id, name };
    });

    const alphaCards = [];
    const betaCards = [];
    d.cards = ch.cards.map((c, idx) => {
        const catId = catMap[c.pos || 'General'] || d.categories[0].id;
        const card = mkCard(c.front, c.back, catId);
        card.id = `ath_${ch.num}_${idx}`;
        card._sub = c.sub;
        if (c.sub === 'α') alphaCards.push(card.id);
        else if (c.sub === 'β') betaCards.push(card.id);
        return card;
    });

    d.bundles = [];
    if (alphaCards.length) {
        d.bundles.push({ id: `bnd_${ch.num}_a`, name: `Chapter ${ch.num}α`, cardIds: alphaCards });
    }
    if (betaCards.length) {
        d.bundles.push({ id: `bnd_${ch.num}_b`, name: `Chapter ${ch.num}β`, cardIds: betaCards });
    }
    d.bundles.push({ id: `bnd_${ch.num}_all`, name: `Chapter ${ch.num} (All)`, cardIds: d.cards.map(c => c.id) });

    return d;
}

function buildAthenazeMasterDeck() {
    const d = mkDeck('Athenaze Book I (Chapters 1–16 Complete)');
    d.src = { kind: 'athenaze', ch: 'all' };
    d.settings.fontSize = 28;

    const allCards = (typeof ATHENAZE_CHAPTERS !== 'undefined' && Array.isArray(ATHENAZE_CHAPTERS)) ? ATHENAZE_CHAPTERS.flatMap(ch => ch.cards) : [];
    const posSet = [...new Set(allCards.map(c => c.pos || 'General'))];
    const catMap = {};
    d.categories = posSet.map(name => {
        const id = 'cat_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        catMap[name] = id;
        return { id, name };
    });

    d.cards = [];
    d.bundles = [];

    if (typeof ATHENAZE_CHAPTERS !== 'undefined' && Array.isArray(ATHENAZE_CHAPTERS)) {
        for (const ch of ATHENAZE_CHAPTERS) {
            const chCardIds = [];
            const alphaIds = [];
            const betaIds = [];
            ch.cards.forEach((c, idx) => {
                const catId = catMap[c.pos || 'General'] || d.categories[0].id;
                const card = mkCard(c.front, c.back, catId);
                card.id = `ath_${ch.num}_${idx}`;
                card._ch = ch.num;
                card._sub = c.sub;
                d.cards.push(card);
                chCardIds.push(card.id);
                if (c.sub === 'α') alphaIds.push(card.id);
                else if (c.sub === 'β') betaIds.push(card.id);
            });
            if (alphaIds.length) d.bundles.push({ id: `bnd_master_${ch.num}_a`, name: `Ch ${ch.num}α`, cardIds: alphaIds });
            if (betaIds.length) d.bundles.push({ id: `bnd_master_${ch.num}_b`, name: `Ch ${ch.num}β`, cardIds: betaIds });
            d.bundles.push({ id: `bnd_master_${ch.num}_all`, name: `Chapter ${ch.num}: ${ch.title}`, cardIds: chCardIds });
        }
    }

    return d;
}

// The MDB and Extended Lexicon datasets (~700 KB of script) load only when a
// deck is built from them, not on every page visit. A <script> tag rather than
// fetch() keeps this working when index.html is opened from disk.
const ATHENAZE_DATA_SCRIPTS = { mdb: 'athenaze-mdb-data.js', extended: 'athenaze-extended-data.js' };
const _scriptLoads = {};

function loadScriptOnce(src) {
    return _scriptLoads[src] ||= new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => { delete _scriptLoads[src]; reject(new Error(`Could not load ${src}`)); };
        document.head.appendChild(s);
    });
}

function athenazeDataLoaded(kind) {
    return kind === 'mdb'
        ? typeof ATHENAZE_MDB_DECK !== 'undefined' && !!ATHENAZE_MDB_DECK
        : typeof ATHENAZE_EXTENDED_DECK !== 'undefined' && !!ATHENAZE_EXTENDED_DECK;
}

async function loadAthenazeData(kind) {
    if (!athenazeDataLoaded(kind)) await loadScriptOnce(ATHENAZE_DATA_SCRIPTS[kind]);
}

const isAthenazeMdbDeck = d => d.id === 'deck_athenaze_mdb_canonical' || (d.src && d.src.kind === 'athenaze_mdb');
const isAthenazeExtendedDeck = d => !!(d.name && d.name.includes('Extended Lexicon'));

// Finds the MDB or Extended deck, or builds and saves it (loading its data first).
// Resolves to null if the data can't be loaded.
async function ensureAthenazeDeck(kind) {
    const match = kind === 'mdb' ? isAthenazeMdbDeck : isAthenazeExtendedDeck;
    let d = State.decks.find(match);
    if (d) return d;
    try { await loadAthenazeData(kind); } catch (err) { console.warn(err.message); return null; }
    d = State.decks.find(match); // may have been added while loading
    if (d) return d;
    d = kind === 'mdb' ? buildAthenazeMdbDeck() : buildAthenazeExtendedDeck();
    if (d) { State.decks.push(d); save(); }
    return d;
}

function buildAthenazeMdbDeck() {
    if (typeof ATHENAZE_MDB_DECK !== 'undefined' && ATHENAZE_MDB_DECK) {
        return JSON.parse(JSON.stringify(ATHENAZE_MDB_DECK));
    }
    return null;
}

function buildAthenazeExtendedDeck() {
    if (typeof ATHENAZE_EXTENDED_DECK !== 'undefined' && ATHENAZE_EXTENDED_DECK) {
        return JSON.parse(JSON.stringify(ATHENAZE_EXTENDED_DECK));
    }
    return null;
}

function createAllAthenazeDecks() {
    const decks = [];
    if (typeof ATHENAZE_CHAPTERS !== 'undefined' && Array.isArray(ATHENAZE_CHAPTERS) && ATHENAZE_CHAPTERS.length) {
        for (const ch of ATHENAZE_CHAPTERS) {
            decks.push(buildAthenazeDeck(ch));
        }
        decks.push(buildAthenazeMasterDeck());
    } else {
        decks.push(mkAthenaze1aDeck());
    }
    const mdbDeck = buildAthenazeMdbDeck();
    if (mdbDeck) {
        decks.push(mdbDeck);
    }
    return decks;
}

function mkAthenaze1aDeck() {
    if (typeof ATHENAZE_CHAPTERS !== 'undefined' && ATHENAZE_CHAPTERS[0]) {
        return buildAthenazeDeck(ATHENAZE_CHAPTERS[0]);
    }
    const d = mkDeck('Athenaze Book I — Chapter 1α (Ο ΔΙΚΑΙΟΠΟΛΙΣ)');
    d.src = { kind: 'athenaze', ch: 1 };
    d.settings.fontSize = 28;
    return d;
}

// =====================================================================
// STORE & PERSISTENCE
// =====================================================================
// Catalog decks (loaded from the repo's data/ files) keep a read-only body in
// the repo: localStorage holds only a stub (id, name, catalogFile) plus a diff
// of everything the user changed against that pristine body — study metrics,
// card edits, added and deleted cards, and any change to categories, bundles,
// criteria or settings. The body is rehydrated from the repo on load and the
// diff reapplied. This keeps a multi-corpus workspace well inside the ~5MB
// localStorage quota (Greek NT alone is 3MB; Qumran 2MB+).
// User decks (Athenaze, imported, hand-built) persist in full, as before.

const CARD_CONTENT_FIELDS = ['front', 'back', 'frequency', 'categoryId'];
// Small deck-level fields: stored whole when changed. Bundles can be large
// (Greek NT: ~470KB of card ids), so they are diffed per bundle instead.
const DECK_META_FIELDS = ['categories', 'criteria', 'settings'];

function isCatalogDeck(d) { return !!(d && d.catalogFile); }

// Record the pristine (as-shipped) state of a freshly loaded catalog body so
// makeCatalogStub can diff against it. Non-enumerable: never exported or saved.
function snapshotCatalogDeck(d) {
    const cards = new Map();
    for (const c of d.cards) {
        const snap = { fb: { ...c.fb }, bf: { ...c.bf } };
        for (const f of CARD_CONTENT_FIELDS) snap[f] = c[f];
        cards.set(c.id, snap);
    }
    const meta = {};
    for (const f of DECK_META_FIELDS) meta[f] = JSON.stringify(d[f] ?? null);
    const bundles = new Map((d.bundles || []).map(b => [b.id, { name: b.name, cardIds: [...(b.cardIds || [])] }]));
    Object.defineProperty(d, '_pristine', { value: { cards, meta, bundles }, enumerable: false, configurable: true, writable: true });
}

// Field-wise compare: runs on every save (i.e. every drill answer), and
// serializing a large deck's bundles each time costs ~10ms.
function bundleChanged(b, p) {
    if (!p || b.name !== p.name) return true;
    const ids = b.cardIds || [];
    if (ids.length !== p.cardIds.length) return true;
    for (let i = 0; i < ids.length; i++) if (ids[i] !== p.cardIds[i]) return true;
    return false;
}

// Written out field by field: this runs for every card on every save.
function metricsDiffer(a, b) {
    a = a || {}; b = b || {};
    return a.timesRight !== b.timesRight || a.timesWrong !== b.timesWrong ||
        a.timesRightSinceWrong !== b.timesRightSinceWrong ||
        a.dateLastRight !== b.dateLastRight || a.dateLastWrong !== b.dateLastWrong;
}

function contentDiffers(c, p) {
    return c.front !== p.front || c.back !== p.back ||
        c.frequency !== p.frequency || c.categoryId !== p.categoryId;
}

function isActiveMetrics(m = {}) {
    return !!(m.timesRight || m.timesWrong ||
        (m.dateLastRight && m.dateLastRight !== DEFAULT_DATE) ||
        (m.dateLastWrong && m.dateLastWrong !== DEFAULT_DATE));
}

function makeCatalogStub(d) {
    // Body not loaded (still fetching, or unavailable offline): d is still the
    // stub read from storage, so pass it through untouched rather than
    // overwriting the saved diff with an empty one.
    if (!d.cards) {
        const { _unavailable, ...stub } = d;
        return stub;
    }
    const pristine = d._pristine;
    const metrics = {}, userEdits = {}, addedCards = [], overrides = {};
    let bundleEdits = { changed: [], removed: [] };
    let pristineSeen = 0;
    for (const c of d.cards) {
        const p = pristine?.cards.get(c.id);
        if (pristine && !p) { addedCards.push(c); continue; }
        if (p) pristineSeen++;
        const changed = p
            ? metricsDiffer(c.fb, p.fb) || metricsDiffer(c.bf, p.bf)
            : isActiveMetrics(c.fb) || isActiveMetrics(c.bf);
        if (changed) metrics[c.id] = { fb: { ...c.fb }, bf: { ...c.bf } };
        if (p && contentDiffers(c, p)) {
            userEdits[c.id] = Object.fromEntries(CARD_CONTENT_FIELDS.map(f => [f, c[f]]));
        }
    }
    let deletedIds = [];
    if (pristine && pristineSeen < pristine.cards.size) {
        const present = new Set(d.cards.map(c => c.id));
        deletedIds = [...pristine.cards.keys()].filter(id => !present.has(id));
    }
    if (pristine) {
        for (const f of DECK_META_FIELDS) {
            if (JSON.stringify(d[f] ?? null) !== pristine.meta[f]) overrides[f] = d[f];
        }
        const bundles = d.bundles || [];
        const current = new Set(bundles.map(b => b.id));
        bundleEdits = {
            changed: bundles.filter(b => bundleChanged(b, pristine.bundles.get(b.id))),
            removed: [...pristine.bundles.keys()].filter(id => !current.has(id)),
        };
    }
    return {
        id: d.id, name: d.name, createdDate: d.createdDate,
        src: d.src, language: d.language, catalogFile: d.catalogFile,
        metrics, userEdits, addedCards, deletedIds, overrides, bundleEdits,
    };
}

function rehydrateCatalogDeck(stub, full) {
    snapshotCatalogDeck(full);
    const deleted = new Set(stub.deletedIds || []);
    if (deleted.size) full.cards = full.cards.filter(c => !deleted.has(c.id));
    const metrics = stub.metrics || {};
    const edits = stub.userEdits || {};
    for (const c of full.cards) {
        const m = metrics[c.id];
        if (m) {
            c.fb = { ...c.fb, ...m.fb };
            c.bf = { ...c.bf, ...m.bf };
        }
        const e = edits[c.id];
        if (e) for (const f of CARD_CONTENT_FIELDS) if (f in e) c[f] = e[f];
    }
    for (const c of stub.addedCards || []) full.cards.push(c);
    for (const [f, v] of Object.entries(stub.overrides || {})) {
        if (DECK_META_FIELDS.includes(f)) full[f] = v;
    }
    const be = stub.bundleEdits || {};
    const removed = new Set(be.removed || []);
    full.bundles = (full.bundles || []).filter(b => !removed.has(b.id));
    for (const b of be.changed || []) {
        const i = full.bundles.findIndex(x => x.id === b.id);
        if (i >= 0) full.bundles[i] = b; else full.bundles.push(b);
    }
    full.id = stub.id || full.id;
    full.name = stub.name || full.name;
    full.catalogFile = stub.catalogFile;
    full.createdDate = stub.createdDate || full.createdDate;
    return full;
}

function fetchCatalogDeckFile(file) {
    return fetch(file).then(resp => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status} loading ${file}`);
        return resp.json();
    });
}

// Each deck's serialized form as of its last save. A save that names the decks
// it changed (answering a card) re-serializes only those and reuses the rest.
const _savedDeckJson = new WeakMap();

const Store = {
    load() { return JSON.parse(localStorage.getItem('flashpro_decks') || '[]') },
    // changed: the decks modified since the last save, or omitted for all of them.
    save(decks, changed) {
        const parts = decks.map(d => {
            let json = _savedDeckJson.get(d);
            if (json === undefined || !changed || changed.includes(d)) {
                json = JSON.stringify(isCatalogDeck(d) ? makeCatalogStub(d) : d);
                _savedDeckJson.set(d, json);
            }
            return json;
        });
        try {
            localStorage.setItem('flashpro_decks', '[' + parts.join(',') + ']');
        } catch (e) {
            // Never fall back to a leaner save that drops study metrics: that
            // would silently overwrite the user's saved progress.
            alert('Storage full: could not save. Export your decks from the I/O tab.');
        }
    },
    currentId() { return localStorage.getItem('flashpro_cur') || '' },
    setCur(id) { localStorage.setItem('flashpro_cur', id) },
};

function save(changedDecks) { Store.save(State.decks, changedDecks); }

// Rehydrate all catalog stubs from their repo files at startup.
// Returns a promise resolving when every stub has a full body (or fell back to stub-only).
function rehydrateCatalogDecks() {
    const jobs = [];
    for (const d of State.decks) {
        if (isCatalogDeck(d) && !d.cards) {
            jobs.push(
                fetchCatalogDeckFile(d.catalogFile)
                    .then(full => {
                        const body = rehydrateCatalogDeck(d, convertCatalogCards(full));
                        // Drop the stub's diff fields before adopting the full body.
                        for (const k of Object.keys(d)) delete d[k];
                        Object.assign(d, body);
                        Object.defineProperty(d, '_pristine', { value: body._pristine, enumerable: false, configurable: true, writable: true });
                    })
                    .catch(err => {
                        console.warn(`Could not rehydrate "${d.name}": ${err.message}`);
                        d._unavailable = true;
                    })
            );
        }
    }
    return Promise.all(jobs);
}

// Convert a raw catalog JSON body into app-shaped deck (same mapping as loadCatalogDeck).
function convertCatalogCards(deckData) {
    const categories = (deckData.categories || []).map(c => typeof c === 'string' ? { id: Utils.uid(), name: c } : c);
    const cards = (deckData.cards || []).map((c, i) => {
        const fb = c.fb || { timesRight: c.timesRight || 0, timesWrong: c.timesWrong || 0, timesRightSinceWrong: c.timesRightSinceWrong || 0, dateLastRight: DEFAULT_DATE, dateLastWrong: DEFAULT_DATE };
        const bf = c.bf || { timesRight: c.backTimesRight || 0, timesWrong: c.backTimesWrong || 0, timesRightSinceWrong: c.backTimesRightSinceWrong || 0, dateLastRight: DEFAULT_DATE, dateLastWrong: DEFAULT_DATE };
        return {
            id: c.id ? String(c.id) : `${deckData.id || 'deck'}_${i + 1}`,
            num: c.num || c.number || (i + 1),
            front: c.front || '',
            back: c.back || '',
            categoryId: c.categoryId || categories[0]?.id || '',
            category: c.category || categories[0]?.name || '',
            frequency: c.frequency || 1,
            editedDate: c.editedDate || Date.now(),
            fb, bf
        };
    });
    return {
        id: deckData.id,
        name: deckData.name,
        createdDate: deckData.createdDate,
        src: deckData.src,
        language: deckData.language,
        settings: deckData.settings || { fontSize: 24, maximumSelected: 10, headTmpl: '', frontTmpl: '', backTmpl: '' },
        categories,
        bundles: deckData.bundles || [],
        criteria: deckData.criteria || [],
        cards
    };
}

function getSessionLimit() {
    const el = document.getElementById('max-cards');
    if (el && el.value) {
        const v = parseInt(el.value, 10);
        if (!isNaN(v) && v > 0) return v;
    }
    const val = parseInt(localStorage.getItem('flashpro_session_limit') || '10', 10);
    return isNaN(val) || val <= 0 ? 10 : val;
}

function setSessionLimit(val) {
    const n = parseInt(val, 10);
    const limit = isNaN(n) || n <= 0 ? 10 : n;
    localStorage.setItem('flashpro_session_limit', limit);
    const el1 = document.getElementById('max-cards');
    if (el1 && parseInt(el1.value, 10) !== limit) el1.value = limit;
    const el2 = document.getElementById('drill-max-cards');
    if (el2 && parseInt(el2.value, 10) !== limit) el2.value = limit;
    if (typeof gatherCards === 'function') gatherCards();
}

function openModal(title, body, cb, okText = 'Confirm', cancelText = 'Dismiss', extraClass = '') {
    const modalBox = document.querySelector('#modal .modal');
    if (modalBox) {
        modalBox.className = 'modal' + (extraClass ? ' ' + extraClass : '');
    }
    const titleEl = document.getElementById('modal-title');
    if (titleEl) titleEl.textContent = title;
    const bodyEl = document.getElementById('modal-body');
    if (bodyEl) bodyEl.innerHTML = body;
    const okBtn = document.getElementById('modal-ok');
    if (okBtn) {
        okBtn.textContent = okText;
        okBtn.style.display = okText ? 'inline-block' : 'none';
    }
    const cancelBtn = document.getElementById('modal-cancel') || (typeof document.querySelector === 'function' ? document.querySelector('#modal footer .btn-secondary') : null);
    if (cancelBtn) {
        cancelBtn.textContent = cancelText;
        cancelBtn.style.display = cancelText ? 'inline-block' : 'none';
    }
    const modalEl = document.getElementById('modal');
    if (modalEl) modalEl.style.display = 'flex';
    State.modalCallback = cb;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
}
function closeModal() {
    const modalEl = document.getElementById('modal');
    if (modalEl) modalEl.style.display = 'none';
    const modalBox = document.querySelector('#modal .modal');
    if (modalBox) modalBox.className = 'modal';
    State.modalCallback = null;
}
function modalOk() { if (State.modalCallback) State.modalCallback(); closeModal(); }

