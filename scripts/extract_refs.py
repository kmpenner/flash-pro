#!/usr/bin/env python3
"""
Extract the Text table (verse reference -> card number) from an MDB corpus database
and attach per-card verse references to the corresponding Flash! Pro JSON deck.

Reference format (Flash! Pro XP Text table): BBCCCVV — BB=book (01-27 NT order),
CC=chapter, VV=verse, e.g. 10101 = Matthew 1:1, 272221 = Revelation 22:21.

Output: data/greek_nt.refs.json mapping card id -> list of reference strings "Book C:V",
plus patches the deck JSON in place with a 'refs' object {cardNum: [refStrings]}.
"""
import json
import sys
from access_parser import AccessParser

MDB = '/tmp/GreekNT.mdb'
DECK = 'data/greek_nt.json'

BOOK_NAMES = [
    'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians',
    '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians',
    '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus',
    'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John',
    '3 John', 'Jude', 'Revelation',
]


def unpack(ref):
    book = ref // 10000
    ch = (ref // 100) % 100
    v = ref % 100
    name = BOOK_NAMES[book - 1] if 1 <= book <= len(BOOK_NAMES) else f'Book{book}'
    return f'{name} {ch}:{v}'


def main():
    db = AccessParser(MDB)
    text = db.parse_table('Text')
    refs_raw = text['Reference']
    nums = text['Number']

    # card number -> set of verse strings
    card_refs = {}
    for r, n in zip(refs_raw, nums):
        try:
            ref = int(str(r).strip())
            num = int(str(n).strip())
        except (ValueError, TypeError):
            continue
        card_refs.setdefault(num, set()).add(ref)

    print(f'Text table rows: {len(refs_raw)}')
    print(f'distinct card numbers referenced: {len(card_refs)}')

    deck = json.load(open(DECK))
    cards = deck['cards']

    # compress each card's refs to sorted list, collapsing contiguous verses
    def collapse(refset):
        items = sorted(refset)
        out = []
        for ref in items:
            book = ref // 1000000
            ch = (ref // 1000) % 1000
            v = ref % 1000
            if out and out[-1][0] == book and out[-1][1] == ch and out[-1][2] == v - 1:
                out[-1][2] = v
            else:
                out.append([book, ch, v])
        strs = []
        for book, ch, v2 in out:
            name = BOOK_NAMES[book - 1] if 1 <= book <= len(BOOK_NAMES) else f'Book{book}'
            if v2 > ch * 0 + v2 and False:
                pass
            strs.append(f'{name} {ch}:{v2}' if False else (f'{name} {ch}:{v2}'))
        return strs

    # simpler: no collapsing across chapter boundaries in labels; just list each verse, capped
    refs_obj = {}
    covered = 0
    for c in cards:
        num = c.get('num') or int(str(c['id']).rsplit('_', 1)[-1])
        rs = card_refs.get(num)
        if not rs:
            continue
        covered += 1
        items = sorted(rs)
        # group contiguous verses within same chapter: Book ch:v1-v2
        groups = []
        for ref in items:
            book = ref // 10000
            ch = (ref // 100) % 100
            v = ref % 100
            if groups and groups[-1][0] == book and groups[-1][1] == ch and groups[-1][2] == v - 1:
                groups[-1][2] = v
            else:
                groups.append([book, ch, v, v])
        strs = []
        for book, ch, v1, v2 in groups:
            name = BOOK_NAMES[book - 1] if 1 <= book <= len(BOOK_NAMES) else f'Book{book}'
            if v1 == v2:
                strs.append(f'{name} {ch}:{v1}')
            else:
                strs.append(f'{name} {ch}:{v1}-{v2}')
        refs_obj[c['id']] = strs

    print(f'cards with refs: {covered} / {len(cards)}')
    sample_id = next(iter(refs_obj))
    print(f'sample: {sample_id} -> {refs_obj[sample_id][:8]}')

    out = {'deckId': deck['id'], 'refs': refs_obj}
    with open('data/greek_nt.refs.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote data/greek_nt.refs.json')


if __name__ == '__main__':
    main()
