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
    State.selBundleIds.clear();
    State.selCatIds.clear();
    renderAll();
    if (typeof gatherCards === 'function') gatherCards();
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

// =====================================================================
// HELP & TUTORIAL MODAL
// =====================================================================

function renderHelpContent(activeTab) {
    const tabs = [
        { id: 'quickstart', label: '🎓 Quick Start' },
        { id: 'shortcuts', label: '⌨️ Shortcuts' },
        { id: 'spacedrep', label: '🧠 Spaced Repetition' },
        { id: 'textbooks', label: '📚 Textbooks & Import' },
        { id: 'links', label: '🔗 Direct Links' }
    ];

    let body = `<div class="help-nav-tabs">` + tabs.map(t => `<button class="help-tab-btn${t.id === activeTab ? ' active' : ''}" onclick="switchHelpTab('${t.id}')">${t.label}</button>`).join('') + `</div>`;
    
    if (activeTab === 'quickstart') {
        body += `
            <div class="col" style="gap: 10px;">
                <div class="help-card">
                    <h4>1. Select Your Lesson</h4>
                    <p>Choose your chapter from the <b>Active Deck</b> dropdown at the top (e.g. <i>Athenaze Chapter 1</i>). Under <b>Bundles</b>, optionally click <b>Chapter 1α</b> or <b>1β</b> to focus on a specific reading.</p>
                </div>
                <div class="help-card">
                    <h4>2. Start Session</h4>
                    <p>Click <b style="color:var(--secondary)">Start Session</b>. Cards are studied in manageable rounds of <b>10 cards</b> at a time. You can change this batch size anytime.</p>
                </div>
                <div class="help-card">
                    <h4>3. Flip & Judge Honestly</h4>
                    <p>Press <kbd>Space</kbd> or <kbd>Enter</kbd> to reveal the answer. If you remembered it, press <kbd>Y</kbd> (Correct). If you missed it or hesitated, press <kbd>N</kbd> (Incorrect).</p>
                </div>
                <div class="help-card">
                    <h4>4. Cognitive Mastery</h4>
                    <p>Flash! Pro automatically re-queues cards you miss into the next batch so you correct mistakes right away. As you get them right, it spaces them out to lock them into long-term memory!</p>
                </div>
            </div>
        `;
    } else if (activeTab === 'shortcuts') {
        body += `
            <div class="col" style="gap: 10px;">
                <div class="help-card">
                    <h4>Study Screen (Drill Mode)</h4>
                    <ul style="margin: 8px 0 0 18px; padding: 0;">
                        <li style="margin-bottom: 6px;"><kbd>Space</kbd> or <kbd>Enter</kbd> or <kbd>→</kbd> : <b>Flip Card</b> to reveal English/Greek.</li>
                        <li style="margin-bottom: 6px;"><kbd>Y</kbd> : Mark <b>CORRECT</b> (progresses in spaced repetition).</li>
                        <li style="margin-bottom: 6px;"><kbd>N</kbd> : Mark <b>INCORRECT</b> (scheduled for next round review).</li>
                        <li style="margin-bottom: 6px;"><kbd>←</kbd> (Left Arrow) : <b>Undo</b> last judgment (lossless rollback).</li>
                        <li style="margin-bottom: 6px;"><kbd>Enter</kbd> or <kbd>Space</kbd> on Round Complete : <b>Start Next Round</b> immediately.</li>
                    </ul>
                </div>
                <div class="help-card">
                    <h4>Hands on the Keyboard</h4>
                    <p>You never need to touch the mouse during a study session. Use your thumb on <kbd>Space</kbd> to flip, and fingers on <kbd>Y</kbd>/<kbd>N</kbd> to judge!</p>
                </div>
            </div>
        `;
    } else if (activeTab === 'spacedrep') {
        body += `
            <div class="col" style="gap: 10px;">
                <div class="help-card">
                    <h4>Cognitive Spaced Repetition Formula</h4>
                    <p><code>(NOW - LastRightTime) > (LastRightTime - LastWrongTime)</code></p>
                    <p style="margin-top: 6px;">Flash! Pro doesn't just shuffle random cards. It schedules reviews based on your personal memory:</p>
                </div>
                <div class="help-card">
                    <h4>🔴 Missed Cards Come First</h4>
                    <p>Any card marked incorrect has an urgent priority score and resurfaces in the very next 10-card round.</p>
                </div>
                <div class="help-card">
                    <h4>🟡 New Cards Queue Up</h4>
                    <p>Unstudied cards appear in textbook order so you learn new words as your readings introduce them.</p>
                </div>
                <div class="help-card">
                    <h4>🟢 Mastered Cards Space Out</h4>
                    <p>Every time you get a card right, the review interval expands (1 day ➔ 2 days ➔ 4 days ➔ weeks), preventing over-studying what you already know.</p>
                </div>
            </div>
        `;
    } else if (activeTab === 'textbooks') {
        body += `
            <div class="col" style="gap: 10px;">
                <div class="help-card">
                    <h4>All 16 Athenaze Book I Chapters Included</h4>
                    <p>Use the <b>Active Deck</b> dropdown at the top to switch between Chapters 1 through 16, or choose the <b>Master Deck</b> to study across the entire textbook. If chapters are missing from an older session, go to <b>Settings</b> and click <b>Restore Athenaze Decks</b>.</p>
                </div>
                <div class="help-card">
                    <h4>Importing Other Textbooks (Latin, Hebrew, French, etc.)</h4>
                    <p>You can add vocabulary lists from any textbook in 3 quick steps:</p>
                    <ul style="margin: 8px 0 0 18px; padding: 0;">
                        <li style="margin-bottom: 6px;">1. Click <b style="color:var(--secondary)">+ New</b> at the top to create a deck (e.g. <i>Wheelock's Latin</i>).</li>
                        <li style="margin-bottom: 6px;">2. Switch to the <b>I/O</b> tab in the top navigation bar.</li>
                        <li style="margin-bottom: 6px;">3. Paste tab-separated or comma-separated cards (from Excel, Google Sheets, or Quizlet) into <b>Raw Ingest Buffer</b>, click <b>Validate & Map</b>, then <b>Import</b>!</li>
                    </ul>
                </div>
            </div>
        `;
    } else if (activeTab === 'links') {
        body += `
            <div class="col" style="gap: 10px;">
                <div class="help-card">
                    <h4>Direct Bookmarkable Links</h4>
                    <p>Students can bookmark direct URLs to open any chapter or lesson immediately into study mode:</p>
                    <ul style="margin: 8px 0 0 18px; padding: 0;">
                        <li style="margin-bottom: 6px;">Chapter 1α: <code>?chapter=1a&drill=1</code></li>
                        <li style="margin-bottom: 6px;">Chapter 1β: <code>?chapter=1b&drill=1</code></li>
                        <li style="margin-bottom: 6px;">Chapter 2α: <code>?chapter=2a&drill=1</code></li>
                        <li style="margin-bottom: 6px;">Chapter 2β: <code>?chapter=2b&drill=1</code></li>
                        <li style="margin-bottom: 6px;">Custom batch size (15 cards): <code>?chapter=1a&limit=15&drill=1</code></li>
                    </ul>
                </div>
            </div>
        `;
    }
    return body;
}

