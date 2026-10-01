const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createEnv, parseElements, findElement } = require('./env.js');

const NOW = Date.UTC(2026, 8, 30);
const DAY = 86400000;

// The engine this parser replaced: rules were rewritten into JavaScript and run
// with Function(). Kept here as the reference the parser must agree with.
const OLD_ENGINE = `(function (logic, card_obj, dir) {
    if (!logic || !logic.trim()) return true;
    const m = card_obj[dir] || {};
    const nowMs = Utils.now();
    let dlr = m.dateLastRight || DEFAULT_DATE;
    let dlw = m.dateLastWrong || DEFAULT_DATE;
    let drsw = 0;
    if (dlr !== DEFAULT_DATE && (dlw === DEFAULT_DATE || dlr > dlw)) { drsw = (nowMs - dlr) / Utils.dayMs; }
    const ctx = {
        Now: nowMs, NOW: nowMs, Frequency: card_obj.frequency || 0,
        TimesRight: m.timesRight || 0, TimesWrong: m.timesWrong || 0,
        TimesRightSinceWrong: m.timesRightSinceWrong || 0,
        DateLastRight: dlr, DateLastWrong: dlw,
        LastRightTime: dlr, LastWrongTime: dlw,
        DaysRightSinceWrong: drsw,
    };
    let expr = logic;
    expr = expr.replace(/([^!<>=])=([^=])/g, '$1==$2');
    for (const [k, v] of Object.entries(ctx)) {
        expr = expr.replace(new RegExp('\\\\b' + k + '\\\\b', 'g'), String(v));
    }
    expr = expr.replace(/\\bAND\\b/gi, '&&').replace(/\\bOR\\b/gi, '||');
    try { return !!Function('"use strict";return(' + expr + ')')(); } catch (err) { return false; }
})`;

function env() {
    const e = createEnv();
    e.run(`Utils.now = () => ${NOW};`);
    return e;
}

// Every rule the app ships: deck files, new-deck defaults, presets, the manual.
function shippedRules(e) {
    const rules = new Set(['', 'TimesRight < 5', 'Frequency > 50', '(Now - DateLastRight) > 86400000']);
    const dataDir = path.join(__dirname, '..', 'data');
    for (const f of fs.readdirSync(dataDir).filter(f => f.endsWith('.json'))) {
        const d = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
        for (const c of (d && d.criteria) || []) rules.add(c.logic || '');
    }
    for (const c of e.run('mkDeck().criteria')) rules.add(c.logic);
    for (const p of e.run('DRILL_PRESETS')) rules.add(p.logic);
    return [...rules];
}

function sampleCards() {
    const metrics = [
        undefined,
        { timesRight: 0, timesWrong: 0, timesRightSinceWrong: 0, dateLastRight: null, dateLastWrong: null },
        { timesRight: 3, timesWrong: 0, timesRightSinceWrong: 3, dateLastRight: NOW - 2 * DAY, dateLastWrong: null },
        { timesRight: 5, timesWrong: 2, timesRightSinceWrong: 1, dateLastRight: NOW - 10 * DAY, dateLastWrong: NOW - 12 * DAY },
        { timesRight: 5, timesWrong: 2, timesRightSinceWrong: 0, dateLastRight: NOW - 10 * DAY, dateLastWrong: NOW - DAY },
        { timesRight: 9, timesWrong: 1, timesRightSinceWrong: 8, dateLastRight: NOW - 30 * DAY, dateLastWrong: NOW - 31 * DAY },
    ];
    const cards = [];
    for (const frequency of [0, 1, 10, 150, 250]) {
        for (const fb of metrics) cards.push({ id: 'c' + cards.length, front: 'x', frequency, fb });
    }
    return cards;
}

