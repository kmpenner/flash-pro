// =====================================================================
// IMPORT / EXPORT & QUIZ GENERATION
// =====================================================================

const ALL_FIELDS = ['front', 'back', 'categoryId', 'frequency', 'fb.timesRight', 'fb.timesWrong', 'fb.timesRightSinceWrong', 'fb.dateLastRight', 'fb.dateLastWrong', 'bf.timesRight', 'bf.timesWrong', 'bf.timesRightSinceWrong', 'bf.dateLastRight', 'bf.dateLastWrong'];

function renderExportFields() {
    const el = document.getElementById('export-fields');
    if (el) {
        el.innerHTML = ALL_FIELDS.map(f => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" value="${f}"${['front', 'back', 'categoryId', 'frequency'].includes(f) ? ' checked' : ''}> ${f}</label>`).join('');
    }
}

function getExportFields() {
    return [...document.querySelectorAll('#export-fields input:checked')].map(i => i.value);
}

function getField(card_obj, f) {
    const parts = f.split('.');
    let v = card_obj;
    for (const p of parts) v = v?.[p];
    return v ?? '';
}

function doExport() {
    const d = State.deck; if (!d) return;
    const scope = document.getElementById('export-scope')?.value;
    const cards = scope === 'gathered' && State.gatheredCards.length ? State.gatheredCards : d.cards;
    const fields = getExportFields();
    const fmt = document.getElementById('export-format')?.value;
    let content = '', ext = '', mime = '';
    if (fmt === 'json') {
        content = JSON.stringify(cards.map(c => Object.fromEntries(fields.map(f => [f, getField(c, f)]))), null, 2);
        ext = 'json'; mime = 'application/json';
    } else {
        const sep = fmt === 'csv' ? ',' : '\t';
        const rows = [fields, ...cards.map(c => fields.map(f => String(getField(c, f)).replace(/[\t\n]/g, ' ')))];
        content = rows.map(r => r.join(sep)).join('\n');
        ext = fmt || 'txt'; mime = 'text/plain';
    }
    Utils.dlBlob(new Blob([content], { type: mime }), d.name + '_export.' + ext);
}

let importParsed = null;

function parseImportData() {
    const raw = (document.getElementById('import-data')?.value || '').trim();
    if (!raw) return;
    const lines = raw.split('\n');
    const sep = raw.includes('\t') ? '\t' : ',';
    const headers = lines[0].split(sep).map(h => h.trim());
    const rows = lines.slice(1).map(l => l.split(sep));
    importParsed = { headers, rows };
    const mappingEl = document.getElementById('import-mapping');
    if (mappingEl) {
        mappingEl.innerHTML = `<div class="flab">Map columns to card fields</div>` + headers.map((h, i) => `<div class="row"><span style="min-width:100px;font-size:.82em;color:#5a6890">${h}</span><select id="imap-${i}" style="flex:1"><option value="">-- skip --</option>${['front', 'back', 'categoryId', 'frequency'].map(f => `<option value="${f}"${h.toLowerCase() === f.toLowerCase() ? ` selected` : ''}>${f}</option>`).join('')}</select></div>`).join('');
    }
    const importBtn = document.getElementById('import-btn');
    if (importBtn) importBtn.style.display = 'block';
}

function doImport() {
    const d = State.deck; if (!d || !importParsed) return;
    const { headers, rows } = importParsed;
    const mapping = headers.map((_, i) => document.getElementById('imap-' + i)?.value || '');
    let added = 0;
    for (const row of rows) {
        if (!row.length || (row.length === 1 && !row[0])) continue;
        const c = mkCard();
        mapping.forEach((field, i) => { if (field) c[field] = row[i]?.trim() || c[field]; });
        if (!c.front && !c.back) continue;
        if (!c.categoryId) c.categoryId = d.categories[0]?.id || '';
        d.cards.push(c); added++;
    }
    save();
    if (typeof updateDeckStats === 'function') updateDeckStats();
    alert(`Imported ${added} cards.`);
    const importBtn = document.getElementById('import-btn');
    if (importBtn) importBtn.style.display = 'none';
    const importData = document.getElementById('import-data');
    if (importData) importData.value = '';
    const importMapping = document.getElementById('import-mapping');
    if (importMapping) importMapping.innerHTML = '';
    importParsed = null;
}

function doBatchReplace() {
    const d = State.deck; if (!d) return;
    const find = document.getElementById('br-find')?.value;
    const repl = document.getElementById('br-replace')?.value;
    const field = document.getElementById('br-field')?.value;
    if (!find) { alert('Enter a find term.'); return; }
    let count = 0;
    d.cards.forEach(c => {
        if ((field === 'front' || field === 'both') && c.front.includes(find)) { c.front = c.front.replaceAll(find, repl); count++; }
        if ((field === 'back' || field === 'both') && c.back.includes(find)) { c.back = c.back.replaceAll(find, repl); count++; }
    });
    save();
    const resEl = document.getElementById('br-result');
    if (resEl) resEl.textContent = `Replaced in ${count} card(s).`;
}

function createQuiz() {
    const d = State.deck; if (!d) return;
    const cards = State.gatheredCards.length ? State.gatheredCards : d.cards;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${Utils.escH(d.name)} Quiz</title>
<style>body{font-family:system-ui;background:#12151e;color:#dde1ec;padding:20px;max-width:700px;margin:auto}
h1{color:#6366f1;margin-bottom:20px}.card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:24px;margin:16px 0;backdrop-filter:blur(10px)}
.front{font-size:1.4em;font-weight:700;color:#fff}.back{color:#94a3b8;margin-top:12px;display:none;font-size:1.1em;border-top:1px solid rgba(255,255,255,0.05);padding-top:12px;}
.toggle{margin-top:16px;background:#6366f1;color:#fff;border:none;padding:8px 20px;border-radius:8px;cursor:pointer;font-weight:600;transition:opacity 0.2s}
.toggle:hover{opacity:0.9}
</style></head><body>
<h1>${Utils.escH(d.name)} — Quiz (${cards.length} cards)</h1>
${cards.map((c, i) => `<div class="card"><div class="front">${i + 1}. ${Utils.escH(c.front)}</div><div class="back" id="b${i}">${Utils.escH(c.back)}</div><button class="toggle" onclick="t(${i})">Reveal Answer</button></div>`).join('')}
<script>function t(i){const el=document.getElementById('b'+i);el.style.display=el.style.display==='block'?'none':'block';}<\/script>
</body></html>`;
    Utils.dlBlob(new Blob([html], { type: 'text/html' }), d.name + '_quiz.html');
}

// Reader's Lexicon (Kubo / A-B-C style): a printable reader's aid keyed to a passage.
// For corpus decks with verse data (extracted from the original MDB "Text" table), the
// lexicon is grouped by verse: each row shows its reference and the vocabulary words
// occurring there. Verse refs live in data/<deckFile>.refs.json (NOT in localStorage —
// a 5k-entry ref map would blow the ~5MB storage quota) and are fetched lazily.
// For decks without verse data, falls back to an alphabetical word & gloss list.
const _verseRefsCache = {}; // deckId -> refs object

async function getVerseRefs(deck) {
    if (deck.verseRefs) return deck.verseRefs;              // embedded (small decks)
    if (_verseRefsCache[deck.id]) return _verseRefsCache[deck.id];
    const cat = (window.FLASH_PRO_CATALOG || []).find(c => c.id === deck.id);
    const url = cat ? cat.file.replace(/\.json$/, '.refs.json') : `data/${deck.id}.refs.json`;
    try {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const data = await resp.json();
        const refs = data.refs || data;
        _verseRefsCache[deck.id] = refs;
        return refs;
    } catch (_) {
        return null;
    }
}

async function createReadersLexicon() {
    const d = State.deck; if (!d) return;
    const cards = State.gatheredCards.length ? State.gatheredCards : d.cards;
    const refs = await getVerseRefs(d);
    const html = refs ? buildVerseLexicon(d, cards, refs) : buildPlainLexicon(d, cards);
    Utils.dlBlob(new Blob([html], { type: 'text/html' }), d.name.replace(/[\\/:*?"<>|]+/g, '_') + '_lexicon.html');
}

function buildPlainLexicon(d, cards) {
    const sorted = [...cards].sort((a, b) => String(a.front).localeCompare(String(b.front), 'el'));
    const rows = sorted.map(c =>
        `<tr><td class="w">${Utils.escH(c.front)}</td><td class="g">${Utils.escH(c.back)}</td></tr>`
    ).join('');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${Utils.escH(d.name)} — Reader's Lexicon</title>
<style>
body{font-family:'Times New Roman',serif;margin:2em;color:#000;background:#fff}
h1{font-size:1.3em;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:4px}
.meta{color:#444;font-size:0.85em;margin-bottom:1.5em}
table{border-collapse:collapse;width:100%}
td{padding:4px 12px 4px 0;vertical-align:top;border-bottom:1px dotted #bbb}
td.w{font-weight:700;width:32%}
td.g{width:68%}
@media print{td{border-bottom:1px dotted #999}}
</style></head><body>
<h1>${Utils.escH(d.name)} — Reader's Lexicon</h1>
<div class="meta">${sorted.length} words &middot; generated ${new Date().toLocaleDateString()} &middot; Flash! Pro</div>
<table>
${rows}
</table>
</body></html>`;
}

const LEX_BOOK_NAMES = ['Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'];

function parseVerseRef(ref) {
    // BBCCCVV: 10101 = Matthew 1:1, 272221 = Revelation 22:21
    const book = Math.floor(ref / 10000);
    const ch = Math.floor(ref / 100) % 100;
    const v = ref % 100;
    const name = LEX_BOOK_NAMES[book - 1] || ('Book' + book);
    return { book, ch, v, key: book * 1000000 + ch * 1000 + v,
             label: `${name} ${ch}:${v}`, bookLabel: name };
}

function buildVerseLexicon(d, cards, refs) {
    // verse key -> {label, words: [{num, front}]}
    // Refs entries are either "Book C:V" strings (NT decks, sortable by parsing)
    // or {l: label, k: sortKey} objects (Qumran decks with fragment labels like f14).
    const verses = new Map();
    let hasObjs = false;
    const norm = refs && Object.values(refs).some(lst => lst.some(e => typeof e === 'object'));
    const entries = [];
    for (const c of cards) {
        const cardRefs = refs[c.id];
        if (!cardRefs) continue;
        for (const r of cardRefs) {
            if (typeof r === 'object') {
                hasObjs = true;
                entries.push({ key: r.k, label: r.l, front: c.front, num: c.num || c.id });
                continue;
            }
            const m = r.match(/^(\S+) (\d+):(\d+)(?:-(\d+))?$/);
            if (!m) continue;
            const bookIdx = LEX_BOOK_NAMES.indexOf(m[1]);
            const book = bookIdx >= 0 ? bookIdx + 1 : 99;
            const ch = parseInt(m[2], 10);
            const v1 = parseInt(m[3], 10);
            const v2 = m[4] ? parseInt(m[4], 10) : v1;
            for (let v = v1; v <= v2; v++) {
                entries.push({ key: book * 1000000 + ch * 1000 + v,
                    label: `${m[1]} ${ch}:${v}`, front: c.front, num: c.num || c.id });
            }
        }
    }
    for (const e of entries) {
        if (!verses.has(e.key)) {
            verses.set(e.key, { label: e.label, words: [] });
        }
        verses.get(e.key).words.push({ num: e.num, front: e.front });
    }
    const sorted = [...verses.values()].sort((a, b) => a.key - b.key);
    const rows = sorted.map(vs =>
        `<tr><td class="ref">${Utils.escH(vs.label)}</td><td class="words">${vs.words.map(w => `<span class="entry"><span class="w">${Utils.escH(w.front)}</span></span>`).join(' ')}</td></tr>`
    ).join('');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${Utils.escH(d.name)} — Reader's Lexicon</title>
<style>
body{font-family:'Times New Roman',serif;margin:2em;color:#000;background:#fff}
h1{font-size:1.3em;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:4px}
h2{font-size:1.05em;margin:1.4em 0 0.4em;border-bottom:1px solid #999;padding-bottom:3px}
.meta{color:#444;font-size:0.85em;margin-bottom:1.5em}
table{border-collapse:collapse;width:100%}
td{padding:3px 12px 3px 0;vertical-align:top;border-bottom:1px dotted #ccc}
td.ref{font-weight:700;width:18%;white-space:nowrap}
td.words{width:82%}
.w{font-weight:600}
@media print{td{border-bottom:1px dotted #999}}
</style></head><body>
<h1>${Utils.escH(d.name)} — Reader's Lexicon</h1>
<div class="meta">${cards.length} words across ${sorted.length} verses &middot; generated ${new Date().toLocaleDateString()} &middot; Flash! Pro</div>
<table>
${rows}
</table>
</body></html>`;
}
