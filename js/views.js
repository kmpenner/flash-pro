// =====================================================================
// APP NAVIGATION & SHELL
// =====================================================================

function showView(v) {
    if (v !== 'drill' && typeof cancelAutoRestart === 'function') cancelAutoRestart();
    if (v === 'drill' && !State.drillSession) {
        if (!State.gatheredCards.length && typeof gatherCards === 'function') gatherCards();
        if (typeof startDrill === 'function') startDrill();
        return;
    }
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    const viewEl = document.getElementById('view-' + v);
    if (viewEl) viewEl.classList.add('active');
    const btns = [...document.querySelectorAll('.nav-btn')];
    const names = ['select', 'drill', 'edit', 'tables', 'bundles', 'criteria', 'settings', 'ie'];
    const i = names.indexOf(v);
    if (i >= 0 && btns[i]) btns[i].classList.add('active');
    if (v === 'edit') renderEditCards();
    if (v === 'tables') {
        const ts = document.getElementById('table-select');
        if (ts) renderTable(ts.value);
    }
    if (v === 'bundles') renderBundleView();
}

function renderAll() {
    renderDeckBar();
    if (typeof renderSelectView === 'function') renderSelectView();
    renderEditCards();
    renderBundleView();
    if (typeof renderCriteriaView === 'function') renderCriteriaView();
    renderSettingsView();
    if (typeof renderExportFields === 'function') renderExportFields();
    updateDeckStats();
}

// =====================================================================
// DECK BAR & MANAGEMENT
// =====================================================================

function renderDeckBar() {
    const sel = document.getElementById('deck-select');
    if (sel) {
        sel.innerHTML = State.decks.map(d => `<option value="${d.id}"${d.id === State.curDeckId ? ' selected' : ''}>${Utils.escH(d.name)}</option>`).join('');
    }
}

function updateDeckStats() {
    const d = State.deck;
    if (!d) return;
    const statsEl = document.getElementById('deck-stats');
    if (statsEl) {
        statsEl.textContent = `${d.cards.length} cards | ${d.bundles.length} bundles | ${d.categories.length} categories`;
    }
}

function switchDeck(id) {
    State.curDeckId = id;
    Store.setCur(id);
    State.gatheredCards = [];
    renderAll();
}

function newDeck() {
    openModal('New Deck', '<input type="text" id="m-name" placeholder="Deck name…" style="width:100%">', () => {
        const name = (document.getElementById('m-name')?.value || '').trim();
        if (!name) return;
        const d = mkDeck(name);
        State.decks.push(d); save();
        State.curDeckId = d.id; Store.setCur(d.id);
        renderAll();
    });
    setTimeout(() => document.getElementById('m-name')?.focus(), 50);
}

function deleteDeck() {
    if (State.decks.length <= 1) { alert('Cannot delete the last deck.'); return; }
    if (!confirm(`Delete deck "${State.deck?.name}"? This cannot be undone.`)) return;
    State.decks = State.decks.filter(d => d.id !== State.curDeckId); save();
    State.curDeckId = State.decks[0].id; Store.setCur(State.curDeckId);
    renderAll();
}

function exportDeck() {
    const d = State.deck;
    if (!d) return;
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    Utils.dlBlob(blob, d.name.replace(/\s+/g, '_') + '.flashpro.json');
}

function importDeckFile() {
    const input = document.getElementById('load-deck-input');
    if (input) input.click();
}

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
            renderAll();
            alert('Deck loaded: ' + d.name);
        } catch (err) { alert('Error loading deck: ' + err.message); }
    };
    r.readAsText(f);
    e.target.value = '';
}

// =====================================================================
// CARD EDITOR
// =====================================================================

function renderEditCards() {
    const d = State.deck; if (!d) return;
    State.editCards = [...d.cards];
    renderEditCard();
}

function renderEditView() { renderEditCards(); }

