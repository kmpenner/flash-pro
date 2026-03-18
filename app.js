        // =====================================================================
        // DATA MODEL
        // =====================================================================
const State = {
    decks: [],
    curDeckId: '',
    gatheredCards: [],
    drillSession: null,
    editIdx: 0,
    editCards: [],
    selectedTableRow: null,
    modalCallback: null,
    selCriteriaId: '',
    selBundleIds: new Set(),
    selCatIds: new Set(),
    selCritMgrId: '',
    bvSelCards: new Set(),
    bvSelBundleCards: new Set(),

    get deck() { return this.decks.find(d => d.id === this.curDeckId) || null }
};

const Utils = {
    uid: () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    now: () => Date.now(),
    dayMs: 86400000,
    escH: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    escAttr: (s) => String(s || '').replace(/"/g, '&quot;'),
    dlBlob: (blob, name) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        URL.revokeObjectURL(a.href);
    },
    flash: (id, msg) => {
        const el = document.getElementById(id);
        const prev = el.textContent;
        el.textContent = msg;
        setTimeout(() => el.textContent = prev, 1500);
    },
    card: (id) => State.deck?.cards.find(c => c.id === id),
    cat: (id) => State.deck?.categories.find(c => c.id === id)
};

function mkCard(front = '', back = '', categoryId = '', frequency = 0) {
    const mk = () => ({ timesRight: 0, timesWrong: 0, timesRightSinceWrong: 0, dateLastRight: null, dateLastWrong: null });
    return { id: Utils.uid(), front, back, categoryId, frequency, editedDate: Utils.now(), fb: mk(), bf: mk() };
}

function mkDeck(name = 'New Deck') {
    return {
        id: Utils.uid(), 
        name,
        cards: [],
        categories: [{ id: Utils.uid(), name: 'General' }],
        bundles: [],
        criteria: [
            { id: Utils.uid(), name: 'All Cards', logic: '' },
            { id: Utils.uid(), name: 'Never Studied', logic: 'TimesRight == 0 && TimesWrong == 0' },
            { id: Utils.uid(), name: 'Needs Review (< 3 right)', logic: 'TimesRightSinceWrong < 3' },
            { id: Utils.uid(), name: 'Elapsed Time', logic: 'DateLastRight > 0 && (Now - DateLastRight) > (DateLastRight - (DateLastWrong||DateLastRight))' },
            { id: Utils.uid(), name: 'High Frequency', logic: 'Frequency >= 10' },
        ],
        settings: { fontSize: 22, headTmpl: '', frontTmpl: '', backTmpl: '' },
    };
}

        // =====================================================================
        // STORE
        // =====================================================================
const Store = {
    load() { return JSON.parse(localStorage.getItem('flashpro_decks') || '[]') },
    save(decks) { localStorage.setItem('flashpro_decks', JSON.stringify(decks)) },
    currentId() { return localStorage.getItem('flashpro_cur') || '' },
    setCur(id) { localStorage.setItem('flashpro_cur', id) },
};

function save() { Store.save(State.decks); }

        // =====================================================================
        // INIT
        // =====================================================================
function init() {
    State.decks = Store.load();
    if (!State.decks.length) {
        const d = mkDeck('My Flashcards');
        const cats = d.categories;
        ['amare (to love)', 'scribere (to write)', 'legere (to read)', 'venire (to come)', 'videre (to see)'].forEach((b, i) => {
            d.cards.push(mkCard(['amor', 'scriptor', 'lector', 'ventor', 'visor'][i], b, cats[0].id, i * 5 + 5));
        });
        State.decks.push(d);
        save();
    }
    State.curDeckId = Store.currentId();
    if (!State.deck) State.curDeckId = State.decks[0].id;
    Store.setCur(State.curDeckId);
    renderDeckBar();
    renderSelectView();
    renderEditView();
    renderBundleView();
    renderCriteriaView();
    renderSettingsView();
    renderExportFields();
    updateDeckStats();
}

        // =====================================================================
        // NAVIGATION
        // =====================================================================
        function showView(v) {
            document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
            document.getElementById('view-' + v).classList.add('active');
            const btns = [...document.querySelectorAll('.nav-btn')];
            const names = ['select', 'drill', 'edit', 'tables', 'bundles', 'criteria', 'settings', 'ie'];
            const i = names.indexOf(v);
            if (i >= 0) btns[i].classList.add('active');
            if (v === 'edit') renderEditCards();
            if (v === 'tables') renderTable(document.getElementById('table-select').value);
            if (v === 'bundles') renderBundleView();
        }

        // =====================================================================
        // DECK BAR
        // =====================================================================
