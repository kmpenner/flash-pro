// Answering a card saves only the decks it changed, and the large Athenaze
// datasets load only when a deck is built from them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEnv, settle } = require('./env.js');

const FILE = 'data/test_deck.json';
const DEFAULT_DATE = 946684800000;
const m = () => ({ timesRight: 0, timesWrong: 0, timesRightSinceWrong: 0, dateLastRight: DEFAULT_DATE, dateLastWrong: DEFAULT_DATE });
const card = (id, front) => ({ id, front, back: 'g', categoryId: '', frequency: 0, fb: m(), bf: m() });
const deck = (id, cards, src) => ({
    id, name: id, categories: [], bundles: [], settings: {}, src,
    criteria: [{ id: 'all', name: 'All', logic: '' }], cards,
});

// Two Athenaze-style decks sharing a word (synced by front text), one unrelated
// deck, and a library deck saved as a stub.
async function studyEnv() {
    const lib = deck('deck_lib', [card('L1', 'λόγος'), card('L2', 'θεός')]);
    const storage = {
        flashpro_decks: JSON.stringify([
            deck('ch1', [card('a1', 'ἀγρός'), card('a2', 'λόγος')], { kind: 'athenaze', ch: 1 }),
            deck('all', [card('m1', 'ἀγρός'), card('m9', 'οἶκος')], { kind: 'athenaze', ch: 'all' }),
            deck('mine', [card('x1', 'amo')]),
            { id: 'deck_lib', name: 'Library', catalogFile: FILE },
        ]),
    };
    const env = createEnv({ storage, files: { [FILE]: lib } });
    env.run(`State.decks = Store.load(); State.curDeckId = 'ch1'; State.selCriteriaId = 'all';`);
    await env.run('rehydrateCatalogDecks()');
    return env;
}

const stored = env => Object.fromEntries(JSON.parse(env.store.flashpro_decks).map(d => [d.id, d]));

function countStubBuilds(env) {
    env.run(`var __stubs = 0; const __mk = makeCatalogStub;
             makeCatalogStub = d => { __stubs++; return __mk(d); };`);
    return () => env.run('__stubs');
}

test('answering a card re-serializes only the decks it changed', async () => {
    const env = await studyEnv();
    env.run('save()');
    const stubs = countStubBuilds(env);
    env.run(`gatherCards(); startDrill(); flipCard(); judgeCard(true);`);
    assert.equal(stubs(), 0, 'the untouched library deck is not re-diffed');
    const s = stored(env);
    assert.equal(s.ch1.cards.filter(c => c.fb.timesRight === 1).length, 1, 'the answer is saved');
    assert.deepEqual(Object.keys(s), ['ch1', 'all', 'mine', 'deck_lib']);
    assert.equal(s.deck_lib.cards, undefined, 'library deck still stored as a stub');
});

test('a synced copy in another deck is saved with the answer', async () => {
    const env = await studyEnv();
    env.run(`save(); State.gatheredCards = [{ ...State.deck.cards[0], _dir: 'fb' }];
             State.drillSession = { cards: [...State.gatheredCards], idx: 0, flipped: true, right: 0, wrong: 0, history: [] };
             judgeCard(false);`);
    let s = stored(env);
    assert.equal(s.ch1.cards[0].fb.timesWrong, 1);
    assert.equal(s.all.cards[0].fb.timesWrong, 1, 'master deck copy (same front) saved');
    assert.equal(s.mine.cards[0].fb.timesWrong, 0);
    // Undo restores both copies in storage.
    env.run('prevCard()');
    s = stored(env);
    assert.equal(s.ch1.cards[0].fb.timesWrong, 0);
    assert.equal(s.all.cards[0].fb.timesWrong, 0);
});

test('earlier edits to other decks survive a later partial save', async () => {
    const env = await studyEnv();
    // Edit the library deck and a plain deck through normal full saves ...
    env.run(`const lib = State.decks.find(d => d.id === 'deck_lib');
             lib.cards[0].back = 'word, reason'; save();
             State.decks.find(d => d.id === 'mine').cards[0].back = 'I love'; save();`);
    // ... then answer in another deck.
    env.run(`gatherCards(); startDrill(); flipCard(); judgeCard(true);`);
    const s = stored(env);
    assert.equal(s.mine.cards[0].back, 'I love');
    assert.equal(s.deck_lib.userEdits.L1.back, 'word, reason');
});

