// Catalog (library) decks are saved as a stub + diff and rehydrated from their
// repo file on load. These tests round-trip user changes through that cycle.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv, readData } = require('./env.js');

const FILE = 'data/test_deck.json';
const DEFAULT_DATE = 946684800000;
const m = (over = {}) => ({ timesRight: 0, timesWrong: 0, timesRightSinceWrong: 0, dateLastRight: DEFAULT_DATE, dateLastWrong: DEFAULT_DATE, ...over });

function catalogFile() {
    return {
        id: 'deck_test', name: 'Test Deck', language: 'Greek',
        categories: [{ id: 'cat_n', name: 'Noun' }],
        bundles: [{ id: 'b1', name: 'Lesson 1', cardIds: ['c1', 'c2'] }],
        criteria: [{ id: 'cr1', name: 'All Cards', logic: '' }],
        settings: { fontSize: 24, headTmpl: '', frontTmpl: '', backTmpl: '' },
        cards: [
            { id: 'c1', front: 'λόγος', back: 'word', categoryId: 'cat_n', frequency: 330, fb: m(), bf: m() },
            { id: 'c2', front: 'ἄνθρωπος', back: 'man', categoryId: 'cat_n', frequency: 550, fb: m(), bf: m() },
            // ships with study history baked into the file (as several real decks do)
            { id: 'c3', front: 'θεός', back: 'god', categoryId: 'cat_n', frequency: 1317, fb: m({ timesRight: 4, dateLastRight: 1e12 }), bf: m() },
        ],
    };
}

async function freshSession(storage, files = { [FILE]: catalogFile() }) {
    const env = createEnv({ storage, files });
    env.run(`State.decks = Store.load(); State.curDeckId = State.decks[0]?.id || '';`);
    await env.run('rehydrateCatalogDecks()');
    return env;
}

async function firstLoad() {
    const env = createEnv({ files: { [FILE]: catalogFile() } });
    env.run(`window.FLASH_PRO_CATALOG = [{ id: 'deck_test', title: 'Test Deck', language: 'Greek', file: '${FILE}' }];`);
    await env.run(`loadCatalogDeck('deck_test')`);
    assert.equal(env.run('State.deck.id'), 'deck_test');
    return env;
}

const card = (env, id) => env.run(`State.decks[0].cards.find(c => c.id === '${id}')`);

test('card edits, additions and deletions on a library deck survive reload', async () => {
    const env = await firstLoad();
    env.run(`
        const d = State.deck;
        const c1 = d.cards.find(c => c.id === 'c1');
        c1.front = 'ὁ λόγος'; c1.back = 'word, message'; c1.frequency = 331;
        d.cards = d.cards.filter(c => c.id !== 'c2');
        const added = mkCard('ἀγάπη', 'love', 'cat_n', 116); added.id = 'mine1';
        d.cards.push(added);
        save();
    `);
    const stub = JSON.parse(env.store.flashpro_decks)[0];
    assert.equal(stub.cards, undefined, 'library deck is stored as a stub, not in full');

    const env2 = await freshSession(env.store);
    assert.equal(card(env2, 'c1').front, 'ὁ λόγος');
    assert.equal(card(env2, 'c1').back, 'word, message');
    assert.equal(card(env2, 'c1').frequency, 331);
    assert.equal(card(env2, 'c2'), undefined, 'deleted card stays deleted');
    assert.equal(card(env2, 'mine1').front, 'ἀγάπη');
    assert.equal(env2.run('State.decks[0].cards.length'), 3);
});

test('bundles, criteria, categories and settings changes on a library deck survive reload', async () => {
    const env = await firstLoad();
    env.run(`
        const d = State.deck;
        d.bundles.push({ id: 'b_mine', name: 'Hard words', cardIds: ['c3'] });
        d.bundles[0].cardIds = ['c1'];
        d.criteria.push({ id: 'cr_mine', name: 'Common', logic: 'Frequency > 500' });
        d.categories.push({ id: 'cat_v', name: 'Verb' });
        d.settings.fontSize = 40;
        save();
    `);
    const env2 = await freshSession(env.store);
    const d = env2.run('State.decks[0]');
    assert.deepEqual([...d.bundles.map(b => b.id)], ['b1', 'b_mine']);
    assert.deepEqual([...d.bundles[0].cardIds], ['c1']);
    assert.ok(d.criteria.some(c => c.id === 'cr_mine' && c.logic === 'Frequency > 500'));
    assert.ok(d.categories.some(c => c.id === 'cat_v'));
    assert.equal(d.settings.fontSize, 40);
});