test('every shipped rule selects the same cards as the old Function() engine', () => {
    const e = env();
    e.ctx.__old = e.run(OLD_ENGINE);
    e.ctx.__cards = sampleCards();
    const rules = shippedRules(e);
    assert.ok(rules.length >= 10, `found ${rules.length} rules`);
    for (const rule of rules) {
        e.ctx.__rule = rule;
        const got = e.run(`__cards.map(c => evaluateCriteria(__rule, c, 'fb', true))`);
        const want = e.run(`__cards.map(c => __old(__rule, c, 'fb'))`);
        assert.deepStrictEqual([...got], [...want], rule);
    }
});

test('operators follow JavaScript precedence and semantics', () => {
    const e = env();
    const card = { frequency: 4, fb: { timesRight: 2, timesWrong: 1 } };
    e.ctx.__card = card;
    const ev = rule => e.run(`evaluateCriteria(${JSON.stringify(rule)}, __card, 'fb', true)`);
    assert.strictEqual(ev('1 + 2 * 3 == 7'), true);
    assert.strictEqual(ev('(1 + 2) * 3 == 9'), true);
    assert.strictEqual(ev('Frequency % 3 = 1'), true);
    assert.strictEqual(ev('-Frequency < 0 AND +TimesRight == 2'), true);
    assert.strictEqual(ev('Frequency <> 4'), false);
    assert.strictEqual(ev('Frequency === 4 && TimesWrong !== 0'), true);
    assert.strictEqual(ev('TimesWrong > 5 OR TimesRight >= 2 AND Frequency < 1'), false);
    assert.strictEqual(ev('(TimesWrong > 5 OR TimesRight >= 2) AND Frequency > 1'), true);
    assert.strictEqual(ev('0.5 * 8 == Frequency'), true);
    assert.strictEqual(ev('true AND NOT false'), true);
    assert.strictEqual(ev('(Now - DateLastRight) > DayMs'), true);
});

test('NOT covers a whole comparison, like SQL; ! binds tightly, like JavaScript', () => {
    const e = env();
    e.ctx.__card = { frequency: 4 };
    const ev = rule => e.run(`evaluateCriteria(${JSON.stringify(rule)}, __card, 'fb', true)`);
    assert.strictEqual(ev('NOT Frequency > 5'), true);
    assert.strictEqual(ev('!Frequency > 5'), false);
    assert.strictEqual(ev('NOT Frequency = 4 OR Frequency = 4'), true);
    assert.strictEqual(ev('Frequency > 1 AND NOT Frequency > 3'), false);
});

test('names are case-insensitive', () => {
    const e = env();
    e.ctx.__card = { frequency: 4, fb: { timesRight: 2 } };
    assert.strictEqual(e.run(`evaluateCriteria('frequency = 4 and TIMESRIGHT = 2 and now > 0', __card, 'fb', true)`), true);
});

test('rules cannot run code', () => {
    const e = env();
    e.ctx.__card = { frequency: 1 };
    const attacks = [
        'alert(1)',
        'globalThis.pwned = 1',
        'constructor.constructor("globalThis.pwned = 1")()',
        '__proto__',
        'Frequency; globalThis.pwned = 1',
        '(pwned = 1)',
        '`${pwned}`',
        'Frequency[0]',
        '[].map',
    ];
    // Names that are not metrics read card fields, so `globalThis.pwned = 1`
    // is a harmless comparison with a field no card has. Anything that would
    // call, assign or index is a syntax error.
    const inert = new Set(['globalThis.pwned = 1', '(pwned = 1)', '__proto__']);
    for (const rule of attacks) {
        if (!inert.has(rule)) assert.throws(() => e.run(`evaluateCriteria(${JSON.stringify(rule)}, __card, 'fb', true)`), undefined, rule);
        assert.strictEqual(e.run(`evaluateCriteria(${JSON.stringify(rule)}, __card, 'fb')`), false, rule);
    }
    e.ctx.__card = Object.assign(Object.create({ inherited: 1 }), { frequency: 1 });
    // Field reads see only the card's own data, never inherited properties.
    for (const p of ['inherited', 'constructor', '__proto__', '__proto__.inherited', 'frequency.constructor', 'toString']) {
        assert.strictEqual(e.run(`criteriaField(__card, ${JSON.stringify(p.split('.'))})`), undefined, p);
    }
    assert.strictEqual(e.run(`evaluateCriteria('inherited = 1', __card, 'fb', true)`), false);
    assert.strictEqual(e.run('typeof pwned'), 'undefined');
});