function renderDeckBar() {
    const sel = document.getElementById('deck-select');
    sel.innerHTML = State.decks.map(d => `<option value="${d.id}"${d.id === State.curDeckId ? ' selected' : ''}>${Utils.escH(d.name)}</option>`).join('');
}
function updateDeckStats() {
    const d = State.deck;
    if (!d) return;
    document.getElementById('deck-stats').textContent = `${d.cards.length} cards | ${d.bundles.length} bundles | ${d.categories.length} categories`;
}
function switchDeck(id) { State.curDeckId = id; Store.setCur(id); State.gatheredCards = []; renderSelectView(); renderEditView(); renderBundleView(); renderCriteriaView(); renderSettingsView(); updateDeckStats(); }
function newDeck() {
    openModal('New Deck', '<input type="text" id="m-name" placeholder="Deck name…" style="width:100%">', () => {
        const name = document.getElementById('m-name').value.trim();
        if (!name) return;
        const d = mkDeck(name);
        State.decks.push(d); save();
        State.curDeckId = d.id; Store.setCur(d.id);
        renderDeckBar(); renderSelectView(); renderEditView(); renderBundleView(); renderCriteriaView(); renderSettingsView(); updateDeckStats();
    });
    setTimeout(() => document.getElementById('m-name')?.focus(), 50);
}
function deleteDeck() {
    if (State.decks.length <= 1) { alert('Cannot delete the last deck.'); return; }
    if (!confirm(`Delete deck "${State.deck.name}"? This cannot be undone.`)) return;
    State.decks = State.decks.filter(d => d.id !== State.curDeckId); save();
    State.curDeckId = State.decks[0].id; Store.setCur(State.curDeckId);
    renderDeckBar(); renderSelectView(); renderEditView(); renderBundleView(); renderCriteriaView(); renderSettingsView(); updateDeckStats();
}
function exportDeck() {
    const d = State.deck;
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    Utils.dlBlob(blob, d.name.replace(/\s+/g, '_') + '.flashpro.json');
}
function importDeckFile() { document.getElementById('load-deck-input').click(); }
function handleLoadDeck(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
        try {
            const d = JSON.parse(ev.target.result);
            if (!d.cards || !d.id) throw new Error('Invalid deck file');
            d.id = Utils.uid();
            d.name = (d.name || 'Imported Deck') + ' (imported)';
            State.decks.push(d); save(); State.curDeckId = d.id; Store.setCur(d.id);
            renderDeckBar(); renderSelectView(); renderEditView(); renderBundleView(); renderCriteriaView(); renderSettingsView(); updateDeckStats();
            alert('Deck loaded: ' + d.name);
        } catch (err) { alert('Error loading deck: ' + err.message); }
    };
    r.readAsText(f);
    e.target.value = '';
}

        // =====================================================================
        // CRITERIA ENGINE
        // =====================================================================
function evaluateCriteria(logic, card_obj, dir) {
    if (!logic || !logic.trim()) return true;
    const m = card_obj[dir];
    const nowMs = Utils.now();
    let dlr = m.dateLastRight || 0;
    let dlw = m.dateLastWrong || 0;
    let drsw = 0;
    if (dlr > 0 && (dlw === 0 || dlr > dlw)) { drsw = (nowMs - dlr) / Utils.dayMs; }
    const ctx = {
        Now: nowMs, Frequency: card_obj.frequency || 0,
        TimesRight: m.timesRight || 0, TimesWrong: m.timesWrong || 0,
        TimesRightSinceWrong: m.timesRightSinceWrong || 0,
        DateLastRight: dlr, DateLastWrong: dlw, DaysRightSinceWrong: drsw,
    };
    let expr = logic;
    expr = expr.replace(/([^!<>=])=([^=])/g, '$1==$2');
    for (const [k, v] of Object.entries(ctx)) {
        expr = expr.replace(new RegExp('\\b' + k + '\\b', 'g'), String(v));
    }
    expr = expr.replace(/\bAND\b/gi, '&&').replace(/\bOR\b/gi, '||');
    try { return !!Function('"use strict";return(' + expr + ')')(); } catch { return false; }
}

        // =====================================================================
        // SELECT VIEW
        // =====================================================================

