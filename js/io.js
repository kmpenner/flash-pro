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