test('unchanged library deck stores only an empty diff', async () => {
    const env = await firstLoad();
    const stub = JSON.parse(env.store.flashpro_decks)[0];
    assert.deepEqual(stub.metrics, {});
    assert.deepEqual(stub.userEdits, {});
    assert.deepEqual(stub.addedCards, []);
    assert.deepEqual(stub.deletedIds, []);
    assert.deepEqual(stub.overrides, {});
    assert.deepEqual(stub.bundleEdits, { changed: [], removed: [] });
});

test('only changed bundles are stored, and deleted bundles stay deleted', async () => {
    const file = catalogFile();
    file.bundles.push({ id: 'b2', name: 'Lesson 2', cardIds: ['c3'] }, { id: 'b3', name: 'Lesson 3', cardIds: ['c1'] });
    const env = createEnv({ files: { [FILE]: file } });
    env.run(`window.FLASH_PRO_CATALOG = [{ id: 'deck_test', title: 'Test Deck', file: '${FILE}' }];`);
    await env.run(`loadCatalogDeck('deck_test')`);
    env.run(`
        State.deck.bundles = State.deck.bundles.filter(b => b.id !== 'b2');
        State.deck.bundles.find(b => b.id === 'b3').name = 'Lesson 3 (review)';
        save();
    `);
    const stub = JSON.parse(env.store.flashpro_decks)[0];
    assert.deepEqual(stub.bundleEdits.changed.map(b => b.id), ['b3'], 'untouched bundles are not stored');
    assert.deepEqual(stub.bundleEdits.removed, ['b2']);

    const env2 = await freshSession(env.store, { [FILE]: file });
    const bundles = env2.run('State.decks[0].bundles');
    assert.deepEqual([...bundles.map(b => b.id)], ['b1', 'b3']);
    assert.equal(bundles[1].name, 'Lesson 3 (review)');
});

test('study progress and cleared history both survive reload', async () => {
    const env = await firstLoad();
    env.run(`
        const d = State.deck;
        const c1 = d.cards.find(c => c.id === 'c1');
        c1.fb.timesRight = 2; c1.fb.dateLastRight = 1.7e12;
        // clear the history that c3 shipped with in the file
        d.cards.find(c => c.id === 'c3').fb = { timesRight: 0, timesWrong: 0, timesRightSinceWrong: 0, dateLastRight: DEFAULT_DATE, dateLastWrong: DEFAULT_DATE };
        save();
    `);
    const env2 = await freshSession(env.store);
    assert.equal(card(env2, 'c1').fb.timesRight, 2);
    assert.equal(card(env2, 'c1').fb.dateLastRight, 1.7e12);
    assert.equal(card(env2, 'c3').fb.timesRight, 0, 'cleared history is not restored from the file');
    assert.equal(card(env2, 'c3').fb.dateLastRight, DEFAULT_DATE);
});

test('pre-fix stubs (metrics + userEdits only) still rehydrate', async () => {
    const oldStub = [{
        id: 'deck_test', name: 'Test Deck', catalogFile: FILE,
        metrics: { c1: { fb: m({ timesRight: 7 }), bf: m() } },
        userEdits: { c2: { front: 'ἄνθρωπος, ὁ', back: 'human being', frequency: 550, categoryId: 'cat_n' } },
    }];
    const env = await freshSession({ flashpro_decks: JSON.stringify(oldStub) });
    assert.equal(card(env, 'c1').fb.timesRight, 7);
    assert.equal(card(env, 'c2').back, 'human being');
    assert.equal(card(env, 'c3').fb.timesRight, 4, 'file metrics kept where the user has none');
});

test('rehydration keeps the saved deck id even if the file id differs', async () => {
    const stub = [{ id: 'deck_saved_id', name: 'Test Deck', catalogFile: FILE, metrics: {} }];
    const env = await freshSession({ flashpro_decks: JSON.stringify(stub) });
    assert.equal(env.run('State.decks[0].id'), 'deck_saved_id');
});