function renderEditCard() {
    const d = State.deck; if (!d) return;
    if (!State.editCards.length) { clearEditForm(); return; }
    if (State.editIdx < 0) State.editIdx = 0;
    if (State.editIdx >= State.editCards.length) State.editIdx = State.editCards.length - 1;
    const c = State.editCards[State.editIdx];
    const posEl = document.getElementById('edit-pos');
    if (posEl) posEl.textContent = `${State.editIdx + 1} / ${State.editCards.length}`;
    const frontEl = document.getElementById('edit-front');
    if (frontEl) frontEl.value = c.front || '';
    const backEl = document.getElementById('edit-back');
    if (backEl) backEl.value = c.back || '';
    const freqEl = document.getElementById('edit-freq');
    if (freqEl) freqEl.value = c.frequency || 0;
    const catSel = document.getElementById('edit-cat');
    if (catSel) {
        catSel.innerHTML = d.categories.map(cat => `<option value="${cat.id}"${cat.id === c.categoryId ? ' selected' : ''}>${Utils.escH(cat.name)}</option>`).join('');
    }
    const mFbEl = document.getElementById('metrics-fb');
    if (mFbEl) mFbEl.innerHTML = renderMetrics(c.fb);
    const mBfEl = document.getElementById('metrics-bf');
    if (mBfEl) mBfEl.innerHTML = renderMetrics(c.bf);
    const cardBundles = d.bundles.filter(b => b.cardIds.includes(c.id));
    const bndEl = document.getElementById('edit-bundles');
    if (bndEl) {
        bndEl.innerHTML = cardBundles.length ? cardBundles.map(b => `<span class="tag">${Utils.escH(b.name)}</span>`).join('') : '<span style="color:#5a6890;font-size:.8em">No bundles</span>';
    }
}

function renderMetrics(m) {
    m = m || {};
    const fmt = v => (v && v !== DEFAULT_DATE) ? new Date(v).toLocaleDateString() : '–';
    return [
        ['Times Right', m.timesRight || 0],
        ['Times Wrong', m.timesWrong || 0],
        ['Right Since Wrong', m.timesRightSinceWrong || 0],
        ['Last Right', fmt(m.dateLastRight)],
        ['Last Wrong', fmt(m.dateLastWrong)],
    ].map(([l, v]) => `<div class="metric-row"><span class="metric-label">${l}</span><span class="metric-val">${v}</span></div>`).join('');
}

function clearEditForm() {
    ['edit-front', 'edit-back'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const freqEl = document.getElementById('edit-freq');
    if (freqEl) freqEl.value = '0';
    const posEl = document.getElementById('edit-pos');
    if (posEl) posEl.textContent = '–';
    const mFb = document.getElementById('metrics-fb');
    if (mFb) mFb.innerHTML = '';
    const mBf = document.getElementById('metrics-bf');
    if (mBf) mBf.innerHTML = '';
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
    q = (q || '').toLowerCase();
    State.editCards = q ? d.cards.filter(c => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)) : d.cards;
    State.editIdx = 0;
    renderEditCard();
}

function saveCurrentCard() {
    const d = State.deck; if (!d || !State.editCards.length) return;
    const c = State.editCards[State.editIdx];
    const realCard = d.cards.find(x => x.id === c.id);
    if (!realCard) return;
    realCard.front = document.getElementById('edit-front')?.value || '';
    realCard.back = document.getElementById('edit-back')?.value || '';
    realCard.frequency = parseFloat(document.getElementById('edit-freq')?.value) || 0;
    realCard.categoryId = document.getElementById('edit-cat')?.value || '';
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
    document.getElementById('edit-front')?.focus();
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
    const mk = () => ({ timesRight: 0, timesWrong: 0, timesRightSinceWrong: 0, dateLastRight: DEFAULT_DATE, dateLastWrong: DEFAULT_DATE });
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
    const q = (document.getElementById('table-search')?.value || '').toLowerCase();
    let rows = d[type] || [];
    if (q) rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
    const cols = TABLE_COLS[type] || [];
    const headEl = document.getElementById('table-head');
    if (headEl) {
        headEl.innerHTML = '<tr><th>#</th>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>';
    }
    const bodyEl = document.getElementById('table-body');
    if (bodyEl) {
        bodyEl.innerHTML = rows.map((r, i) => `<tr onclick="selectTableRow(this,'${r.id}')" data-id="${r.id}"><td>${i + 1}</td>${cols.map(c => `<td><input ${c === 'id' ? 'readonly style="opacity:0.6;cursor:not-allowed"' : ''} value="${Utils.escAttr(String(r[c] ?? ''))}" onchange="updateTableCell('${type}','${r.id}','${c}',this.value)"></td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 1}" style="text-align:center;color:#3a4060;padding:20px">No data</td></tr>`;
    }
}

