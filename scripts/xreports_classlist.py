#!/usr/bin/env python3
"""
Build a Flash! Pro deck for learning students' names from their photos, using the
X-Reports (data.stfx.ca SSRS) Faculty Class List with photos.

Needs the CDP Chrome on port 9222 signed in to data.stfx.ca (see the
stfx-registrar-reports skill). Lists your courses for the current academic year,
asks which one, and writes <COURSE>_<term>.flashpro.json — import it in Flash via
Deck > Load deck file.

Each card: frontImg = photo, back = student name. Drill Front -> Back to see the
photo and recall the name.

The output holds student photos and names: keep it out of the repo (default ~/Downloads).

Usage: python3 xreports_classlist.py [--term 202710] [--crn 59352] [--out DIR]
"""
import argparse
import asyncio
import base64
import email
import html
import json
import re
import sys
import time
from io import BytesIO
from pathlib import Path

sys.path.insert(0, '/home/kmpenner/projects/RELS/shared/skills/stfx-registrar-reports/scripts')
from registrar_client import cdp_eval, fetch_report_data, find_target_tab  # noqa: E402
from PIL import Image  # noqa: E402

REPORT = 'FACULTY/Faculty_Class_List_Lookup'
PARAMS_URL = "https://data.stfx.ca/reports/api/v2.0/Reports(Path='/FACULTY/Faculty_Class_List_Lookup')/ParameterDefinitions"
DEFAULT_DATE = 946684800000
PHOTO_PX = 240  # longest side; keeps ~10 KB/photo so a big class fits in the browser's ~5 MB storage


def shrink(raw):
    im = Image.open(BytesIO(raw)).convert('RGB')
    im.thumbnail((PHOTO_PX, PHOTO_PX))
    buf = BytesIO()
    im.save(buf, 'JPEG', quality=80)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


async def param_defs(tab, term=None):
    # P_CRN's valid values depend on P_TERM; the API accepts overrides as a POST body
    if term:
        body = json.dumps([{'Name': 'P_TERM', 'Value': term}])
        js = (f"fetch({json.dumps(PARAMS_URL)},{{method:'POST',credentials:'include',"
              f"headers:{{'Content-Type':'application/json'}},body:{json.dumps(body)}}}).then(r=>r.text())")
    else:
        js = f"fetch({json.dumps(PARAMS_URL)},{{credentials:'include'}}).then(r=>r.text())"
    raw = await cdp_eval(tab, js)
    try:
        return {p['Name']: p for p in json.loads(raw)['value']}
    except Exception:
        sys.exit('Could not read X-Reports parameters — is the data.stfx.ca sign-in still valid?\n' + str(raw)[:300])


def my_courses(defs):
    # Faculty's own sections are listed first, with their name after the dash
    me = (defs['P_USERNAME'].get('DefaultValues') or [''])[0]  # "Ken Penner"
    first, _, last = me.partition(' ')
    tag = f'{last}, {first}'
    vals = defs['P_CRN'].get('ValidValues') or []
    mine = [v for v in vals if v['Label'].endswith(tag)]
    return mine or vals


def parse_mhtml(data):
    msg = email.message_from_bytes(data)
    page, images = '', {}
    for part in msg.walk():
        ct = part.get_content_type()
        if ct == 'text/html':
            page = part.get_payload(decode=True).decode('utf-8', 'replace')
        elif ct.startswith('image/'):
            cid = (part['Content-ID'] or '').strip('<>')
            images[cid] = shrink(part.get_payload(decode=True))
    # Each roster row: <IMG SRC="cid:..."/> then the name cell (Last, First).
    # SSRS wraps long lines inside tags, so "<DIV\n class=..." occurs.
    students = []
    for m in re.finditer(r'SRC="cid:([0-9a-f]+)".*?<DIV\s+class="[^"]*">([^<]+)</DIV>', page, re.S):
        cid, name = m.group(1), html.unescape(m.group(2)).strip()
        if cid in images:
            students.append((name, images[cid]))
    title = re.search(r'Class List:\s*(?:<[^>]+>\s*)*([^<]+)', page)
    return students, html.unescape(title.group(1)).strip() if title else ''


def display_name(last_first):
    last, _, first = last_first.partition(',')
    return f'{first.strip()} {last.strip()}'.strip()


def build_deck(course_label, title, term, students):
    slug = re.sub(r'[^A-Za-z0-9]+', '_', course_label.split(' - ')[0]).strip('_')
    deck_id = f'deck_names_{slug}_{term}'
    cards = []
    for i, (name, img) in enumerate(sorted(students), 1):
        stat = {'timesRight': 0, 'timesWrong': 0, 'timesRightSinceWrong': 0,
                'dateLastRight': DEFAULT_DATE, 'dateLastWrong': DEFAULT_DATE}
        cards.append({'id': f'{deck_id}_{i}', 'num': i, 'front': '', 'back': display_name(name),
                      'frontImg': img, 'categoryId': 'cat_students', 'category': 'Students',
                      'frequency': 1, 'fb': dict(stat), 'bf': dict(stat)})
    return {
        'id': deck_id,
        'name': f'Names: {title or course_label.split(" - ")[0]} ({term})',
        'createdDate': int(time.time() * 1000),
        'src': {'kind': 'xreports_classlist', 'term': term, 'cardsCount': len(cards)},
        'language': 'English',
        'settings': {'fontSize': 26, 'maximumSelected': 10, 'headTmpl': '', 'frontTmpl': '', 'backTmpl': ''},
        'categories': [{'id': 'cat_students', 'name': 'Students'}],
        'bundles': [{'id': f'bnd_{deck_id}', 'name': 'All students', 'cardIds': [c['id'] for c in cards]}],
        'criteria': [],
        'cards': cards,
    }


async def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--term', help='term code (default: current academic year from X-Reports)')
    ap.add_argument('--crn', help='skip the prompt and use this CRN')
    ap.add_argument('--out', default=str(Path.home() / 'Downloads'))
    a = ap.parse_args()

    tab = find_target_tab()['id']
    defs = await param_defs(tab)
    term = a.term or defs['P_TERM']['DefaultValues'][0]
    if a.term:
        defs = await param_defs(tab, term)
    courses = my_courses(defs)
    if a.crn:
        pick = next((c for c in courses if c['Value'] == a.crn), {'Label': a.crn, 'Value': a.crn})
    else:
        print(f'Courses for term {term}:')
        for i, c in enumerate(courses, 1):
            print(f'  {i:2}. {c["Label"]}  (CRN {c["Value"]})')
        n = input('Which course? ').strip()
        pick = courses[int(n) - 1]

    subj = defs['P_SUBJ']['DefaultValues'][0]  # cross-listed CLAS/ENGL sections still render under RELS
    res = await fetch_report_data(tab, REPORT, {
        'P_TERM': term, 'P_SUBJ': subj, 'P_CRN': pick['Value'], 'P_DROP': 'NO',
        'P_Photos': 'Y', 'P_Grades': 'N'}, 'MHTML')
    if not res or not res.get('success'):
        sys.exit(f'Report failed: {res}')
    data = base64.b64decode(res['data']) if res.get('isBinary') else res['data'].encode('latin-1')
    students, title = parse_mhtml(data)
    if not students:
        sys.exit('No students with photos found in the class list.')

    deck = build_deck(pick['Label'], title, term, students)
    out = Path(a.out).expanduser() / f'{deck["id"].removeprefix("deck_")}.flashpro.json'
    out.write_text(json.dumps(deck, ensure_ascii=False))
    print(f'{len(students)} students -> {out}')


if __name__ == '__main__':
    asyncio.run(main())
