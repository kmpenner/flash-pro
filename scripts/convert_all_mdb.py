#!/usr/bin/env python3
"""
Convert all MDB flashcard databases into Flash! Pro canonical JSON deck format and JS bundles.
Decodes:
- Greek Beta Code / SPIonic / BWGrkL into polytonic Unicode Greek
- Latin SPAtlantis and HTML entities into macron-bearing Latin
- Hebrew & Aramaic Windows-1255 and SPTiberian into pointed Unicode Hebrew
- Ge'ez Ethiopic HTML entities into Ge'ez syllabary
- French, German, Chronology into clean UTF-8
"""

import os
import sys
import json
import csv
import io
import html
import subprocess
import unicodedata
import betacode.conv

MDB_EXPORT = "/tmp/local/usr/bin/mdb-export"
MDB_TABLES = "/tmp/local/usr/bin/mdb-tables"
ENV = dict(os.environ, LD_LIBRARY_PATH="/tmp/local/usr/lib/x86_64-linux-gnu")

# SPIonic map
SPIONIC_MAP = {
    'a': 'a', 'b': 'b', 'c': 'c', 'd': 'd', 'e': 'e', 'f': 'f', 'g': 'g',
    'h': 'q', 'i': 'i', 'k': 'k', 'l': 'l', 'm': 'm', 'n': 'n', 'o': 'o',
    'p': 'p', 'q': 'y', 'r': 'r', 's': 's', 't': 't', 'u': 'u', 'v': 'w',
    'w': 'w', 'x': 'x', 'y': 'u', 'z': 'z',
    'A': '*a', 'B': '*b', 'C': '*x', 'D': '*d', 'E': '*e', 'F': '*f', 'G': '*g',
    'H': '*q', 'I': '*i', 'K': '*k', 'L': '*l', 'M': '*m', 'N': '*n', 'O': '*o',
    'P': '*p', 'Q': '*y', 'R': '*r', 'S': '*s', 'T': '*t', 'U': '*u', 'V': '*w',
    'W': '*w', 'X': '*c', 'Y': '*u', 'Z': '*z',
    ')': ')', '(': '(', '/': '/', '=': '=', '\\': '\\', '+': '+', '|': '|',
    'j': 's1', 'J': 's1'
}

# BWGrkL map (John Dobson)
BWGRKL_MAP = {
    'a': 'a', 'b': 'b', 'g': 'g', 'd': 'd', 'e': 'e', 'z': 'z', 'h': 'h',
    'q': 'q', 'i': 'i', 'k': 'k', 'l': 'l', 'm': 'm', 'n': 'n', 'c': 'x',
    'o': 'o', 'p': 'p', 'r': 'r', 's': 's', 't': 't', 'u': 'u', 'f': 'f',
    'x': 'c', 'y': 'y', 'w': 'w', 'j': 's',
    'A': '*a', 'B': '*b', 'G': '*g', 'D': '*d', 'E': '*e', 'Z': '*z', 'H': '*h',
    'Q': '*q', 'I': '*i', 'K': '*k', 'L': '*l', 'M': '*m', 'N': '*n', 'C': '*x',
    'O': '*o', 'P': '*p', 'R': '*r', 'S': '*s', 'T': '*t', 'U': '*u', 'F': '*f',
    'X': '*c', 'Y': '*y', 'W': '*w',
    'v': ')', '`': '(', '/': '/', '=': '=', '\\': '\\', '|': '|'
}

# SPTiberian mapping
SPTIB_CONSONANTS = {
    ')': '\u05D0', # alef
    'b': '\u05D1', # bet
    'g': '\u05D2', # gimel
    'd': '\u05D3', # dalet
    'h': '\u05D4', # he
    'w': '\u05D5', # vav
    'z': '\u05D6', # zayin
    'x': '\u05D7', # het
    'j': '\u05D8', # tet
    'y': '\u05D9', # yod
    'k': '\u05DB', # kaf
    'K': '\u05DA', # final kaf
    'l': '\u05DC', # lamed
    'm': '\u05DE', # mem
    'M': '\u05DD', # final mem
    'n': '\u05E0', # nun
    'N': '\u05DF', # final nun
    's': '\u05E1', # samekh
    '[': '\u05E2', # ayin
    'p': '\u05E4', # pe
    'P': '\u05E3', # final pe
    'c': '\u05E6', # tsadi
    'C': '\u05E5', # final tsadi
    'q': '\u05E7', # qof
    'r': '\u05E8', # resh
    '#': '\u05E9', # shin
    '$': '\u05E9\u05C1', # shin dot
    '&': '\u05E9\u05C2', # sin dot
    't': '\u05EA', # tav
}

