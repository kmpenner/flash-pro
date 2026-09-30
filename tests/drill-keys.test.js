// Drill keyboard shortcuts must act only in the drill view, and only in the
// right phase of a card (flip first, then judge).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./env.js');

const DEFAULT_DATE = 946684800000;
const m = () => ({ timesRight: 0, timesWrong: 0, timesRightSinceWrong: 0, dateLastRight: DEFAULT_DATE, dateLastWrong: DEFAULT_DATE });

function drillEnv(nCards = 2) {
    const deck = {
        id: 'd1', name: 'Deck', categories: [], bundles: [],
        criteria: [{ id: 'all', name: 'All', logic: '' }], settings: {},
        cards: Array.from({ length: nCards }, (_, i) => ({ id: 'c' + i, front: 'f' + i, back: 'b' + i, fb: m(), bf: m() })),
    };
    const env = createEnv({ storage: { flashpro_decks: JSON.stringify([deck]) } });
    env.run(`State.decks = Store.load(); State.curDeckId = 'd1'; State.selCriteriaId = 'all';`);
    env.run('startDrill()');
    env.document.getElementById('view-drill').classList.add('active');
    return env;
}

const answered = env => env.run('State.deck.cards.reduce((n, c) => n + c.fb.timesRight + c.fb.timesWrong, 0)');
const session = env => env.run('({ idx: State.drillSession.idx, flipped: State.drillSession.flipped })');

test('Y/N do nothing outside the drill view', () => {
    const env = drillEnv();
    env.run('flipCard()');
    env.document.getElementById('view-drill').classList.remove('active');
    env.document.getElementById('view-edit').classList.add('active');
    env.key('y'); env.key('n');
    assert.equal(answered(env), 0);
    assert.equal(session(env).idx, 0);
});

test('Y/N do nothing before the card is flipped', () => {
    const env = drillEnv();
    env.key('y'); env.key('N');
    assert.equal(answered(env), 0);
    assert.equal(session(env).flipped, false);
});

test('Space flips (as the help text says), then Y judges', () => {
    const env = drillEnv();
    assert.equal(env.key(' '), true, 'Space is consumed so the page does not scroll');
    assert.equal(session(env).flipped, true);
    env.key('y');
    assert.equal(answered(env), 1);
    assert.equal(session(env).idx, 1);
    assert.equal(session(env).flipped, false);
});

test('Y on the round-complete screen does not crash or record anything', () => {
    const env = drillEnv(1);
    env.key('Enter'); env.key('y');
    assert.equal(answered(env), 1);
    assert.ok(env.run('State.drillCountdownTimer'), 'round is complete');
    assert.doesNotThrow(() => env.key('y'));
    assert.doesNotThrow(() => env.run('judgeCard(true)'));
    assert.equal(answered(env), 1);
    env.run('cancelAutoRestart()');
});

test('Left arrow on the round-complete screen undoes the last answer', () => {
    const env = drillEnv(1);
    env.key(' '); env.key('n');
    assert.equal(env.run('State.deck.cards[0].fb.timesWrong'), 1);
    env.key('ArrowLeft');
    assert.equal(env.run('State.deck.cards[0].fb.timesWrong'), 0);
    assert.equal(env.run('State.drillCountdownTimer'), null);
});

test('Enter on the round-complete screen starts the next round', () => {
    const env = drillEnv(1);
    env.key(' '); env.key('y');
    env.key('Enter');
    assert.equal(env.run('State.drillCountdownTimer'), null);
    assert.equal(session(env).idx, 0);
});

test('keys typed into a text field are ignored', () => {
    const env = drillEnv();
    env.document.activeElement = { tagName: 'INPUT' };
    env.key(' ');
    assert.equal(session(env).flipped, false);
});