function renderSelectView() {
    const d = State.deck; if (!d) return;
    const cl = document.getElementById('criteria-list');
    cl.innerHTML = d.criteria.map(c => `<div class="li${State.selCriteriaId === c.id ? ' sel' : ''}" onclick="selectCriteria('${c.id}')">${Utils.escH(c.name)}</div>`).join('') || '<div class="empty-msg">No criteria</div>';
    const bl = document.getElementById('bundle-list');
    bl.innerHTML = d.bundles.map(b => `<div class="li${State.selBundleIds.has(b.id) ? ' sel2' : ''}" onclick="toggleBundle('${b.id}')">${Utils.escH(b.name)}<span class="badge">${b.cardIds.length}</span></div>`).join('') || '<div class="empty-msg">No bundles</div>';
    const cat_l = document.getElementById('cat-list');
    cat_l.innerHTML = d.categories.map(c => `<div class="li${State.selCatIds.has(c.id) ? ' sel2' : ''}" onclick="toggleCat('${c.id}')">${Utils.escH(c.name)}</div>`).join('') || '<div class="empty-msg">No categories</div>';
    renderGatheredList();
}
function selectCriteria(id) {
    State.selCriteriaId = id;
    const c = State.deck.criteria.find(x => x.id === id);
    document.getElementById('criteria-display').textContent = c ? c.logic : '';
    renderSelectView();
}
function toggleBundle(id) { if (State.selBundleIds.has(id)) State.selBundleIds.delete(id); else State.selBundleIds.add(id); renderSelectView(); }
function toggleCat(id) { if (State.selCatIds.has(id)) State.selCatIds.delete(id); else State.selCatIds.add(id); renderSelectView(); }
function renderGatheredList() {
    const gl = document.getElementById('gathered-list');
    if (!State.gatheredCards.length) { gl.innerHTML = '<div class="empty-msg">Press Gather to find matching cards</div>'; document.getElementById('sel-badge').textContent = '0'; return; }
    gl.innerHTML = State.gatheredCards.map((c, i) => `<div class="li">${i + 1}. ${Utils.escH(c.front)}</div>`).join('');
    document.getElementById('sel-badge').textContent = State.gatheredCards.length;
}
function gatherCards() {
    const d = State.deck; if (!d) return;
    const crit = d.criteria.find(c => c.id === State.selCriteriaId);
    const logic = crit ? crit.logic : '';
    const dir = document.getElementById('drill-direction').value;
    const dirs = dir === 'both' ? ['fb', 'bf'] : [dir];
    const bFilter = State.selBundleIds.size > 0;
    const catFilter = State.selCatIds.size > 0;
    let seen = new Set();
    let result = [];
    for (const card_obj of d.cards) {
        if (bFilter) {
            const inBundle = d.bundles.some(b => State.selBundleIds.has(b.id) && b.cardIds.includes(card_obj.id));
            if (!inBundle) continue;
        }
        if (catFilter && !State.selCatIds.has(card_obj.categoryId)) continue;
        for (const dr of dirs) {
            const key = card_obj.id + '_' + dr;
            if (seen.has(key)) continue;
            if (evaluateCriteria(logic, card_obj, dr)) {
                seen.add(key);
                result.push({ ...card_obj, _dir: dr });
            }
        }
    }
    const max = parseInt(document.getElementById('max-cards').value) || result.length;
    State.gatheredCards = result.slice(0, max);
    renderGatheredList();
    document.getElementById('gathered-count').textContent = `(${result.length} matched, showing ${State.gatheredCards.length})`;
}
function startDrill() {
    if (!State.gatheredCards.length) { alert('No cards gathered. Press Gather first.'); return; }
    State.drillSession = {
        cards: [...State.gatheredCards],
        idx: 0,
        flipped: false,
        right: 0,
        wrong: 0,
        history: [],
    };
    showView('drill');
    renderDrillCard();
}

        // =====================================================================
        // DRILL VIEW
        // =====================================================================