SPTIB_POINTS = {
    'a': '\u05B7', # patah
    'f': '\u05B8', # qamats
    'e': '\u05B6', # segol
    '"': '\u05B5', # tsere
    'i': '\u05B4', # hiriq
    'o': '\u05B9', # holam
    'u': '\u05BB', # qubuts
    ':': '\u05B0', # sheva
    '@': '\u05BC', # dagesh
    'j': '\u05B2', # hatef patah
    'h': '\u05B3', # hatef qamats
    'v': '\u05B1', # hatef segol
    'O': '\u05BA', # holam haser
    'w%': '\u05D5\u05BC', # shureq
    'wO': '\u05D5\u05B9', # holem vav
}

def decode_spionic(text):
    if not text: return ""
    beta = []
    for ch in text:
        beta.append(SPIONIC_MAP.get(ch, ch))
    beta_str = "".join(beta)
    try:
        uni = betacode.conv.beta_to_uni(beta_str)
        return uni
    except Exception:
        return text

def decode_bwgrkl(text):
    if not text: return ""
    beta = []
    for ch in text:
        beta.append(BWGRKL_MAP.get(ch, ch))
    beta_str = "".join(beta)
    try:
        uni = betacode.conv.beta_to_uni(beta_str)
        return uni
    except Exception:
        return text

def decode_spatlantis(text):
    if not text: return ""
    macrons = {
        'a': 'ā', 'e': 'ē', 'i': 'ī', 'o': 'ō', 'u': 'ū',
        'A': 'Ā', 'E': 'Ē', 'I': 'Ī', 'O': 'Ō', 'U': 'Ū'
    }
    acutes = {
        'a': 'á', 'e': 'é', 'i': 'í', 'o': 'ó', 'u': 'ú',
        'A': 'Á', 'E': 'É', 'I': 'Í', 'O': 'Ó', 'U': 'Ú'
    }
    out = []
    for ch in text:
        if ch == '4' and out and out[-1] in macrons:
            out[-1] = macrons[out[-1]]
        elif ch == '8' and out and out[-1] in acutes:
            out[-1] = acutes[out[-1]]
        elif ch == '7':
            out.append(',')
        else:
            out.append(ch)
    return "".join(out)

def decode_win1255(text):
    if not text: return ""
    try:
        raw = text.encode('latin1')
        decoded = raw.decode('windows-1255')
        return decoded
    except Exception:
        return text

def decode_sptiberian(text):
    if not text: return ""
    try:
        raw = text.encode('latin1')
        decoded = raw.decode('windows-1255')
        if any('\u0590' <= c <= '\u05FF' for c in decoded):
            return decoded
    except Exception:
        pass

    rev = text[::-1]
    res = []
    i = 0
    while i < len(rev):
        if i + 1 < len(rev) and rev[i:i+2] in SPTIB_POINTS:
            res.append(SPTIB_POINTS[rev[i:i+2]])
            i += 2
        elif rev[i] in SPTIB_CONSONANTS:
            res.append(SPTIB_CONSONANTS[rev[i]])
            i += 1
        elif rev[i] in SPTIB_POINTS:
            res.append(SPTIB_POINTS[rev[i]])
            i += 1
        else:
            res.append(rev[i])
            i += 1
    return "".join(res)

def decode_html_and_unicode(text):
    if not text: return ""
    t = html.unescape(text)
    t = unicodedata.normalize('NFC', t)
    return t

def export_table(mdb_path, table_name):
    res = subprocess.run([MDB_EXPORT, mdb_path, table_name], capture_output=True, text=True, env=ENV)
    if res.returncode != 0:
        return []
    reader = csv.DictReader(io.StringIO(res.stdout))
    return list(reader)

def get_tables(mdb_path):
    res = subprocess.run([MDB_TABLES, "-1", mdb_path], capture_output=True, text=True, env=ENV)
    return [t.strip() for t in res.stdout.splitlines() if t.strip()]

def slugify(text):
    return "".join(c if c.isalnum() else "_" for c in text.lower()).strip("_")

DEFAULT_DATE = 946684800000

