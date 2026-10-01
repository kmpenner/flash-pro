// The rule language beyond the classic metrics: card fields (with dotted
// paths), text values, LIKE / IN / BETWEEN, and ORDER BY / LIMIT.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv } = require('./env.js');

const NOW = Date.UTC(2026, 9, 1);

function env() {
    const e = createEnv();
    e.run(`Utils.now = () => ${NOW};`);
    return e;
}

// A deck whose cards carry extra structured fields, as an imported deck might.
function deckEnv(cards) {
    const e = env();
    e.ctx.__cards = cards;
    e.run(`State.decks = [mkDeck('T')]; State.curDeckId = State.decks[0].id;
           for (const [i, x] of __cards.entries()) {
               const c = Object.assign(mkCard(x.front, x.back || '', '', x.frequency || 0), x);
               c.id = x.id || 'c' + i;
               State.deck.cards.push(c);
           }`);
    return e;
}

const GREEK = [
    { front: 'λόγος', back: 'word', frequency: 330, lemma: 'λόγος', morph: { pos: 'noun', gender: 'm' } },
    { front: 'λέγω', back: 'I say', frequency: 2354, lemma: 'λέγω', morph: { pos: 'verb', tense: 'pres', voice: 'act' } },
    { front: 'ἐγενόμην', back: 'I became', frequency: 669, lemma: 'γίνομαι', morph: { pos: 'verb', tense: 'aor', voice: 'mid' } },
    { front: 'ἀγαθός', back: 'good', frequency: 102, lemma: 'ἀγαθός', morph: { pos: 'adj' } },
    { front: 'θεός', back: 'God', frequency: 1317, lemma: 'θεός', morph: { pos: 'noun', gender: 'm' } },
];

// Fronts of the cards a rule matches, in deck order.
const matching = (e, rule) => JSON.parse(e.run(
    `JSON.stringify(State.deck.cards.filter(c => evaluateCriteria(${JSON.stringify(rule)}, c, 'fb', true)).map(c => c.front))`));

// Fronts gathered by a rule, in drill order.
function gather(e, rule, sort = '') {
    e.document.getElementById('gather-sort').value = sort;
    e.ctx.__rule = rule;
    e.run(`State.deck.criteria.push({ id: 'r', name: 'R', logic: __rule });
           State.selCriteriaId = 'r'; gatherCards(); State.deck.criteria.pop();`);
    return JSON.parse(e.run('JSON.stringify(State.gatheredCards.map(c => c.front))'));
}

function runTest(e, rule) {
    e.document.getElementById('crit-logic').value = rule;
    e.run('testCriteria()');
    return e.document.getElementById('crit-test-result').textContent;
}

// --- 1. Card fields ---------------------------------------------------------

test('any card field can be queried, including nested ones by dotted path', () => {
    const e = deckEnv(GREEK);
    assert.deepEqual(matching(e, "morph.pos = 'verb'"), ['λέγω', 'ἐγενόμην']);
    assert.deepEqual(matching(e, "morph.tense = 'aor' AND morph.voice = 'mid'"), ['ἐγενόμην']);
    assert.deepEqual(matching(e, "back = 'God'"), ['θεός']);
    assert.deepEqual(matching(e, "lemma = 'γίνομαι' OR Frequency > 2000"), ['λέγω', 'ἐγενόμην']);
});

test('field names are case-insensitive, and metric names keep their meaning', () => {
    const e = deckEnv(GREEK);
    assert.deepEqual(matching(e, "MORPH.Gender = 'm'"), ['λόγος', 'θεός']);
    assert.deepEqual(matching(e, "Back = 'good'"), ['ἀγαθός']);
    // Frequency is still the metric, so a card without the field reads as 0.
    e.run(`State.deck.cards.push(Object.assign(mkCard('x'), { frequency: undefined }));`);
    assert.ok(matching(e, 'Frequency = 0').includes('x'));
});

test('a field a card lacks never matches a comparison', () => {
    const e = deckEnv(GREEK);
    assert.deepEqual(matching(e, "morph.tense = 'pres'"), ['λέγω']);
    assert.deepEqual(matching(e, 'morph.tense > 0'), []);
    assert.deepEqual(matching(e, "morph.case = 'nom'"), []);
});

test('fields with Unicode names work', () => {
    const e = deckEnv([{ front: 'א', λῆμμα: 'אָב' }, { front: 'ב', λῆμμα: 'בַּיִת' }]);
    assert.deepEqual(matching(e, "λῆμμα ~= 'בית'"), ['ב']);
});

// --- 2. Text ------------------------------------------------------------------