function renderDrillCard() {
    const s = State.drillSession; if (!s) return;
    if (s.idx >= s.cards.length) { endDrill(); return; }
    const c = s.cards[s.idx];
    const total = s.cards.length;
    document.getElementById('drill-progress').textContent = `Card ${s.idx + 1} of ${total}`;
    document.getElementById('session-dir').textContent = c._dir === 'fb' ? 'Front → Back' : 'Back → Front';
    const d = State.deck;
    const settings = d.settings || {};
    const frontText = c._dir === 'fb' ? c.front : c.back;
    renderCardFace('drill-front', frontText, settings.frontTmpl || '', settings.headTmpl || '', settings.fontSize || 22, 'front');
    document.getElementById('drill-back').style.display = 'none';
    s.flipped = false;
    document.getElementById('drill-btns-flip').style.display = 'flex';
    document.getElementById('drill-btns-judge').style.display = 'none';
    updateDrillStats();
}
function renderCardFace(elId, text, tmpl, head, fontSize, side) {
    const el = document.getElementById(elId);
    if (tmpl) {
        const html = `<html><head>${head}<style>body{margin:8px;color:#dde1ec;font-size:${fontSize}px;display:flex;align-items:center;justify-content:center;min-height:80px;word-break:break-word;text-align:center;}*{box-sizing:border-box;}</style></head><body>${tmpl.replace(/\{\{front\}\}/g, Utils.escH(text)).replace(/\{\{back\}\}/g, Utils.escH(text))}</body></html>`;
        el.innerHTML = `<iframe srcdoc="${Utils.escAttr(html)}" style="width:100%;height:100%;min-height:140px;border:none;background:transparent"></iframe>`;
    } else {
        el.style.fontSize = fontSize + 'px';
        el.textContent = text;
    }
}
function flipCard() {
    const s = State.drillSession; if (!s) return;
    const c = s.cards[s.idx];
    const d = State.deck;
    const settings = d.settings || {};
    const backText = c._dir === 'fb' ? c.back : c.front;
    const backEl = document.getElementById('drill-back');
    renderCardFace('drill-back', backText, settings.backTmpl || '', settings.headTmpl || '', settings.fontSize || 22, 'back');
    backEl.style.display = 'flex';
    s.flipped = true;
    document.getElementById('drill-btns-flip').style.display = 'none';
    document.getElementById('drill-btns-judge').style.display = 'flex';
}
function judgeCard(right) {
    const s = State.drillSession; if (!s) return;
    const c = s.cards[s.idx];
    const d = State.deck;
    const realCard = d.cards.find(x => x.id === c.id);
    if (realCard) {
        const m = realCard[c._dir];
        if (right) {
            m.timesRight++; m.timesRightSinceWrong++; m.dateLastRight = Utils.now();
            s.right++;
        } else {
            m.timesWrong++; m.timesRightSinceWrong = 0; m.dateLastWrong = Utils.now();
            s.wrong++;
        }
        save();
    }
    s.history.push({ cardId: c.id, dir: c._dir, right });
    s.idx++;
    renderDrillCard();
}
function prevCard() {
    const s = State.drillSession; if (!s || s.idx <= 0) return;
    s.idx--;
    if (s.history.length > 0) {
        const last = s.history.pop();
        const d = State.deck;
        const rc = d.cards.find(x => x.id === last.cardId);
        if (rc) {
            const m = rc[last.dir];
            if (last.right) { m.timesRight--; m.timesRightSinceWrong = Math.max(0, m.timesRightSinceWrong - 1); if (m.timesRight < 0) m.timesRight = 0; s.right--; }
            else { m.timesWrong--; if (m.timesWrong < 0) m.timesWrong = 0; s.wrong--; }
            save();
        }
    }
    renderDrillCard();
}
function updateDrillStats() {
    const s = State.drillSession;
    if (!s) { ['s-left', 's-right', 's-wrong', 's-score'].forEach(id => document.getElementById(id).textContent = '–'); return; }
    const left = s.cards.length - s.idx;
    const total = s.right + s.wrong;
    const score = total ? Math.round(s.right / total * 100) : 0;
    document.getElementById('s-left').textContent = left;
    document.getElementById('s-right').textContent = s.right;
    document.getElementById('s-wrong').textContent = s.wrong;
    document.getElementById('s-score').textContent = total ? score + '%' : '–';
}
function endDrill() {
    const s = State.drillSession;
    const total = s.right + s.wrong;
    const score = total ? Math.round(s.right / total * 100) : 0;
    document.getElementById('drill-front').textContent = `Session Complete! Score: ${score}% (${s.right} right, ${s.wrong} wrong)`;
    document.getElementById('drill-back').style.display = 'none';
    document.getElementById('drill-btns-flip').style.display = 'none';
    document.getElementById('drill-btns-judge').style.display = 'none';
    updateDrillStats();
}
function editCurrentCard() {
    if (!State.drillSession) return;
    const c = State.drillSession.cards[State.drillSession.idx];
    if (!c) return;
    showView('edit');
    State.editCards = State.deck.cards;
    State.editIdx = State.editCards.findIndex(x => x.id === c.id);
    renderEditCard();
}

        // =====================================================================
        // EDIT VIEW
        // =====================================================================