function switchHelpTab(newTab) {
    const bodyEl = document.getElementById('modal-body');
    if (bodyEl) bodyEl.innerHTML = renderHelpContent(newTab);
}

function openHelpModal(tab = 'quickstart') {
    openModal('📖 Flash! Pro Quick Guide', renderHelpContent(tab), () => {
        localStorage.setItem('flashpro_seen_guide', '1');
        closeModal();
    }, 'Start Studying!', 'Close');
}

function restoreAthenazeDecks() {
    if (typeof createAllAthenazeDecks !== 'function') return;
    openModal(
        'Restore Athenaze Decks',
        '<p>This will reload all 16 Athenaze Book I chapter decks and the Master Deck (596 cards total). Any identical cards you already studied will preserve their study progress.</p>',
        () => {
            const canonical = createAllAthenazeDecks();
            const existingById = new Map();
            for (const d of State.decks) {
                for (const c of d.cards) {
                    existingById.set(c.id, c);
                }
            }
            // Preserve metrics for cards that user already studied
            for (const d of canonical) {
                for (let i = 0; i < d.cards.length; i++) {
                    const c = d.cards[i];
                    if (existingById.has(c.id)) {
                        const old = existingById.get(c.id);
                        c.fb = { ...old.fb };
                        c.bf = { ...old.bf };
                    }
                }
            }
            // Remove any old athenaze decks and replace with canonical
            const nonAthenaze = State.decks.filter(d => !d.src || d.src.kind !== 'athenaze');
            State.decks = [...canonical, ...nonAthenaze];
            State.curDeckId = canonical[0].id;
            save();
            renderAll();
            if (typeof gatherCards === 'function') gatherCards();
            alert('Successfully loaded all 16 Athenaze chapters and Master Deck!');
        },
        'Restore Decks',
        'Cancel'
    );
}