test('text in single or double quotes, with doubled quotes inside', () => {
    const e = deckEnv([{ front: "it's" }, { front: 'say "hi"' }]);
    assert.deepEqual(matching(e, "front = 'it''s'"), ["it's"]);
    assert.deepEqual(matching(e, `front = "say ""hi"""`), ['say "hi"']);
});

test('text compares in Unicode NFC form, so decomposed letters match', () => {
    const e = deckEnv([{ front: 'λόγος'.normalize('NFD') }, { front: 'ἀγάπη' }]);
    assert.equal(e.run('State.deck.cards[0].front.length'), 6, 'stored decomposed');
    assert.deepEqual(matching(e, "front = 'λόγος'"), ['λόγος'.normalize('NFD')]);
    assert.deepEqual(matching(e, `front = '${'ἀγάπη'.normalize('NFD')}'`), ['ἀγάπη']);
});

test('~= ignores case, accents, breathings, vowel points and final sigma', () => {
    const e = deckEnv([
        { front: 'Λόγος' }, { front: 'ἀγαθός' }, { front: 'ἁγιος' },
        { front: 'שָׁלוֹם' }, { front: 'דָּבָר' }, { front: 'logos' },
    ]);
    assert.deepEqual(matching(e, "front ~= 'λογοσ'"), ['Λόγος']);
    assert.deepEqual(matching(e, "front ~= 'αγαθος'"), ['ἀγαθός']);
    assert.deepEqual(matching(e, "front ~= 'αγ%'"), ['ἀγαθός', 'ἁγιος'], 'wildcards work too');
    assert.deepEqual(matching(e, "front ~= 'שלום'"), ['שָׁלוֹם']);
    assert.deepEqual(matching(e, "front ~= 'דבר'"), ['דָּבָר']);
    assert.deepEqual(matching(e, "front ~= 'LOGOS'"), ['logos']);
});

test('LIKE uses % and _ wildcards, ignores case, and keeps accents', () => {
    const e = deckEnv([{ front: 'λόγος' }, { front: 'λογος' }, { front: 'Λέγω' }, { front: 'a.c' }, { front: 'abc' }]);
    assert.deepEqual(matching(e, "front LIKE 'λ%'"), ['λόγος', 'λογος', 'Λέγω']);
    assert.deepEqual(matching(e, "front LIKE 'λό%'"), ['λόγος'], 'accent-sensitive');
    assert.deepEqual(matching(e, "front LIKE 'λ_γω'"), ['Λέγω']);
    assert.deepEqual(matching(e, "front LIKE 'a.c'"), ['a.c'], 'other characters are literal');
    assert.deepEqual(matching(e, "front NOT LIKE 'λ%'"), ['a.c', 'abc']);
});

test('IN and BETWEEN, with NOT', () => {
    const e = deckEnv(GREEK);
    assert.deepEqual(matching(e, "morph.pos IN ('adj', 'verb')"), ['λέγω', 'ἐγενόμην', 'ἀγαθός']);
    assert.deepEqual(matching(e, "morph.pos NOT IN ('noun', 'verb')"), ['ἀγαθός']);
    assert.deepEqual(matching(e, 'Frequency BETWEEN 300 AND 1317'), ['λόγος', 'ἐγενόμην', 'θεός']);
    assert.deepEqual(matching(e, 'Frequency NOT BETWEEN 300 AND 1317'), ['λέγω', 'ἀγαθός']);
    // BETWEEN's AND belongs to it; the next AND joins conditions.
    assert.deepEqual(matching(e, "Frequency BETWEEN 300 AND 1317 AND morph.pos = 'noun'"), ['λόγος', 'θεός']);
    assert.deepEqual(matching(e, 'NOT Frequency IN (330, 102)'), ['λέγω', 'ἐγενόμην', 'θεός']);
});

// --- 3. ORDER BY and LIMIT --------------------------------------------------

test('ORDER BY sorts the gathered cards and LIMIT caps them', () => {
    const e = deckEnv(GREEK);
    assert.deepEqual(gather(e, 'ORDER BY Frequency DESC LIMIT 3'), ['λέγω', 'θεός', 'ἐγενόμην']);
    assert.deepEqual(gather(e, "morph.pos = 'noun' ORDER BY Frequency"), ['λόγος', 'θεός']);
    assert.deepEqual(gather(e, 'ORDER BY back'), ['θεός', 'ἀγαθός', 'ἐγενόμην', 'λέγω', 'λόγος'], 'God, good, I became, I say, word');
    assert.equal(e.document.getElementById('gathered-count').textContent, '(5 matched, queueing 5)');
    gather(e, 'LIMIT 2');
    assert.equal(e.document.getElementById('gathered-count').textContent, '(2 matched, queueing 2)');
});