function renderEditCards() {
    const d = State.deck; if (!d) return;
    State.editCards = [...d.cards];
    renderEditCard();
}
function renderEditCard() {
    const d = State.deck; if (!d) return;
    if (!State.editCards.length) { clearEditForm(); return; }
    if (State.editIdx < 0) State.editIdx = 0;
    if (State.editIdx >= State.editCards.length) State.editIdx = State.editCards.length - 1;
    const c = State.editCards[State.editIdx];
    document.getElementById('edit-pos').textContent = `${State.editIdx + 1} / ${State.editCards.length}`;
    document.getElementById('edit-front').value = c.front || '';
    document.getElementById('edit-back').value = c.back || '';
    document.getElementById('edit-freq').value = c.frequency || 0;
    const catSel = document.getElementById('edit-cat');
    catSel.innerHTML = d.categories.map(cat => `<option value="${cat.id}"${cat.id === c.categoryId ? ' selected' : ''}>${Utils.escH(cat.name)}</option>`).join('');
    document.getElementById('metrics-fb').innerHTML = renderMetrics(c.fb);
    document.getElementById('metrics-bf').innerHTML = renderMetrics(c.bf);
    const cardBundles = d.bundles.filter(b => b.cardIds.includes(c.id));
    document.getElementById('edit-bundles').innerHTML = cardBundles.length ? cardBundles.map(b => `<span class="tag">${Utils.escH(b.name)}</span>`).join('') : '<span style="color:#5a6890;font-size:.8em">No bundles</span>';
}
function renderMetrics(m) {
    const fmt = v => v ? new Date(v).toLocaleDateString() : '–';
    return [
        ['Times Right', m.timesRight || 0],
        ['Times Wrong', m.timesWrong || 0],
        ['Right Since Wrong', m.timesRightSinceWrong || 0],
        ['Last Right', fmt(m.dateLastRight)],
        ['Last Wrong', fmt(m.dateLastWrong)],
    ].map(([l, v]) => `<div class="metric-row"><span class="metric-label">${l}</span><span class="metric-val">${v}</span></div>`).join('');
}
function clearEditForm() {
    ['edit-front', 'edit-back'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('edit-freq').value = '0';
    document.getElementById('edit-pos').textContent = '–';
    document.getElementById('metrics-fb').innerHTML = '';
    document.getElementById('metrics-bf').innerHTML = '';
}
function editNav(dir) {
    if (dir === 'first') State.editIdx = 0;
    else if (dir === 'prev') State.editIdx = Math.max(0, State.editIdx - 1);
    else if (dir === 'next') State.editIdx = Math.min(State.editCards.length - 1, State.editIdx + 1);
    else if (dir === 'last') State.editIdx = State.editCards.length - 1;
    renderEditCard();
}
function editSearch(q) {
    const d = State.deck; if (!d) return;
    q = q.toLowerCase();
    State.editCards = q ? d.cards.filter(c => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)) : d.cards;
    State.editIdx = 0;
    renderEditCard();
}
function saveCurrentCard() {
    const d = State.deck; if (!d || !State.editCards.length) return;
    const c = State.editCards[State.editIdx];
    const realCard = d.cards.find(x => x.id === c.id);
    if (!realCard) return;
    realCard.front = document.getElementById('edit-front').value;
    realCard.back = document.getElementById('edit-back').value;
    realCard.frequency = parseFloat(document.getElementById('edit-freq').value) || 0;
    realCard.categoryId = document.getElementById('edit-cat').value;
    realCard.editedDate = Utils.now();
    Object.assign(c, realCard);
    save(); updateDeckStats();
    Utils.flash('edit-pos', 'Saved!');
}
function addNewCard() {
    const d = State.deck; if (!d) return;
    const c = mkCard('', '', d.categories[0]?.id || '');
    d.cards.push(c); save();
    State.editCards = d.cards;
    State.editIdx = State.editCards.length - 1;
    renderEditCard();
    document.getElementById('edit-front').focus();
    updateDeckStats();
}
function deleteCurrentCard() {
    const d = State.deck; if (!d || !State.editCards.length) return;
    const c = State.editCards[State.editIdx];
    if (!confirm('Delete this card?')) return;
    d.cards = d.cards.filter(x => x.id !== c.id);
    d.bundles.forEach(b => b.cardIds = b.cardIds.filter(id => id !== c.id));
    save();
    State.editCards = d.cards;
    State.editIdx = Math.min(State.editIdx, State.editCards.length - 1);
    renderEditCard(); updateDeckStats();
}
function clearHistory(scope) {
    const d = State.deck; if (!d) return;
    const mk = () => ({ timesRight: 0, timesWrong: 0, timesRightSinceWrong: 0, dateLastRight: null, dateLastWrong: null });
    if (scope === 'card' && State.editCards.length) {
        const c = d.cards.find(x => x.id === State.editCards[State.editIdx].id);
        if (c) { c.fb = mk(); c.bf = mk(); save(); renderEditCard(); }
    } else if (scope === 'all') {
        if (!confirm('Clear ALL card history? Cannot be undone.')) return;
        d.cards.forEach(c => { c.fb = mk(); c.bf = mk(); }); save(); renderEditCard();
    }
}

        // =====================================================================
        // TABLES VIEW
        // =====================================================================
        const TABLE_COLS = {
            cards: ['id', 'front', 'back', 'categoryId', 'frequency', 'editedDate'],
            categories: ['id', 'name'],
            criteria: ['id', 'name', 'logic'],
            bundles: ['id', 'name'],
        };
