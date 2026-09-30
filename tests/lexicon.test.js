// Reader's Lexicon: verse-grouped output must include every book and list
// verses in canonical order.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnv, readData } = require('./env.js');

function lexicon(cards, refs) {
    const env = createEnv();
    env.ctx.__args = { cards, refs };
    return env.run(`buildVerseLexicon({ name: 'T' }, __args.cards, __args.refs)`);
}
const refOrder = html => [...html.matchAll(/<td class="ref">([^<]+)<\/td>/g)].map(m => m[1]);

test('numbered books (1 Corinthians, 3 John, …) are included', () => {
    const html = lexicon(
        [{ id: 'a', front: 'ἀγάπη' }],
        { a: ['1 Corinthians 13:4', '3 John 1:6', 'John 13:34'] },
    );
    assert.deepEqual(refOrder(html), ['John 13:34', '1 Corinthians 13:4', '3 John 1:6']);
});

test('verses are sorted canonically by book, chapter and verse number', () => {
    const html = lexicon(
        [{ id: 'a', front: 'α' }, { id: 'b', front: 'β' }],
        { a: ['Revelation 1:1', 'John 2:1', 'John 1:10'], b: ['Matthew 1:1', 'John 1:9'] },
    );
    assert.deepEqual(refOrder(html), ['Matthew 1:1', 'John 1:9', 'John 1:10', 'John 2:1', 'Revelation 1:1']);
});

test('verse ranges expand, and words sharing a verse are grouped', () => {
    const html = lexicon(
        [{ id: 'a', front: 'α' }, { id: 'b', front: 'β' }],
        { a: ['Mark 1:2-3'], b: ['Mark 1:3'] },
    );
    assert.deepEqual(refOrder(html), ['Mark 1:2', 'Mark 1:3']);
    assert.match(html, /Mark 1:3<\/td><td class="words">.*α.*β/);
});

test('Qumran-style {l, k} refs sort by key', () => {
    const html = lexicon(
        [{ id: 'a', front: 'א' }],
        { a: [{ l: '4Q17 f2:3', k: 40017002003 }, { l: '1Q16 f14:18', k: 10013018 }] },
    );
    assert.deepEqual(refOrder(html), ['1Q16 f14:18', '4Q17 f2:3']);
});

test('real data: Greek NT lexicon covers all 27 books in canonical order', () => {
    const deck = readData('data/greek_nt.json');
    const refsFile = readData('data/greek_nt.refs.json');
    const refs = refsFile.refs || refsFile;
    const html = lexicon(deck.cards.map(c => ({ id: String(c.id), front: c.front })), refs);
    const order = refOrder(html);
    const books = [];
    for (const r of order) {
        const b = r.replace(/ \d+:\d+$/, '');
        if (books[books.length - 1] !== b) books.push(b);
    }
    const env = createEnv();
    assert.deepEqual(books, [...env.run('LEX_BOOK_NAMES')], 'each book appears once, in canonical order');
    assert.ok(order.includes('1 Corinthians 13:4'));
});