test('ORDER BY takes several keys and expressions', () => {
    const e = deckEnv(GREEK);
    assert.deepEqual(gather(e, 'ORDER BY morph.pos, Frequency DESC'),
        ['ἀγαθός', 'θεός', 'λόγος', 'λέγω', 'ἐγενόμην']);
    // The classic overdue measure as a sort key.
    e.run(`const [a, b] = State.deck.cards;
           a.fb.dateLastRight = ${NOW} - 10 * Utils.dayMs; a.fb.dateLastWrong = ${NOW} - 12 * Utils.dayMs;
           b.fb.dateLastRight = ${NOW} - 3 * Utils.dayMs;  b.fb.dateLastWrong = ${NOW} - 30 * Utils.dayMs;`);
    assert.deepEqual(gather(e, 'DateLastRight > DateLastWrong ORDER BY (Now - DateLastRight) - (DateLastRight - DateLastWrong) DESC'),
        ['λόγος', 'λέγω']);
});

test('cards missing a sort key come last, ascending or descending', () => {
    const e = deckEnv(GREEK);
    assert.deepEqual(gather(e, 'ORDER BY morph.tense').slice(-3).sort(), ['θεός', 'λόγος', 'ἀγαθός'].sort());
    assert.deepEqual(gather(e, 'ORDER BY morph.tense').slice(0, 2), ['ἐγενόμην', 'λέγω']);
    assert.deepEqual(gather(e, 'ORDER BY morph.tense DESC').slice(0, 2), ['λέγω', 'ἐγενόμην']);
});

test('the sort menu breaks ties in the rule order', () => {
    const e = deckEnv(GREEK);
    assert.deepEqual(gather(e, 'ORDER BY morph.pos', 'frequency_desc'), ['ἀγαθός', 'θεός', 'λόγος', 'λέγω', 'ἐγενόμην']);
    assert.deepEqual(gather(e, 'ORDER BY morph.pos', 'frequency_asc'), ['ἀγαθός', 'λόγος', 'θεός', 'ἐγενόμην', 'λέγω']);
});

test('the session limit still applies after LIMIT', () => {
    const e = deckEnv(GREEK);
    e.document.getElementById('max-cards').value = '2';
    assert.deepEqual(gather(e, 'ORDER BY Frequency LIMIT 4'), ['ἀγαθός', 'λόγος']);
    assert.equal(e.document.getElementById('gathered-count').textContent, '(4 matched, queueing 2)');
});

test('ORDER BY and LIMIT work with both directions', () => {
    const e = deckEnv(GREEK);
    e.document.getElementById('drill-direction').value = 'both';
    e.document.getElementById('max-cards').value = '50';
    const got = JSON.parse((gather(e, 'ORDER BY Frequency DESC LIMIT 3'), e.run(
        'JSON.stringify(State.gatheredCards.map(c => c.front + "/" + c._dir))')));
    assert.equal(got.length, 3);
    assert.deepEqual(got.slice(0, 2).map(x => x.split('/')[0]), ['λέγω', 'λέγω']);
});

// --- Run Test ---------------------------------------------------------------

test('Run Test flags names that no card has, and counts within LIMIT', () => {
    const e = deckEnv(GREEK);
    assert.equal(runTest(e, "morph.tense = 'aor'"), '→ 1 card(s) match');
    assert.match(runTest(e, "morph.tens = 'aor'"), /Error: Unknown name "morph.tens"/);
    assert.match(runTest(e, "lema = 'λόγος'"), /Error: Unknown name "lema"/);
    assert.equal(runTest(e, 'Frequency > 100 ORDER BY Frequency LIMIT 3'), '→ 3 card(s) match');
});

test('Run Test explains malformed clauses', () => {
    const e = deckEnv(GREEK);
    const cases = {
        "front = 'λόγος": 'Unclosed text starting at position 9',
        'LIMIT many': 'LIMIT needs a whole number',
        'LIMIT 2.5': 'LIMIT needs a whole number',
        'ORDER Frequency': 'Expected "BY" but found "Frequency"',
        'Frequency IN 1': 'Expected "\\(" but found "1"',
        'Frequency BETWEEN 1 OR 2': 'Expected "&&" but found "\\|\\|"',
        'LIMIT 2 ORDER BY Frequency': 'Unexpected "ORDER"',
        "front = 'a' 'b'": "Unexpected \"'b'\"",
    };
    for (const [rule, msg] of Object.entries(cases)) {
        assert.match(runTest(e, rule), new RegExp('Error: ' + msg), rule);
    }
});

test('a rule naming a field matches nothing in a deck without it', () => {
    const e = deckEnv([{ front: 'a' }, { front: 'b' }]);
    assert.deepEqual(gather(e, "morph.pos = 'verb'"), []);
    assert.deepEqual(gather(e, 'TimesRight = 0 ORDER BY morph.pos'), ['a', 'b'], 'a missing sort key is harmless');
});