function renderTable(type) {
    const d = State.deck; if (!d) return;
    const q = (document.getElementById('table-search').value || '').toLowerCase();
    let rows = d[type] || [];
    if (q) rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
    const cols = TABLE_COLS[type];
    document.getElementById('table-head').innerHTML = '<tr><th>#</th>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>';
    document.getElementById('table-body').innerHTML = rows.map((r, i) => `<tr onclick="selectTableRow(this,'${r.id}')" data-id="${r.id}"><td>${i + 1}</td>${cols.map(c => `<td><input value="${Utils.escAttr(String(r[c] ?? ''))}" onchange="updateTableCell('${type}','${r.id}','${c}',this.value)"></td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 1}" style="text-align:center;color:#3a4060;padding:20px">No data</td></tr>`;
}
function selectTableRow(tr, id) { State.selectedTableRow = id;[...document.querySelectorAll('#table-body tr')].forEach(r => r.style.background = ''); tr.style.background = 'rgba(255,255,255,0.05)'; }
function updateTableCell(type, id, col, val) {
    const d = State.deck; if (!d) return;
    const r = (d[type] || []).find(x => x.id === id); if (!r) return;
    r[col] = isNaN(val) || val === '' ? val : Number(val);
    save();
}
function addTableRow() {
    const type = document.getElementById('table-select').value;
    const d = State.deck; if (!d) return;
    if (type === 'cards') d.cards.push(mkCard());
    else if (type === 'categories') d.categories.push({ id: Utils.uid(), name: 'New Category' });
    else if (type === 'criteria') d.criteria.push({ id: Utils.uid(), name: 'New Criteria', logic: '' });
    else if (type === 'bundles') d.bundles.push({ id: Utils.uid(), name: 'New Bundle', cardIds: [] });
    save(); renderTable(type); updateDeckStats();
}
function deleteTableRow() {
    const type = document.getElementById('table-select').value;
    const d = State.deck; if (!d || !State.selectedTableRow) return;
    if (!confirm('Delete selected row?')) return;
    d[type] = (d[type] || []).filter(r => r.id !== State.selectedTableRow);
    save(); State.selectedTableRow = null; renderTable(type); updateDeckStats();
}

function renderBundleView() {
    const d = State.deck; if (!d) return;
    const q = (document.getElementById('bundle-card-search').value || '').toLowerCase();
    const cards = q ? d.cards.filter(c => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)) : d.cards;
    document.getElementById('bv-cards').innerHTML = cards.map(c => `<div class="li${State.bvSelCards.has(c.id) ? ' sel' : ''}" onclick="toggleBvCard('${c.id}')">${Utils.escH(c.front)}</div>`).join('') || '<div class="empty-msg">No cards</div>';
    const bSel = document.getElementById('bv-bundle-select');
    const prevVal = bSel.value;
    bSel.innerHTML = d.bundles.map(b => `<option value="${b.id}">${Utils.escH(b.name)}</option>`).join('') || '<option value="">-- no bundles --</option>';
    if (prevVal && d.bundles.find(b => b.id === prevVal)) bSel.value = prevVal;
    const bid = bSel.value;
    const bundle = d.bundles.find(b => b.id === bid);
    if (bundle) {
        const bcards = bundle.cardIds.map(id => d.cards.find(c => c.id === id)).filter(Boolean);
        document.getElementById('bv-bundle-cards').innerHTML = bcards.map(c => `<div class="li${State.bvSelBundleCards.has(c.id) ? ' sel' : ''}" onclick="toggleBvBundleCard('${c.id}')">${Utils.escH(c.front)}</div>`).join('') || '<div class="empty-msg">Bundle is empty</div>';
    } else { document.getElementById('bv-bundle-cards').innerHTML = '<div class="empty-msg">Select a bundle</div>'; }
}
function toggleBvCard(id) { if (State.bvSelCards.has(id)) State.bvSelCards.delete(id); else State.bvSelCards.add(id); renderBundleView(); }
function toggleBvBundleCard(id) { if (State.bvSelBundleCards.has(id)) State.bvSelBundleCards.delete(id); else State.bvSelBundleCards.add(id); renderBundleView(); }
function addToBundle() {
    const d = State.deck; if (!d) return;
    const bid = document.getElementById('bv-bundle-select').value;
    const bundle = d.bundles.find(b => b.id === bid); if (!bundle) { alert('Select a bundle first.'); return; }
    State.bvSelCards.forEach(id => { if (!bundle.cardIds.includes(id)) bundle.cardIds.push(id); });
    save(); State.bvSelCards.clear(); renderBundleView();
}
function removeFromBundle() {
    const d = State.deck; if (!d) return;
    const bid = document.getElementById('bv-bundle-select').value;
    const bundle = d.bundles.find(b => b.id === bid); if (!bundle) return;
    bundle.cardIds = bundle.cardIds.filter(id => !State.bvSelBundleCards.has(id));
    save(); State.bvSelBundleCards.clear(); renderBundleView();
}
function createBundle() {
    const name = document.getElementById('new-bundle-name').value.trim();
    if (!name) { alert('Enter a bundle name.'); return; }
    const d = State.deck; if (!d) return;
    d.bundles.push({ id: Utils.uid(), name, cardIds: [] });
    save(); document.getElementById('new-bundle-name').value = ''; renderBundleView(); renderSelectView(); updateDeckStats();
}
function deleteBundle() {
    const d = State.deck; if (!d) return;
    const bid = document.getElementById('bv-bundle-select').value; if (!bid) { alert('Select a bundle first.'); return; }
    if (!confirm('Delete this bundle?')) return;
    d.bundles = d.bundles.filter(b => b.id !== bid);
    save(); renderBundleView(); renderSelectView(); updateDeckStats();
}

