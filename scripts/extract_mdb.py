import json, re, datetime, shutil
from access_parser import AccessParser

def parse_date(d_str):
    if not d_str or str(d_str).startswith('1999-01-01'):
        return 946684800000  # 2000-01-01T00:00:00Z default
    try:
        dt = datetime.datetime.strptime(str(d_str), '%Y-%m-%d %H:%M:%S')
        return int(dt.replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
    except Exception:
        return 946684800000

# 1. Load MDB
db = AccessParser('/tmp/Athenaze 1-12.mdb')
cards_tbl = db.parse_table('Cards')
bundles_tbl = db.parse_table('Bundles')
criteria_tbl = db.parse_table('Criteria')
settings_tbl = db.parse_table('Settings')

# 2. Load athenaze-data.js for Unicode Greek mapping
with open('athenaze-data.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

m = re.search(r'var ATHENAZE_CHAPTERS\s*=\s*(\[[\s\S]*\]);', js_content)
chapters = json.loads(m.group(1))

js_map = {}
for ch in chapters:
    for c in ch['cards']:
        b = c['back'].strip().lower()
        if b not in js_map:
            js_map[b] = c['front']

# 3. Extract Categories
unique_cats = set()
for c in cards_tbl['Category']:
    if c:
        unique_cats.add(str(c).strip())

cat_list = sorted(list(unique_cats))
cat_defs = []
cat_name_to_id = {}
for name in cat_list:
    cid = 'cat_' + re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')
    cat_defs.append({'id': cid, 'name': name})
    cat_name_to_id[name] = cid

# 4. Extract Cards
cards = []
for i in range(len(cards_tbl['Number'])):
    num = cards_tbl['Number'][i]
    front_raw = cards_tbl['Front'][i]
    back_raw = str(cards_tbl['Back'][i] or '').strip()
    
    # Fix corruptions
    if back_raw.upper() == 'TRUE':
        back = 'true'
    elif back_raw.upper() == 'FALSE':
        back = 'false'
    else:
        back = back_raw
        
    cat_name = str(cards_tbl['Category'][i] or 'Unclassified').strip()
    cat_id = cat_name_to_id.get(cat_name, 'cat_unclassified')
    
    sec = cards_tbl['Section'][i]
    if isinstance(sec, bytes):
        sec = sec.decode('utf-16le', errors='ignore').rstrip('\x00')
    sec = str(sec).strip() if sec else ('1.1' if num == 10 else '')
    
    # Unicode Greek front
    b_lower = back.lower()
    if b_lower in js_map:
        front = js_map[b_lower]
    elif num == 451:
        front = 'ἀληθής, ἀληθές'
    elif num == 454:
        front = 'ψευδής, -ές'
    else:
        front = front_raw

    # Study metrics
    tr = int(cards_tbl['TimesRight'][i] or 0)
    tw = int(cards_tbl['TimesWrong'][i] or 0)
    trsw = int(cards_tbl['TimesRightSinceWrong'][i] or 0)
    last_r = parse_date(cards_tbl['DateLastRight'][i])
    last_w = parse_date(cards_tbl['DateLastWrong'][i])

    btr = int(cards_tbl['BackTimesRight'][i] or 0)
    btw = int(cards_tbl['BackTimesWrong'][i] or 0)
    btrsw = int(cards_tbl['BackTimesRightSinceWrong'][i] or 0)
    blast_r = parse_date(cards_tbl['BackDateLastRight'][i])
    blast_w = parse_date(cards_tbl['BackDateLastWrong'][i])

    freq = int(cards_tbl['Frequency'][i] or 1)
    
    card_obj = {
        'id': f'ath_mdb_{num}',
        'num': num,
        'front': front,
        'back': back,
        'categoryId': cat_id,
        'category': cat_name,
        'section': sec,
        'frequency': freq,
        'spionic': front_raw,
        'fb': {
            'timesRight': tr,
            'timesWrong': tw,
            'timesRightSinceWrong': trsw,
            'dateLastRight': last_r,
            'dateLastWrong': last_w
        },
        'bf': {
            'timesRight': btr,
            'timesWrong': btw,
            'timesRightSinceWrong': btrsw,
            'dateLastRight': blast_r,
            'dateLastWrong': blast_w
        }
    }
    cards.append(card_obj)

# Sort cards by number
cards.sort(key=lambda c: c['num'])

# 5. Extract & Build All 32 Bundles
bnd_map = {}
for i in range(len(bundles_tbl['BundleName'])):
    name = bundles_tbl['BundleName'][i]
    if i == 23 and name == '12a':
        name = '12b'
    # clean bundle name: e.g. 01a -> 1α, 01b -> 1β
    ch_num = int(name[:2])
    sub_letter = 'α' if name[2] == 'a' else 'β'
    blist = [int(x) for x in bundles_tbl['BundleList'][i].split(',') if x.strip()]
    bnd_map[f'{ch_num}{sub_letter}'] = [f'ath_mdb_{n}' for n in blist]

# Cards 4, 5, 7, 8, 10, 11, 13, 14 belong in 1α
for n in [4, 5, 7, 8, 10, 11, 13, 14]:
    cid = f'ath_mdb_{n}'
    if cid not in bnd_map['1α']:
        bnd_map['1α'].append(cid)
bnd_map['1α'].sort(key=lambda cid: int(cid.split('_')[-1]))

# Bundles 13α through 16β from sections
for ch in range(13, 17):
    for sub, code in [('α', '1'), ('β', '2')]:
        b_key = f'{ch}{sub}'
        sec_target = f'{ch}.{code}'
        cids = [c['id'] for c in cards if c['section'] == sec_target]
        bnd_map[b_key] = cids

bundles = []
for ch in range(1, 17):
    ch_all_ids = []
    for sub in ['α', 'β']:
        b_key = f'{ch}{sub}'
        cids = bnd_map.get(b_key, [])
        bundles.append({
            'id': f'bnd_mdb_{ch}_{"a" if sub == "α" else "b"}',
            'name': f'Chapter {ch}{sub}',
            'cardIds': cids
        })
        ch_all_ids.extend(cids)
    # Chapter All bundle
    bundles.append({
        'id': f'bnd_mdb_{ch}_all',
        'name': f'Chapter {ch} (All)',
        'cardIds': sorted(list(set(ch_all_ids)), key=lambda cid: int(cid.split('_')[-1]))
    })

# 6. Build Criteria
criteria = [
    {
        'id': 'crit_mdb_timed',
        'name': 'Timed (MDB Default)',
        'logic': '(NOW - LastRightTime) > (LastRightTime - LastWrongTime)'
    },
    {
        'id': 'crit_mdb_all',
        'name': 'All Cards',
        'logic': ''
    },
    {
        'id': 'crit_mdb_never',
        'name': 'Never Studied',
        'logic': 'TimesRight == 0 AND TimesWrong == 0'
    },
    {
        'id': 'crit_mdb_needs_review',
        'name': 'Needs Review (Streak < 3)',
        'logic': 'TimesRightSinceWrong < 3'
    }
]

# 7. Complete Deck Object
deck = {
    'id': 'deck_athenaze_mdb_canonical',
    'name': 'Athenaze Complete (Authentic MDB — 580 Cards)',
    'createdDate': 1731408000000,
    'src': {'kind': 'athenaze_mdb', 'cardsCount': 580},
    'settings': {
        'fontSize': 28,
        'maximumSelected': 10,
        'frontFont': 'SPIonic',
        'backFont': 'Times New Roman',
        'headTmpl': '',
        'frontTmpl': '',
        'backTmpl': ''
    },
    'categories': cat_defs,
    'bundles': bundles,
    'criteria': criteria,
    'cards': cards
}

# Save data/athenaze-mdb-complete.json
with open('data/athenaze-mdb-complete.json', 'w', encoding='utf-8') as f:
    json.dump(deck, f, ensure_ascii=False, indent=2)

print(f"Saved data/athenaze-mdb-complete.json with {len(cards)} cards, {len(bundles)} bundles, {len(cat_defs)} categories.")

# Copy /tmp/Athenaze.flashpro.json to data/athenaze-extended-1220.json
shutil.copyfile('/tmp/Athenaze.flashpro.json', 'data/athenaze-extended-1220.json')
print("Saved data/athenaze-extended-1220.json (1,220 cards).")