test('answering in a library deck saves its stub diff', async () => {
    const env = await studyEnv();
    env.run(`save(); switchDeck('deck_lib'); State.selCriteriaId = 'all';
             State.gatheredCards = [{ ...State.deck.cards[1], _dir: 'fb' }];
             State.drillSession = { cards: [...State.gatheredCards], idx: 0, flipped: true, right: 0, wrong: 0, history: [] };
             judgeCard(true);`);
    const s = stored(env);
    assert.equal(s.deck_lib.metrics.L2.fb.timesRight, 1);
    assert.equal(s.deck_lib.cards, undefined, 'still stored as a stub');
});

// --- Athenaze data loads on demand -----------------------------------------

const deckNames = env => [...env.run('State.decks.map(d => d.name)')];

test('index.html no longer loads the MDB and Extended data up front', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.doesNotMatch(html, /athenaze-mdb-data\.js|athenaze-extended-data\.js/);
    assert.match(html, /<script src="athenaze-data\.js"><\/script>/);
});

test('first visit builds the default decks, adding the MDB deck once its data loads', async () => {
    const env = createEnv({ boot: true });
    assert.equal(env.run('State.decks.length'), 17, '16 chapters + master, available immediately');
    await settle();
    assert.deepEqual(env.loadedScripts, ['athenaze-mdb-data.js']);
    const names = deckNames(env);
    assert.equal(names.length, 18);
    assert.match(names.at(-1), /Authentic MDB/);
    assert.equal(JSON.parse(env.store.flashpro_decks).length, 18, 'MDB deck saved');
    assert.match(env.document.getElementById('deck-select').innerHTML, /Authentic MDB/, 'deck menu refreshed');
});

test('a returning visit loads no Athenaze data scripts', async () => {
    const first = createEnv({ boot: true });
    await settle();
    const env = createEnv({ boot: true, storage: { ...first.store } });
    await settle();
    assert.deepEqual(env.loadedScripts, []);
    assert.equal(env.run('State.decks.length'), 18);
});

test('?deck=extended&drill=1 loads the Extended Lexicon, then drills it', async () => {
    const first = createEnv({ boot: true });
    await settle();
    const env = createEnv({ boot: true, storage: { ...first.store }, search: '?deck=extended&drill=1' });
    assert.equal(env.run('State.drillSession'), null, 'waits for the data');
    await settle();
    assert.deepEqual(env.loadedScripts, ['athenaze-extended-data.js']);
    assert.match(env.run('State.deck.name'), /Extended Lexicon/);
    assert.ok(env.run('State.drillSession.cards.length') > 0);
    assert.ok(JSON.parse(env.store.flashpro_decks).some(d => /Extended Lexicon/.test(d.name)), 'saved');
});

test('?deck=mdb switches at once when the deck already exists', async () => {
    const first = createEnv({ boot: true });
    await settle();
    const env = createEnv({ boot: true, storage: { ...first.store }, search: '?deck=mdb' });
    assert.match(env.run('State.deck.name'), /Authentic MDB/);
    await settle();
    assert.deepEqual(env.loadedScripts, []);
});

test('Load Extended Lexicon, Restore Athenaze and the JSON download fetch their data first', async () => {
    const env = createEnv();
    env.run(`State.decks = [mkDeck('Mine')]; State.curDeckId = State.decks[0].id;`);
    await env.run('loadExtendedLexiconDeck()');
    assert.match(env.run('State.deck.name'), /Extended Lexicon/);
    assert.deepEqual(env.alerts, ['Loaded Athenaze Extended Lexicon (1,220 cards).']);

    await env.run('downloadMdbDeckJson()');
    assert.deepEqual(env.loadedScripts, ['athenaze-extended-data.js', 'athenaze-mdb-data.js']);
    assert.equal(env.alerts.length, 1, 'no "not loaded" alert');

    await env.run(`restoreAthenazeDecks(); State.modalCallback()`);
    assert.ok(deckNames(env).some(n => /Authentic MDB/.test(n)), 'restore includes the MDB deck');
});

test('a failed data load leaves the app usable', async () => {
    const env = createEnv();
    env.run(`State.decks = [mkDeck('Mine')]; State.curDeckId = State.decks[0].id;
             ATHENAZE_DATA_SCRIPTS.extended = 'missing.js';`);
    await env.run('loadExtendedLexiconDeck()');
    assert.deepEqual(env.alerts, ['Extended Lexicon dataset not available.']);
    assert.equal(env.run('State.decks.length'), 1);
});