def process_database(mdb_path, deck_id, deck_name, language, decoder_type, category_name="General"):
    tables = get_tables(mdb_path)
    cards_table = 'Cards' if 'Cards' in tables else None
    bundles_table = 'Bundles' if 'Bundles' in tables else None
    cat_table = 'Categories' if 'Categories' in tables else None
    
    if not cards_table:
        return None

    raw_cards = export_table(mdb_path, cards_table)
    raw_bundles = export_table(mdb_path, bundles_table) if bundles_table else []
    raw_categories = export_table(mdb_path, cat_table) if cat_table else []

    categories_list = []
    cat_id_by_name = {}
    for c in raw_categories:
        c_name = (c.get('CategoryName') or c.get('Name') or c.get('Category') or '').strip()
        if c_name and c_name not in cat_id_by_name:
            c_id = f"cat_{slugify(c_name)}"
            cat_id_by_name[c_name] = c_id
            categories_list.append({"id": c_id, "name": c_name})

    cards = []
    card_id_map = {}
    card_counter = 1

    for row in raw_cards:
        front = row.get('Front', '')
        back = row.get('Back', '')
        if front == 'Front' and back == 'Back':
            continue
        
        if '<bgsound' in back.lower():
            back = back[:back.lower().find('<bgsound')].strip()

        card_name = row.get('CardName', '')
        if card_name == '=Abraavm, oJ':
            front = 'Ἀβραάμ, ὁ'
        elif 'intrans: I rise' in front or card_name == 'ajniVsthmi':
            front = 'ἀνίστημι'
            back = 'intrans: I rise, get up; trans: I raise'

        if decoder_type == 'spionic':
            front = decode_spionic(front)
            back = decode_html_and_unicode(back)
        elif decoder_type == 'bwgrkl':
            front = decode_bwgrkl(front)
            back = decode_html_and_unicode(back)
        elif decoder_type == 'spatlantis':
            front = decode_spatlantis(front)
            back = decode_html_and_unicode(back)
        elif decoder_type == 'win1255':
            front = decode_win1255(front)
            back = decode_html_and_unicode(back)
        elif decoder_type == 'sptiberian':
            front = decode_sptiberian(front)
            back = decode_html_and_unicode(back)
        elif decoder_type in ('html', 'standard'):
            front = decode_html_and_unicode(front)
            back = decode_html_and_unicode(back)

        cat = (row.get('Category') or '').strip() or 'General'
        if cat not in cat_id_by_name:
            c_id = f"cat_{slugify(cat)}"
            cat_id_by_name[cat] = c_id
            categories_list.append({"id": c_id, "name": cat})

        cat_id = cat_id_by_name[cat]
        raw_num = row.get('Number', str(card_counter)).strip()
        cid = f"{deck_id}_{raw_num}" if raw_num else f"{deck_id}_{card_counter}"
        card_id_map[raw_num] = cid

        freq = int(row.get('Frequency')) if row.get('Frequency', '').isdigit() else 1
        tr = int(row.get('TimesRight')) if row.get('TimesRight', '').isdigit() else 0
        tw = int(row.get('TimesWrong')) if row.get('TimesWrong', '').isdigit() else 0
        trsw = int(row.get('TimesRightSinceWrong')) if row.get('TimesRightSinceWrong', '').isdigit() else 0
        b_tr = int(row.get('BackTimesRight')) if row.get('BackTimesRight', '').isdigit() else 0
        b_tw = int(row.get('BackTimesWrong')) if row.get('BackTimesWrong', '').isdigit() else 0
        b_trsw = int(row.get('BackTimesRightSinceWrong')) if row.get('BackTimesRightSinceWrong', '').isdigit() else 0

        card_obj = {
            "id": cid,
            "num": int(raw_num) if raw_num.isdigit() else card_counter,
            "front": front.strip(),
            "back": back.strip(),
            "categoryId": cat_id,
            "category": cat,
            "frequency": freq,
            "fb": {
                "timesRight": tr,
                "timesWrong": tw,
                "timesRightSinceWrong": trsw,
                "dateLastRight": DEFAULT_DATE,
                "dateLastWrong": DEFAULT_DATE
            },
            "bf": {
                "timesRight": b_tr,
                "timesWrong": b_tw,
                "timesRightSinceWrong": b_trsw,
                "dateLastRight": DEFAULT_DATE,
                "dateLastWrong": DEFAULT_DATE
            }
        }
        cards.append(card_obj)
        card_counter += 1

    bundles = []
    if raw_bundles:
        for b in raw_bundles:
            b_name = (b.get('BundleName') or b.get('Name') or '').strip()
            if not b_name or b_name.lower() == 'blank bundle':
                continue
            raw_list = b.get('BundleList') or b.get('Items') or b.get('CardNumbers') or ""
            items = [x.strip() for x in raw_list.replace(',', ' ').split() if x.strip() and x.strip() != '0']
            if not items:
                continue
            mapped_ids = [card_id_map[x] for x in items if x in card_id_map]
            if mapped_ids:
                b_slug = slugify(b_name)
                bundles.append({
                    "id": f"bnd_{deck_id}_{b_slug}",
                    "name": b_name,
                    "cardIds": mapped_ids
                })

    # If no valid bundles were defined in database, chunk into 25-card parts
    if not bundles:
        for i in range(0, len(cards), 25):
            chunk = cards[i:i+25]
            part_num = (i // 25) + 1
            bundles.append({
                "id": f"bnd_{deck_id}_{part_num}",
                "name": f"Part {part_num} (Cards {i+1}–{min(i+25, len(cards))})",
                "cardIds": [c['id'] for c in chunk]
            })

    criteria = [
        {"id": f"crit_{deck_id}_timed", "name": "Timed (Spaced Repetition)", "logic": "(NOW - LastRightTime) > (LastRightTime - LastWrongTime)"},
        {"id": f"crit_{deck_id}_all", "name": "All Cards", "logic": ""},
        {"id": f"crit_{deck_id}_never", "name": "Never Studied", "logic": "TimesRight == 0 AND TimesWrong == 0"},
        {"id": f"crit_{deck_id}_review", "name": "Needs Review (Streak < 3)", "logic": "TimesRightSinceWrong < 3"}
    ]

    deck_dict = {
        "id": f"deck_{deck_id}",
        "name": deck_name,
        "createdDate": 1731408000000,
        "src": {"kind": f"mdb_{deck_id}", "cardsCount": len(cards)},
        "language": language,
        "categoryGroup": category_name,
        "settings": {
            "fontSize": 26,
            "maximumSelected": 10,
            "headTmpl": "",
            "frontTmpl": "",
            "backTmpl": ""
        },
        "categories": categories_list,
        "bundles": bundles,
        "criteria": criteria,
        "cards": cards
    }
    return deck_dict

def main():
    data_dir = "/home/kmpenner/projects/Service/Flash/data"
    os.makedirs(data_dir, exist_ok=True)
    
    db_configs = [
        # Greek
        ("/tmp/onedrive_mdb/GreekNT.mdb", "greek_nt", "Greek New Testament Vocabulary", "Greek", "spionic", "Biblical Greek"),
        ("/tmp/onedrive_mdb/mounce-u.mdb", "mounce_greek", "Basics of Biblical Greek (William Mounce)", "Greek", "html", "Biblical Greek"),
        ("/tmp/onedrive_mdb/JACTGreek.mdb", "jact_greek", "Reading Greek (JACT)", "Greek", "spionic", "Classical Greek"),
        ("/tmp/onedrive_mdb/Summers.mdb", "summers_greek", "Essentials of New Testament Greek (Ray Summers)", "Greek", "spionic", "Biblical Greek"),
        ("/tmp/onedrive_mdb/grkvocab.mdb", "grkvocab", "Greek Vocabulary by Frequency", "Greek", "spionic", "Biblical Greek"),
        ("/tmp/onedrive_mdb/Stevens.mdb", "stevens_greek", "New Testament Greek (David Alan Black / Stevens)", "Greek", "spionic", "Biblical Greek"),
        ("/tmp/onedrive_mdb/Dobson.mdb", "dobson_greek", "Learn New Testament Greek (John Dobson)", "Greek", "bwgrkl", "Biblical Greek"),
        # Latin
        ("/tmp/onedrive_mdb/Collins.mdb", "collins_latin", "Primer of Ecclesiastical Latin (John F. Collins)", "Latin", "spatlantis", "Latin"),
        ("/tmp/onedrive_mdb/Wheelock.mdb", "wheelock_latin", "Wheelock's Latin Grammar", "Latin", "html", "Latin"),
        # Hebrew & Aramaic
        ("/tmp/onedrive_mdb/Kelley.mdb", "kelley_hebrew", "Biblical Hebrew: An Introductory Grammar (Page H. Kelley)", "Hebrew", "sptiberian", "Biblical Hebrew"),
        ("/tmp/onedrive_mdb/Hebrew Words.mdb", "hebrew_words", "Hebrew Words Complete Lexicon", "Hebrew", "win1255", "Biblical Hebrew"),
        ("/tmp/onedrive_mdb/Targum.mdb", "targum_aramaic", "Targum Aramaic Vocabulary", "Aramaic", "win1255", "Biblical Aramaic"),
        ("/tmp/onedrive_mdb/Greenspahn.mdb", "greenspahn_aramaic", "An Introduction to Aramaic (Frederick Greenspahn)", "Aramaic", "sptiberian", "Biblical Aramaic"),
        ("/tmp/onedrive_mdb/Johns.mdb", "johns_aramaic", "A Short Grammar of Biblical Aramaic (Alger F. Johns)", "Aramaic", "sptiberian", "Biblical Aramaic"),
        ("/tmp/onedrive_mdb/Modheb.mdb", "modern_hebrew", "Modern Hebrew Vocabulary", "Hebrew", "sptiberian", "Modern Hebrew"),
        ("/tmp/onedrive_mdb/Qumran.mdb", "qumran_hebrew", "Dead Sea Scrolls / Qumran Hebrew Vocabulary", "Hebrew", "sptiberian", "Biblical Hebrew"),
        ("/tmp/onedrive_mdb/Hebrew Alphabet Order.mdb", "hebrew_alphabet", "Hebrew Alphabet Practice", "Hebrew", "sptiberian", "Biblical Hebrew"),
        # Semitic & Ancient
        ("/tmp/onedrive_mdb/Akkad.mdb", "akkadian", "Akkadian Cuneiform Vocabulary & Logograms", "Akkadian", "html", "Ancient Near East"),
        ("/tmp/Ethiopic.mdb", "ethiopic_geez", "Classical Ethiopic (Ge'ez) Vocabulary", "Ethiopic", "html", "Semitic Languages"),
        # Modern Languages & Humanities
        ("/tmp/onedrive_mdb/French.mdb", "french_vocab", "Comprehensive French Vocabulary", "French", "standard", "Modern Languages"),
        ("/tmp/onedrive_mdb/German.mdb", "german_vocab", "Comprehensive German Vocabulary", "German", "standard", "Modern Languages"),
        ("/tmp/onedrive_mdb/Chronology.mdb", "ancient_chronology", "Ancient History & Biblical Chronology", "English", "standard", "History & Chronology"),
    ]

    catalog = [
        {
            "id": "deck_athenaze_mdb_canonical",
            "title": "Athenaze: An Introduction to Ancient Greek (Ch. 1–16)",
            "language": "Greek",
            "category": "Classical Greek",
            "totalCards": 580,
            "totalBundles": 48,
            "file": "data/athenaze-mdb-complete.json",
            "sampleFront": "ὁ ἄνθρωπος",
            "sampleBack": "the man, human being"
        },
        {
            "id": "deck_athenaze_extended_lexicon",
            "title": "Athenaze Extended Lexicon (Ch. 1–30)",
            "language": "Greek",
            "category": "Classical Greek",
            "totalCards": 1220,
            "totalBundles": 30,
            "file": "data/athenaze-extended-1220.json",
            "sampleFront": "ἀγαθός",
            "sampleBack": "good, noble"
        }
    ]

    for path, deck_id, title, lang, decoder, cat_group in db_configs:
        if not os.path.exists(path):
            continue
        deck = process_database(path, deck_id, title, lang, decoder, cat_group)
        if deck:
            out_file = os.path.join(data_dir, f"{deck_id}.json")
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(deck, f, ensure_ascii=False, indent=2)
            catalog.append({
                "id": deck["id"],
                "title": title,
                "language": lang,
                "category": cat_group,
                "totalCards": len(deck['cards']),
                "totalBundles": len(deck['bundles']),
                "file": f"data/{deck_id}.json",
                "sampleFront": deck['cards'][0]['front'] if deck['cards'] else "",
                "sampleBack": deck['cards'][0]['back'] if deck['cards'] else ""
            })

    catalog_path = os.path.join(data_dir, "catalog.json")
    with open(catalog_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    
    catalog_js = os.path.join(data_dir, "catalog-data.js")
    with open(catalog_js, "w", encoding="utf-8") as f:
        f.write("window.FLASH_PRO_CATALOG = " + json.dumps(catalog, ensure_ascii=False, indent=2) + ";\n")

    print(f"Generated {len(catalog)} decks. Catalog written to {catalog_path} and {catalog_js}.")

if __name__ == "__main__":
    main()
