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

    get deck() { return this.decks.find(d => d.id === this.curDeckId) || null }
};

const Utils = {
    uid: () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    now: () => Date.now(),
    dayMs: 86400000,
    escH: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    escAttr: (s) => String(s || '').replace(/"/g, '&quot;'),
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

const Store = {
    load() { return JSON.parse(localStorage.getItem('flashpro_decks') || '[]') },
    save(decks) { localStorage.setItem('flashpro_decks', JSON.stringify(decks)) },
    currentId() { return localStorage.getItem('flashpro_cur') || '' },
    setCur(id) { localStorage.setItem('flashpro_cur', id) },
};

function save() { Store.save(State.decks); }

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

function openModal(title, body, cb, okText = 'Confirm', cancelText = 'Dismiss') {
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
}
function closeModal() {
    const modalEl = document.getElementById('modal');
    if (modalEl) modalEl.style.display = 'none';
    State.modalCallback = null;
}
function modalOk() { if (State.modalCallback) State.modalCallback(); closeModal(); }