test('the Run Test button reports syntax errors', () => {
    const e = env();
    e.run(`State.decks = [mkDeck('T')]; State.curDeckId = State.decks[0].id;
           State.deck.cards.push(mkCard('a', 'b'));`);
    const cases = {
        'Frequency >': 'Unexpected end of rule',
        '(Frequency': 'Expected ")"',
        'Frequency ) ': 'Unexpected ")"',
        'Frequency @ 2': 'Unexpected "@" at position 11',
        'Freqency > 1': 'Unknown name "Freqency"',
    };
    for (const [rule, msg] of Object.entries(cases)) {
        e.document.getElementById('crit-logic').value = rule;
        e.run('testCriteria()');
        assert.match(e.document.getElementById('crit-test-result').textContent, new RegExp('Error: .*' + msg.replace(/[()]/g, '\\$&')), rule);
    }
    e.document.getElementById('crit-logic').value = 'TimesRight = 0';
    e.run('testCriteria()');
    assert.strictEqual(e.document.getElementById('crit-test-result').textContent, '→ 1 card(s) match');
});

test('gather with a malformed rule matches nothing', () => {
    const e = env();
    e.run(`State.decks = [mkDeck('T')]; State.curDeckId = State.decks[0].id;
           State.deck.cards.push(mkCard('a', 'b'));
           State.deck.criteria.push({ id: 'bad', name: 'Bad', logic: 'Frequency >' });
           State.selCriteriaId = 'bad'; gatherCards();`);
    assert.strictEqual(e.run('State.gatheredCards.length'), 0);
});

