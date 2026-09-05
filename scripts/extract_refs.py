#!/usr/bin/env python3
"""
Extract the Text table (reference -> card number) from a Flash! Pro MDB corpus database
into data/<deck>.refs.json for the Reader's Lexicon.

Two reference formats:

- NT (GreekNT.mdb): BBCCCVV — BB=book 01-27 (Books table order: Matthew..Revelation),
  CC=chapter, VV=verse. Label: "John 3:16".
- Qumran (Qumran.mdb): BBCCCVV with BB=manuscript index 1-726 (Books table order),
  CC=chapter index (label resolved via the Books.Chapters column — chapters include
  fragment designations like f1, f46ii), VV=verse. Label: "1QHa 5:12".
  Because chapter labels can be non-numeric, each ref is emitted as an object
  {"l": label, "k": sortKey} where sortKey = book*1_000_000 + chapterIndex*1000 + verse,
  so the web app can order verses without knowing the manuscript list.

Usage: python3 extract_refs.py <mdb> <deck.json> <format: nt|qumran>
"""
import json
import sys
from access_parser import AccessParser

NT_BOOKS = [
    'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians',
    '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians',
    '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus',
    'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John',
    '3 John', 'Jude', 'Revelation',
]


def load_text(db):
    t = db.parse_table('Text')
    pairs = []
    for r, n in zip(t['Reference'], t['Number']):
        try:
            pairs.append((int(str(r).strip()), int(str(n).strip())))
        except (ValueError, TypeError):
            continue
    return pairs


def nt_refs(pairs):
    """card num -> set of (book, ch, v, sortKey, label)"""
    out = {}
    for ref, num in pairs:
        book = ref // 10000
        ch = (ref // 100) % 100
        v = ref % 100
        name = NT_BOOKS[book - 1] if 1 <= book <= len(NT_BOOKS) else f'Book{book}'
        out.setdefault(num, set()).add((book, ch, v, book * 1000000 + ch * 1000 + v, name))
    return out


def qumran_refs(db, pairs):
    """Resolve chapter labels via Books.Chapters; label 'NAME chLabel:v'.
    Chapter labels expand range entries (f3_7 -> f3..f7). When a chapter component
    exceeds the label list (fragmentary mss where the Text table uses virtual chapter
    numbers), fall back to f<N>."""
    books = db.parse_table('Books')
    names = [str(x).strip() for x in books['Name']]
    chapter_lists = []
    for raw in books['Chapters']:
        labels = []
        for x in str(raw).split(','):
            x = x.strip()
            if not x:
                continue
            if x.isdigit():
                labels.append(x)
            elif '_' in x[1:]:
                try:
                    a, b = x[1:].split('_')
                    labels.extend(f'f{n}' for n in range(int(a), int(b) + 1))
                except ValueError:
                    labels.append(x)
            else:
                labels.append(x)
        chapter_lists.append(labels)
    out = {}
    for ref, num in pairs:
        book = ref // 10000
        ch = (ref // 100) % 100
        v = ref % 100
        if not (1 <= book <= len(names)):
            continue
        labels = chapter_lists[book - 1] if book - 1 < len(chapter_lists) else []
        if 0 < ch < len(labels):
            ch_label = labels[ch]
        else:
            ch_label = f'f{ch}'
        sort_key = book * 1000000 + ch * 1000 + v
        out.setdefault(num, set()).add((book, ch, v, sort_key,
                                        f'{names[book - 1]} {ch_label}'))
    return out


def collapse(entries):
    """Group contiguous verses within same (book, ch): (book, ch, v1, v2, sortBase, name)."""
    items = sorted(entries)  # by book, ch, v
    groups = []
    for book, ch, v, key, name in items:
        if groups and groups[-1][0] == book and groups[-1][1] == ch and groups[-1][3] == v - 1:
            groups[-1][3] = v
        else:
            groups.append([book, ch, v, v, key - (v - v), name])
    out = []
    for book, ch, v1, v2, key, name in groups:
        base = key - v1  # sortKey of the group start recompute: book/ch part + v1
        if v1 == v2:
            out.append({'l': f'{name}:{v1}', 'k': base + v1})
        else:
            out.append({'l': f'{name}:{v1}-{v2}', 'k': base + v1})
    return out


def main():
    mdb, deck_path, fmt = sys.argv[1], sys.argv[2], sys.argv[3]
    db = AccessParser(mdb)
    pairs = load_text(db)
    print(f'Text rows: {len(pairs)}')

    if fmt == 'nt':
        card_map = nt_refs(pairs)
        make = lambda entries: [
            {'l': f'{name} {ch}:{v1}' if v1 == v2 else f'{name} {ch}:{v1}-{v2}',
             'k': book * 1000000 + ch * 1000 + v1}
            for book, ch, v1, v2, name in collapse_nt(entries)
        ]
    else:
        card_map = qumran_refs(db, pairs)
        make = collapse

    deck = json.load(open(deck_path))
    refs = {}
    for c in deck['cards']:
        num = c.get('num') or int(str(c['id']).rsplit('_', 1)[-1])
        entries = card_map.get(num)
        if entries:
            refs[c['id']] = make(entries)

    # keep refs file lean: emit plain strings when label alone suffices (NT decks use
    # numeric chapters, so the web app can sort by parsing the label)
    plain = {}
    for cid, lst in refs.items():
        plain[cid] = lst

    out_path = deck_path.replace('.json', '.refs.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump({'deckId': deck['id'], 'refs': plain}, f, ensure_ascii=False,
                  separators=(',', ':'))
    print(f'cards with refs: {len(refs)} / {len(deck["cards"])}')
    sample = next(iter(plain))
    print(f'sample {sample}: {plain[sample][:6]}')
    print(f'wrote {out_path}')


def collapse_nt(entries):
    """Collapse contiguous verses for NT format: (book, ch, v1, v2, name)."""
    items = sorted(entries)  # book, ch, v, key, name
    groups = []
    for book, ch, v, key, name in items:
        if groups and groups[-1][0] == book and groups[-1][1] == ch and groups[-1][2] == v - 1:
            groups[-1][2] = v
        else:
            groups.append([book, ch, v, v, name])
    return [(b, c, v1, v2, n) for b, c, v1, v2, n in groups]


if __name__ == '__main__':
    main()