test('saving while a library deck is unavailable keeps its saved progress', async () => {
    const stub = {
        id: 'deck_test', name: 'Test Deck', catalogFile: FILE,
        metrics: { c1: { fb: m({ timesRight: 9 }), bf: m() } }, userEdits: {},
        addedCards: [], deletedIds: [], overrides: { settings: { fontSize: 40 } },
    };
    const user = { id: 'deck_user', name: 'Mine', categories: [], bundles: [], criteria: [], settings: {},
        cards: [{ id: 'u1', front: 'a', back: 'b', fb: m(), bf: m() }] };
    // no files: every fetch fails, as when opened offline or from file://
    const env = await freshSession({ flashpro_decks: JSON.stringify([stub, user]) }, {});
    assert.equal(env.run('State.decks[0]._unavailable'), true);

    env.run(`State.curDeckId = 'deck_user'; save();`);
    const saved = JSON.parse(env.store.flashpro_decks);
    assert.deepEqual(saved[0], stub, 'stub passes through unchanged');
    assert.equal(saved[0]._unavailable, undefined);
});

test('drilling another deck works while a library deck is unavailable', async () => {
    const stub = { id: 'deck_test', name: 'Test Deck', catalogFile: FILE, metrics: {} };
    const user = { id: 'deck_user', name: 'Mine', src: { kind: 'user' }, categories: [], bundles: [],
        criteria: [{ id: 'all', name: 'All', logic: '' }], settings: {},
        cards: [{ id: 'u1', front: 'a', back: 'b', fb: m(), bf: m() }] };
    const env = await freshSession({ flashpro_decks: JSON.stringify([stub, user]) }, {});
    env.run(`State.curDeckId = 'deck_user'; State.selCriteriaId = 'all';`);
    env.run('startDrill(); flipCard(); judgeCard(true);');
    const saved = JSON.parse(env.store.flashpro_decks);
    assert.equal(saved[1].cards[0].fb.timesRight, 1);
});

test('an imported copy of an exported library deck is saved in full', async () => {
    const env = await firstLoad();
    const exported = JSON.stringify(env.run('State.deck'));
    assert.ok(JSON.parse(exported).catalogFile, 'export carries catalogFile');
    env.ctx.exported = exported;
    env.run(`handleLoadDeck({ target: { files: [{ text: exported }], value: '' } })`);
    const saved = JSON.parse(env.store.flashpro_decks);
    assert.equal(saved.length, 2);
    assert.equal(saved[1].catalogFile, undefined);
    assert.equal(saved[1].cards.length, 3, 'imported copy keeps its cards in storage');
});

test('real data: clearing shipped history on hebrew_alphabet survives reload', async () => {
    const file = 'data/hebrew_alphabet.json';
    const data = readData(file);
    const shipped = data.cards.find(c => (c.fb && c.fb.timesRight) || c.timesRight);
    assert.ok(shipped, 'fixture has a card with shipped history');
    const env = createEnv({ files: { '*': 'disk' } });
    env.run(`window.FLASH_PRO_CATALOG = [{ id: '${data.id}', title: 'x', file: '${file}' }];`);
    await env.run(`loadCatalogDeck('${data.id}')`);
    env.run(`
        const c = State.deck.cards.find(c => c.id === '${shipped.id}');
        c.fb = { timesRight: 0, timesWrong: 0, timesRightSinceWrong: 0, dateLastRight: DEFAULT_DATE, dateLastWrong: DEFAULT_DATE };
        c.back = 'edited gloss';
        save();
    `);
    const env2 = createEnv({ storage: env.store, files: { '*': 'disk' } });
    env2.run(`State.decks = Store.load();`);
    await env2.run('rehydrateCatalogDecks()');
    const c = env2.run(`State.decks[0].cards.find(c => c.id === '${shipped.id}')`);
    assert.equal(c.fb.timesRight, 0);
    assert.equal(c.back, 'edited gloss');
    assert.equal(env2.run('State.decks[0].cards.length'), data.cards.length);
});