function renderCriteriaView() {
    const d = State.deck; if (!d) return;
    document.getElementById('criteria-mgr-list').innerHTML = d.criteria.map(c => `<div class="li${State.selCritMgrId === c.id ? ' sel' : ''}" onclick="selectCritMgr('${c.id}')">${Utils.escH(c.name)}</div>`).join('') || '<div class="empty-msg">No criteria</div>';
}
function selectCritMgr(id) {
    State.selCritMgrId = id;
    const d = State.deck; const c = d.criteria.find(x => x.id === id);
    if (c) { document.getElementById('crit-name').value = c.name; document.getElementById('crit-logic').value = c.logic; }
    renderCriteriaView();
}
function newCriteria() {
    State.selCritMgrId = '';
    document.getElementById('crit-name').value = '';
    document.getElementById('crit-logic').value = '';
    renderCriteriaView();
}
function saveCriteria() {
    const d = State.deck; if (!d) return;
    const name = document.getElementById('crit-name').value.trim();
    const logic = document.getElementById('crit-logic').value.trim();
    if (!name) { alert('Enter a name.'); return; }
    if (State.selCritMgrId) {
        const c = d.criteria.find(x => x.id === State.selCritMgrId); if (c) { c.name = name; c.logic = logic; }
    } else {
        const newC = { id: Utils.uid(), name, logic };
        d.criteria.push(newC); State.selCritMgrId = newC.id;
    }
    save(); renderCriteriaView(); renderSelectView();
}
function deleteCriteria() {
    if (!State.selCritMgrId) return;
    if (!confirm('Delete this criteria?')) return;
    const d = State.deck; d.criteria = d.criteria.filter(c => c.id !== State.selCritMgrId);
    State.selCritMgrId = ''; save(); renderCriteriaView(); renderSelectView();
}
function testCriteria() {
    const d = State.deck; if (!d) return;
    const logic = document.getElementById('crit-logic').value.trim();
    const dir = document.getElementById('drill-direction').value === 'bf' ? 'bf' : 'fb';
    const matches = d.cards.filter(c => evaluateCriteria(logic, c, dir));
    document.getElementById('crit-test-result').textContent = `→ ${matches.length} card(s) match`;
}

function renderSettingsView() {
    const d = State.deck; if (!d) return;
    const s = d.settings || {};
    document.getElementById('font-size').value = s.fontSize || 22;
    document.getElementById('font-size-label').textContent = (s.fontSize || 22) + 'px';
    document.getElementById('tmpl-head').value = s.headTmpl || '';
    document.getElementById('tmpl-front').value = s.frontTmpl || '';
    document.getElementById('tmpl-back').value = s.backTmpl || '';
}
function updateFontSize(v) { document.getElementById('font-size-label').textContent = v + 'px'; }
function saveSettings() {
    const d = State.deck; if (!d) return;
    if (!d.settings) d.settings = {};
    d.settings.fontSize = parseInt(document.getElementById('font-size').value) || 22;
    d.settings.headTmpl = document.getElementById('tmpl-head').value;
    d.settings.frontTmpl = document.getElementById('tmpl-front').value;
    d.settings.backTmpl = document.getElementById('tmpl-back').value;
    save(); alert('Settings saved.');
}
function resetSettings() {
    const d = State.deck; if (!d) return;
    d.settings = { fontSize: 22, headTmpl: '', frontTmpl: '', backTmpl: '' };
    save(); renderSettingsView();
}