function selectTableRow(tr, id) {
    State.selectedTableRow = id;
    [...document.querySelectorAll('#table-body tr')].forEach(r => r.style.background = '');
    if (tr) tr.style.background = 'rgba(255,255,255,0.05)';
}

function updateTableCell(type, id, col, val) {
    if (col === 'id') return;
    const d = State.deck; if (!d) return;
    const r = (d[type] || []).find(x => x.id === id); if (!r) return;
    if (col === 'frequency') {
        r[col] = isNaN(val) || val === '' ? 0 : Number(val);
    } else {
        r[col] = val;
    }
    save();
}

function addTableRow() {
    const type = document.getElementById('table-select')?.value;
    const d = State.deck; if (!d) return;
    if (type === 'cards') d.cards.push(mkCard());
    else if (type === 'categories') d.categories.push({ id: Utils.uid(), name: 'New Category' });
    else if (type === 'criteria') d.criteria.push({ id: Utils.uid(), name: 'New Criteria', logic: '' });
    else if (type === 'bundles') d.bundles.push({ id: Utils.uid(), name: 'New Bundle', cardIds: [] });
    save(); renderTable(type); updateDeckStats();
}

function deleteTableRow() {
    const type = document.getElementById('table-select')?.value;
    const d = State.deck; if (!d || !State.selectedTableRow) return;
    if (!confirm('Delete selected row?')) return;
    d[type] = (d[type] || []).filter(r => r.id !== State.selectedTableRow);
    save(); State.selectedTableRow = null; renderTable(type); updateDeckStats();
}

// =====================================================================
// BUNDLES VIEW
// =====================================================================

function renderBundleView() {
    const d = State.deck; if (!d) return;
    const q = (document.getElementById('bundle-card-search')?.value || '').toLowerCase();
    const cards = q ? d.cards.filter(c => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)) : d.cards;
    const bCardsEl = document.getElementById('bv-cards');
    if (bCardsEl) {
        bCardsEl.innerHTML = cards.map(c => `<div class="li${State.bvSelCards.has(c.id) ? ' sel' : ''}" onclick="toggleBvCard('${c.id}')">${Utils.escH(c.front)}</div>`).join('') || '<div class="empty-msg">No cards</div>';
    }
    const bSel = document.getElementById('bv-bundle-select');
    if (!bSel) return;
    const prevVal = bSel.value;
    bSel.innerHTML = d.bundles.map(b => `<option value="${b.id}">${Utils.escH(b.name)}</option>`).join('') || '<option value="">-- no bundles --</option>';
    if (prevVal && d.bundles.find(b => b.id === prevVal)) bSel.value = prevVal;
    const bid = bSel.value;
    const bundle = d.bundles.find(b => b.id === bid);
    const bndCardsEl = document.getElementById('bv-bundle-cards');
    if (bndCardsEl) {
        if (bundle) {
            const bcards = bundle.cardIds.map(id => d.cards.find(c => c.id === id)).filter(Boolean);
            bndCardsEl.innerHTML = bcards.map(c => `<div class="li${State.bvSelBundleCards.has(c.id) ? ' sel' : ''}" onclick="toggleBvBundleCard('${c.id}')">${Utils.escH(c.front)}</div>`).join('') || '<div class="empty-msg">Bundle is empty</div>';
        } else {
            bndCardsEl.innerHTML = '<div class="empty-msg">Select a bundle</div>';
        }
    }
}

