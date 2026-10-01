// The Tables view shows category names and readable dates, and saves ids.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv, parseElements, findElement } = require('./env.js');

function setup() {
    const e = createEnv();
    e.run(`State.decks = [mkDeck('T')]; State.curDeckId = State.decks[0].id;
           State.deck.categories = [{ id: 'cat_verbs', name: 'Verbs' }, { id: 'cat_nouns', name: 'Nouns & <b>' }];
           const a = mkCard('λύω', 'loose', 'cat_verbs'); a.id = 'a'; a.editedDate = new Date(2026, 8, 30, 14, 5).getTime();
           const b = mkCard('x', 'y', 'cat_gone'); b.id = 'b'; b.editedDate = 0;
           State.deck.cards = [a, b];
           renderTable('cards');`);
    return e;
}
const body = e => e.document.getElementById('table-body').innerHTML;

test('headers are readable names', () => {
    const e = setup();
    const head = e.document.getElementById('table-head').innerHTML;
    assert.match(head, /<th>Category<\/th>/);
    assert.match(head, /<th>Edited<\/th>/);
});

test('category column is a menu of names that keeps the id as its value', () => {
    const e = setup();
    const html = body(e);
    const tags = parseElements(html);
    const opts = tags.filter(t => t.tag === 'option');
    assert.ok(findElement(html, { tag: 'select', 'data-row': 'a', 'data-cell': 'categoryId' }));
    assert.ok(opts.some(o => o.value === 'cat_verbs' && 'selected' in o));
    assert.match(html, />Verbs</);
    assert.match(html, /Nouns &amp; &lt;b&gt;/, 'names are escaped');
    assert.match(html, /\(missing: cat_gone\)/, 'an unknown id is kept, not silently changed');
    e.run(`updateTableCell('cards', 'a', 'categoryId', 'cat_nouns')`);
    assert.equal(e.run(`State.deck.cards[0].categoryId`), 'cat_nouns');
});

test('edited date shows as a date, is read-only, and updates on edit', () => {
    const e = setup();
    const html = body(e);
    const a = findElement(html, { 'data-row': 'a', 'data-cell': 'editedDate' });
    assert.equal(a.value, '2026-09-30 14:05');
    assert.ok('readonly' in a);
    assert.equal(findElement(html, { 'data-row': 'b', 'data-cell': 'editedDate' }).value, '');
    e.run(`updateTableCell('cards', 'a', 'editedDate', '1999')`);
    assert.equal(e.run(`State.deck.cards[0].editedDate`), new Date(2026, 8, 30, 14, 5).getTime());
    const before = e.run(`State.deck.cards[0].editedDate`);
    e.run(`updateTableCell('cards', 'a', 'front', 'λύεις')`);
    assert.ok(e.run(`State.deck.cards[0].editedDate`) > before);
});

test('search matches category names and shown dates', () => {
    const e = setup();
    e.document.getElementById('table-search').value = 'verbs';
    e.run(`renderTable('cards')`);
    assert.ok(findElement(body(e), { tag: 'tr', 'data-id': 'a' }));
    assert.ok(!findElement(body(e), { tag: 'tr', 'data-id': 'b' }));
    e.document.getElementById('table-search').value = '2026-09-30';
    e.run(`renderTable('cards')`);
    assert.ok(findElement(body(e), { tag: 'tr', 'data-id': 'a' }));
});