const ALL_FIELDS = ['front', 'back', 'categoryId', 'frequency', 'fb.timesRight', 'fb.timesWrong', 'fb.timesRightSinceWrong', 'fb.dateLastRight', 'fb.dateLastWrong', 'bf.timesRight', 'bf.timesWrong', 'bf.timesRightSinceWrong', 'bf.dateLastRight', 'bf.dateLastWrong'];
function renderExportFields() {
    document.getElementById('export-fields').innerHTML = ALL_FIELDS.map(f => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" value="${f}"${['front', 'back', 'categoryId', 'frequency'].includes(f) ? ' checked' : ''}> ${f}</label>`).join('');
}
function getExportFields() { return [...document.querySelectorAll('#export-fields input:checked')].map(i => i.value); }
function getField(card_obj, f) {
    const parts = f.split('.');
    let v = card_obj;
    for (const p of parts) v = v?.[p];
    return v ?? '';
}
function doExport() {
    const d = State.deck; if (!d) return;
    const scope = document.getElementById('export-scope').value;
    const cards = scope === 'gathered' && State.gatheredCards.length ? State.gatheredCards : d.cards;
    const fields = getExportFields();
    const fmt = document.getElementById('export-format').value;
    let content = '', ext = '', mime = '';
    if (fmt === 'json') {
        content = JSON.stringify(cards.map(c => Object.fromEntries(fields.map(f => [f, getField(c, f)]))), null, 2);
        ext = 'json'; mime = 'application/json';
    } else {
        const sep = fmt === 'csv' ? ',' : '\t';
        const rows = [fields, ...cards.map(c => fields.map(f => String(getField(c, f)).replace(/[\t\n]/g, ' ')))];
        content = rows.map(r => r.join(sep)).join('\n');
        ext = fmt; mime = 'text/plain';
    }
    Utils.dlBlob(new Blob([content], { type: mime }), d.name + '_export.' + ext);
}

let importParsed = null;
function parseImportData() {
    const raw = document.getElementById('import-data').value.trim();
    if (!raw) return;
    const lines = raw.split('\n');
    const sep = raw.includes('\t') ? '\t' : ',';
    const headers = lines[0].split(sep).map(h => h.trim());
    const rows = lines.slice(1).map(l => l.split(sep));
    importParsed = { headers, rows };
    const d = State.deck;
    document.getElementById('import-mapping').innerHTML = `<div class="flab">Map columns to card fields</div>` + headers.map((h, i) => `<div class="row"><span style="min-width:100px;font-size:.82em;color:#5a6890">${h}</span><select id="imap-${i}" style="flex:1"><option value="">-- skip --</option>${['front', 'back', 'categoryId', 'frequency'].map(f => `<option value="${f}"${h.toLowerCase() === f.toLowerCase() ? ` selected` : ''}>${f}</option>`).join('')}</select></div>`).join('');
    document.getElementById('import-btn').style.display = 'block';
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
    save(); updateDeckStats();
    alert(`Imported ${added} cards.`);
    document.getElementById('import-btn').style.display = 'none';
    document.getElementById('import-data').value = '';
    document.getElementById('import-mapping').innerHTML = '';
    importParsed = null;
}
function doBatchReplace() {
    const d = State.deck; if (!d) return;
    const find = document.getElementById('br-find').value;
    const repl = document.getElementById('br-replace').value;
    const field = document.getElementById('br-field').value;
    if (!find) { alert('Enter a find term.'); return; }
    let count = 0;
    d.cards.forEach(c => {
        if ((field === 'front' || field === 'both') && c.front.includes(find)) { c.front = c.front.replaceAll(find, repl); count++; }
        if ((field === 'back' || field === 'both') && c.back.includes(find)) { c.back = c.back.replaceAll(find, repl); count++; }
    });
    save(); document.getElementById('br-result').textContent = `Replaced in ${count} card(s).`;
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
function openModal(title, body, cb) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal').style.display = 'flex';
    State.modalCallback = cb;
}
function closeModal() { document.getElementById('modal').style.display = 'none'; State.modalCallback = null; }
function modalOk() { if (State.modalCallback) State.modalCallback(); closeModal(); }

document.addEventListener('keydown', e => {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowRight' || e.key === 'Enter') flipCard();
    else if (e.key === 'y' || e.key === 'Y') judgeCard(true);
    else if (e.key === 'n' || e.key === 'N') judgeCard(false);
    else if (e.key === 'ArrowLeft') prevCard();
});

init();
