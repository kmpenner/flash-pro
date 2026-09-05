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
    escAttr: (s) => String(s || '').replace(/"/g, '&quot;'),
    escJs: (s) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/</g, '\\x3c').replace(/>/g, '\\x3e').replace(/&(?!#\d+;|#x[0-9a-f]+;|[a-z]+;)/gi, '\\x26'),
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

function syncCardAcrossDecks(cardId, dir, metrics) {
    const curDeck = State.deck;
    const curCard = curDeck?.cards.find(c => c.id === cardId);
    for (const otherDeck of State.decks) {
        if (otherDeck.id === State.curDeckId) continue;
        const otherCard = otherDeck.cards.find(c => c.id === cardId || (curCard && curDeck.src && otherDeck.src && c.front === curCard.front));
        if (otherCard) {
            otherCard[dir] = { ...metrics };
        }
    }
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
// Catalog decks (loaded from the repo's data/ files) are READ-ONLY bodies:
// localStorage keeps only a stub (id, name, catalogFile, selections) plus the
// user's per-card study metrics. The card/panel content is rehydrated from the
// repo on load. This keeps a multi-corpus workspace well inside the ~5MB
// localStorage quota (Greek NT alone is 3MB; Qumran 2MB+).
// User decks (Athenaze, imported, hand-built) persist in full, as before.

const CATALOG_STUB_FIELDS = ['id', 'name', 'createdDate', 'src', 'language',
    'catalogFile', 'metrics', 'criteriaSelection', 'userEdits'];

function isCatalogDeck(d) { return !!(d && d.catalogFile); }

function makeCatalogStub(d) {
    // metrics: cardId -> {fb:{...}, bf:{...}} but only for cards with any activity
    const metrics = {};
    for (const c of d.cards) {
        const fb = c.fb || {}, bf = c.bf || {};
        const active = (fb.timesRight || fb.timesWrong || bf.timesRight || bf.timesWrong ||
            (fb.dateLastRight && fb.dateLastRight !== DEFAULT_DATE) ||
            (fb.dateLastWrong && fb.dateLastWrong !== DEFAULT_DATE) ||
            (bf.dateLastRight && bf.dateLastRight !== DEFAULT_DATE) ||
            (bf.dateLastWrong && bf.dateLastWrong !== DEFAULT_DATE));
        if (active) metrics[c.id] = { fb: { ...fb }, bf: { ...bf } };
    }
    // user content edits on card fronts/backs (catalog cards are otherwise immutable)
    const userEdits = {};
    for (const c of d.cards) {
        if (c._userEdited) {
            userEdits[c.id] = { front: c.front, back: c.back, frequency: c.frequency, categoryId: c.categoryId };
        }
    }
    return {
        id: d.id, name: d.name, createdDate: d.createdDate,
        src: d.src, language: d.language, catalogFile: d.catalogFile,
        metrics, userEdits,
        criteriaSelection: State.selCriteriaId === d.id ? '' : undefined,
    };
}

function rehydrateCatalogDeck(stub, full) {
    // apply saved study metrics onto the freshly fetched read-only body
    const metrics = stub.metrics || {};
    for (const c of full.cards) {
        const m = metrics[c.id];
        if (m) {
            c.fb = { ...c.fb, ...m.fb };
            c.bf = { ...c.bf, ...m.bf };
        }
    }
    const edits = stub.userEdits || {};
    for (const c of full.cards) {
        const e = edits[c.id];
        if (e) { c.front = e.front; c.back = e.back; c.frequency = e.frequency; c.categoryId = e.categoryId; }
    }
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

const Store = {
    load() { return JSON.parse(localStorage.getItem('flashpro_decks') || '[]') },
    save(decks) {
        const out = decks.map(d => isCatalogDeck(d) ? makeCatalogStub(d) : d);
        try {
            localStorage.setItem('flashpro_decks', JSON.stringify(out));
        } catch (e) {
            // fall back: drop metrics from stubs before giving up
            const lean = out.map(d => d.metrics ? { ...d, metrics: {} } : d);
            try { localStorage.setItem('flashpro_decks', JSON.stringify(lean)); }
            catch (_) { alert('Storage full: could not save. Export your decks from the I/O tab.'); }
        }
    },
    currentId() { return localStorage.getItem('flashpro_cur') || '' },
    setCur(id) { localStorage.setItem('flashpro_cur', id) },
};

function save() { Store.save(State.decks); }

// Persist only the stub for one catalog deck without a full-state save.
// For catalog decks, save() serializes all decks; the stub form makes that cheap
// regardless, so plain save() is fine — this alias documents intent.
function saveCatalogStub() { save(); }

// Rehydrate all catalog stubs from their repo files at startup.
// Returns a promise resolving when every stub has a full body (or fell back to stub-only).
function rehydrateCatalogDecks() {
    const jobs = [];
    for (const d of State.decks) {
        if (isCatalogDeck(d) && !d.cards) {
            jobs.push(
                fetchCatalogDeckFile(d.catalogFile)
                    .then(full => Object.assign(d, rehydrateCatalogDeck(d, convertCatalogCards(full))))
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