function toggleBvCard(id) {
    if (State.bvSelCards.has(id)) State.bvSelCards.delete(id);
    else State.bvSelCards.add(id);
    renderBundleView();
}

function toggleBvBundleCard(id) {
    if (State.bvSelBundleCards.has(id)) State.bvSelBundleCards.delete(id);
    else State.bvSelBundleCards.add(id);
    renderBundleView();
}

function addToBundle() {
    const d = State.deck; if (!d) return;
    const bid = document.getElementById('bv-bundle-select')?.value;
    const bundle = d.bundles.find(b => b.id === bid); if (!bundle) { alert('Select a bundle first.'); return; }
    State.bvSelCards.forEach(id => { if (!bundle.cardIds.includes(id)) bundle.cardIds.push(id); });
    save(); State.bvSelCards.clear(); renderBundleView();
}

function removeFromBundle() {
    const d = State.deck; if (!d) return;
    const bid = document.getElementById('bv-bundle-select')?.value;
    const bundle = d.bundles.find(b => b.id === bid); if (!bundle) return;
    bundle.cardIds = bundle.cardIds.filter(id => !State.bvSelBundleCards.has(id));
    save(); State.bvSelBundleCards.clear(); renderBundleView();
}

function createBundle() {
    const name = (document.getElementById('new-bundle-name')?.value || '').trim();
    if (!name) { alert('Enter a bundle name.'); return; }
    const d = State.deck; if (!d) return;
    d.bundles.push({ id: Utils.uid(), name, cardIds: [] });
    save();
    const nameInput = document.getElementById('new-bundle-name');
    if (nameInput) nameInput.value = '';
    renderBundleView();
    if (typeof renderSelectView === 'function') renderSelectView();
    updateDeckStats();
}

function deleteBundle() {
    const d = State.deck; if (!d) return;
    const bid = document.getElementById('bv-bundle-select')?.value; if (!bid) { alert('Select a bundle first.'); return; }
    if (!confirm('Delete this bundle?')) return;
    d.bundles = d.bundles.filter(b => b.id !== bid);
    save(); renderBundleView();
    if (typeof renderSelectView === 'function') renderSelectView();
    updateDeckStats();
}

// =====================================================================
// SETTINGS VIEW
// =====================================================================

function renderSettingsView() {
    const d = State.deck; if (!d) return;
    const s = d.settings || {};
    const fsEl = document.getElementById('font-size');
    if (fsEl) fsEl.value = s.fontSize || 22;
    const fsLab = document.getElementById('font-size-label');
    if (fsLab) fsLab.textContent = (s.fontSize || 22) + 'px';
    const hEl = document.getElementById('tmpl-head');
    if (hEl) hEl.value = s.headTmpl || '';
    const fEl = document.getElementById('tmpl-front');
    if (fEl) fEl.value = s.frontTmpl || '';
    const bEl = document.getElementById('tmpl-back');
    if (bEl) bEl.value = s.backTmpl || '';
}

function updateFontSize(v) {
    const el = document.getElementById('font-size-label');
    if (el) el.textContent = v + 'px';
}

function saveSettings() {
    const d = State.deck; if (!d) return;
    if (!d.settings) d.settings = {};
    d.settings.fontSize = parseInt(document.getElementById('font-size')?.value) || 22;
    d.settings.headTmpl = document.getElementById('tmpl-head')?.value || '';
    d.settings.frontTmpl = document.getElementById('tmpl-front')?.value || '';
    d.settings.backTmpl = document.getElementById('tmpl-back')?.value || '';
    save(); alert('Settings saved.');
}

function resetSettings() {
    const d = State.deck; if (!d) return;
    d.settings = { fontSize: 22, headTmpl: '', frontTmpl: '', backTmpl: '' };
    save(); renderSettingsView();
}