test('a rule is compiled once, not once per card', () => {
    const e = env();
    e.run(`State.decks = [mkDeck('T')]; State.curDeckId = State.decks[0].id;
           for (let i = 0; i < 50; i++) State.deck.cards.push(mkCard('w' + i, 'g'));
           State.selCriteriaId = State.deck.criteria[0].id;
           var __parses = 0; const __parse = parseCriteria;
           parseCriteria = src => { __parses++; return __parse(src); };
           _criteriaCache.clear();
           gatherCards(); gatherCards();`);
    assert.strictEqual(e.run('__parses'), 1);
    assert.match(e.document.getElementById('gathered-count').textContent, /^\(50 matched/);
});

test('bundle filter gathers exactly the cards in the selected bundles', () => {
    const e = env();
    e.run(`State.decks = [mkDeck('T')]; State.curDeckId = State.decks[0].id;
           const d = State.deck;
           for (let i = 0; i < 6; i++) { const c = mkCard('w' + i, 'g'); c.id = 'c' + i; d.cards.push(c); }
           d.bundles = [{ id: 'b1', name: 'B1', cardIds: ['c0', 'c1'] },
                        { id: 'b2', name: 'B2', cardIds: ['c1', 'c4'] },
                        { id: 'b3', name: 'B3', cardIds: ['c5'] }];
           State.selCriteriaId = d.criteria.find(c => c.name === 'All Cards').id;
           State.selBundleIds = new Set(['b1', 'b2']);
           document.getElementById('gather-sort').value = 'order';
           gatherCards();`);
    assert.deepStrictEqual([...e.run('State.gatheredCards.map(c => c.id)')].sort(), ['c0', 'c1', 'c4']);
});

// --- Ids in rendered lists -------------------------------------------------

const NASTY_IDS = [
    `x" onmouseover="globalThis.pwned=1" y="`,
    `a'b\\c`,
    `&#39;);globalThis.pwned=1;//`,
    `</div><img src=x onerror="globalThis.pwned=1">`,
];

test('bundle, criteria and category ids stay inert in the Select lists and still work', () => {
    const e = env();
    e.run(`State.decks = [mkDeck('T')]; State.curDeckId = State.decks[0].id;`);
    e.ctx.__ids = NASTY_IDS;
    e.run(`const d = State.deck;
           d.bundles = __ids.map((id, i) => ({ id, name: 'B' + i, cardIds: [] }));
           d.criteria = __ids.map((id, i) => ({ id, name: 'C' + i, logic: '' }));
           d.categories = __ids.map((id, i) => ({ id, name: 'K' + i }));
           renderSelectView();`);
    const lists = { 'bundle-list': 'toggleBundle', 'criteria-list': 'selectCriteria', 'cat-list': 'toggleCat' };
    for (const [listId, act] of Object.entries(lists)) {
        const html = e.document.getElementById(listId).innerHTML;
        const tags = parseElements(html);
        assert.deepStrictEqual(tags.map(t => t.tag), NASTY_IDS.flatMap(() => listId === 'bundle-list' ? ['div', 'span'] : ['div']));
        for (const id of NASTY_IDS) {
            const el = findElement(html, { 'data-act': act, 'data-id': id });
            assert.ok(el, `${listId} has an item for ${id}`);
            assert.deepStrictEqual(Object.keys(el).sort(), ['class', 'data-act', 'data-id', 'tag']);
            e.dispatch('click', e.target(el));
        }
    }
    assert.deepStrictEqual([...e.run('State.selBundleIds')], NASTY_IDS);
    assert.deepStrictEqual([...e.run('State.selCatIds')], NASTY_IDS);
    assert.strictEqual(e.run('State.selCriteriaId'), NASTY_IDS.at(-1));
    assert.strictEqual(e.run('typeof pwned'), 'undefined');
});

test('table rows and cells with odd ids select and save', () => {
    const e = env();
    e.run(`State.decks = [mkDeck('T')]; State.curDeckId = State.decks[0].id;`);
    e.ctx.__ids = NASTY_IDS;
    e.run(`for (const id of __ids) { const c = mkCard('w', 'g'); c.id = id; State.deck.cards.push(c); }
           renderTable('cards');`);
    const html = e.document.getElementById('table-body').innerHTML;
    const allowed = new Set(['tag', 'data-act', 'data-id', 'value', 'readonly', 'style', 'data-table', 'data-row', 'data-cell']);
    for (const t of parseElements(html)) {
        assert.ok(['tr', 'td', 'input'].includes(t.tag), t.tag);
        for (const k of Object.keys(t)) assert.ok(allowed.has(k), `unexpected attribute ${k}`);
    }
    // Each id reads back intact from the row, its cells and the id cell's text box.
    for (const id of NASTY_IDS) {
        assert.ok(findElement(html, { tag: 'tr', 'data-id': id }), id);
        assert.strictEqual(findElement(html, { 'data-row': id, 'data-cell': 'id' }).value, id);
    }
    const id = NASTY_IDS[0];
    const row = findElement(html, { 'data-act': 'selectTableRow', 'data-id': id });
    e.dispatch('click', e.target(row));
    assert.strictEqual(e.run('State.selectedTableRow'), id);
    const cell = findElement(html, { 'data-row': id, 'data-cell': 'back' });
    assert.strictEqual(cell['data-table'], 'cards');
    e.dispatch('change', e.target(cell, 'new gloss'));
    e.ctx.__id = id;
    assert.strictEqual(e.run('State.deck.cards.find(c => c.id === __id).back'), 'new gloss');
    assert.strictEqual(e.run('typeof pwned'), 'undefined');
});

test('only whitelisted actions run from data-act', () => {
    const e = env();
    e.run('var __called = false; function evil() { __called = true; }');
    for (const act of ['evil', 'constructor', '__proto__', 'toString']) {
        e.dispatch('click', e.target({ 'data-act': act, 'data-id': 'x' }));
    }
    assert.strictEqual(e.run('__called'), false);
});
