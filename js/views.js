// =====================================================================
// THEME (light / dark / system)
// =====================================================================

const THEMES = ['dark', 'light', 'classic', 'system'];
const THEME_ICONS = { dark: 'moon', light: 'sun', classic: 'tv', system: 'monitor' };

function getTheme() {
    try { return localStorage.getItem('flashpro_theme') || 'dark'; } catch (_) { return 'dark'; }
}

function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('flashpro_theme', t); } catch (_) {}
    updateThemeButton();
}

function cycleTheme() {
    const next = THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length];
    applyTheme(next);
}

function updateThemeButton() {
    const t = getTheme();
    const btn = document.getElementById('theme-toggle');
    const icon = document.getElementById('theme-icon');
    if (btn) {
        btn.title = `Theme: ${t} (click to change)`;
        const label = btn.querySelector ? btn.querySelector('.theme-label') : null;
        if (label) label.textContent = t;
    }
    if (icon && icon.setAttribute) {
        icon.setAttribute('data-lucide', THEME_ICONS[t] || 'moon');
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }
}

// Live-follow OS preference while in system mode
if (typeof window.matchMedia === 'function') {
    try {
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
            if (getTheme() === 'system') updateThemeButton();
        });
    } catch (_) {}
}

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
    updateThemeButton();
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
        sel.innerHTML = State.decks.map(d => `<option value="${Utils.escAttr(d.id)}"${d.id === State.curDeckId ? ' selected' : ''}>${Utils.escH(d.name)}</option>`).join('');
    }
}

function updateDeckStats() {
    const d = State.deck;
    if (!d) return;
    const statsEl = document.getElementById('deck-stats');
    if (statsEl) {
        if (!d.cards) { statsEl.textContent = `${d.name} — loading…`; return; } // stub deck
        statsEl.textContent = `${d.cards.length} cards | ${d.bundles.length} bundles | ${d.categories.length} categories`;
    }
}

function switchDeck(id) {
    State.curDeckId = id;
    Store.setCur(id);
    State.gatheredCards = [];
    State.selBundleIds.clear();
    State.selCatIds.clear();
    State.userSelectedSort = false;
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
    if (!d.cards) return; // stub deck: body still loading
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
        catSel.innerHTML = d.categories.map(cat => `<option value="${Utils.escAttr(cat.id)}"${cat.id === c.categoryId ? ' selected' : ''}>${Utils.escH(cat.name)}</option>`).join('');
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
    const dlr = m.dateLastRight || DEFAULT_DATE;
    const dlw = m.dateLastWrong || DEFAULT_DATE;
    // Days right since wrong: days elapsed since last right, counted only while
    // the right answer postdates the last wrong (matches the criteria engine's DaysRightSinceWrong)
    let drsw = 0;
    if (dlr !== DEFAULT_DATE && (dlw === DEFAULT_DATE || dlr > dlw)) {
        drsw = Math.floor((Utils.now() - dlr) / Utils.dayMs);
    }
    return [
        ['Times Right', m.timesRight || 0],
        ['Times Wrong', m.timesWrong || 0],
        ['Right Since Wrong', m.timesRightSinceWrong || 0],
        ['Days Right Since Wrong', drsw],
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
        bodyEl.innerHTML = rows.map((r, i) => `<tr onclick="selectTableRow(this,'${Utils.escJs(r.id)}')" data-id="${Utils.escAttr(r.id)}"><td>${i + 1}</td>${cols.map(c => `<td><input ${c === 'id' ? 'readonly style="opacity:0.6;cursor:not-allowed"' : ''} value="${Utils.escAttr(String(r[c] ?? ''))}" onchange="updateTableCell('${Utils.escJs(type)}','${Utils.escJs(r.id)}','${c}',this.value)"></td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 1}" style="text-align:center;color:#3a4060;padding:20px">No data</td></tr>`;
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
    const d = State.deck; if (!d || !d.cards || !d.bundles) return; // stub deck guard
    const q = (document.getElementById('bundle-card-search')?.value || '').toLowerCase();
    const cards = q ? d.cards.filter(c => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)) : d.cards;
    const bCardsEl = document.getElementById('bv-cards');
    if (bCardsEl) {
        bCardsEl.innerHTML = cards.map(c => `<div class="li${State.bvSelCards.has(c.id) ? ' sel' : ''}" onclick="toggleBvCard('${Utils.escJs(c.id)}')">${Utils.escH(c.front)}</div>`).join('') || '<div class="empty-msg">No cards</div>';
    }
    const bSel = document.getElementById('bv-bundle-select');
    if (!bSel) return;
    const prevVal = bSel.value;
    bSel.innerHTML = d.bundles.map(b => `<option value="${Utils.escAttr(b.id)}">${Utils.escH(b.name)}</option>`).join('') || '<option value="">-- no bundles --</option>';
    if (prevVal && d.bundles.find(b => b.id === prevVal)) bSel.value = prevVal;
    const bid = bSel.value;
    const bundle = d.bundles.find(b => b.id === bid);
    const bndCardsEl = document.getElementById('bv-bundle-cards');
    if (bndCardsEl) {
        if (bundle) {
            const bcards = bundle.cardIds.map(id => d.cards.find(c => c.id === id)).filter(Boolean);
            bndCardsEl.innerHTML = bcards.map(c => `<div class="li${State.bvSelBundleCards.has(c.id) ? ' sel' : ''}" onclick="toggleBvBundleCard('${Utils.escJs(c.id)}')">${Utils.escH(c.front)}</div>`).join('') || '<div class="empty-msg">Bundle is empty</div>';
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
        { id: 'library', label: '🏛️ Curriculum Library' },
        { id: 'shortcuts', label: '⌨️ Shortcuts' },
        { id: 'spacedrep', label: '🧠 Spaced Repetition' },
        { id: 'textbooks', label: '📚 Textbooks & Import' },
        { id: 'links', label: '🔗 Direct Links' }
    ];

    let body = `<div class="help-nav-tabs">` + tabs.map(t => `<button class="help-tab-btn${t.id === activeTab ? ' active' : ''}" onclick="switchHelpTab('${Utils.escJs(t.id)}')">${t.label}</button>`).join('') + `</div>`;
    
    if (activeTab === 'quickstart') {
        body += `
            <div class="col" style="gap: 10px;">
                <div class="help-card">
                    <h4>1. Select Your Lesson or Load from Library</h4>
                    <p>Choose your chapter from the <b>Active Deck</b> dropdown at the top, or click the <b style="color:var(--secondary)">📖 Library</b> button to browse and load from <b>24 preloaded textbooks</b> (over 71,000 cards in Greek, Hebrew, Latin, French, Spanish, German, and Russian!). Under <b>Bundles</b>, click any chapter or section to focus your session.</p>
                </div>
                <div class="help-card">
                    <h4>2. Start Session</h4>
                    <p>Click <b style="color:var(--secondary)">Start Session</b>. Cards are studied in manageable rounds of <b>10 cards</b> at a time. You can change this batch size anytime.</p>
                </div>
                <div class="help-card">
                    <h4>3. Flip & Judge Honestly</h4>
                    <p>Tap the card or press <kbd>Space</kbd> / <kbd>Enter</kbd> to reveal the answer. If you remembered it, tap or press <kbd>Y</kbd> (Correct). If you missed it or hesitated, tap or press <kbd>N</kbd> (Incorrect).</p>
                </div>
                <div class="help-card">
                    <h4>4. Cognitive Mastery</h4>
                    <p>Flash! Pro automatically re-queues cards you miss into the next batch so you correct mistakes right away. As you get them right, it spaces them out to lock them into long-term memory!</p>
                </div>
            </div>
        `;
    } else if (activeTab === 'library') {
        body += `
            <div class="col" style="gap: 10px;">
                <div class="help-card">
                    <h4>🏛️ 24 Built-In Curriculum Textbooks (71,607 Cards)</h4>
                    <p>Click the <b>Library</b> button in the deck bar at any time to access complete preloaded flashcard decks for major ancient and modern language curricula:</p>
                    <ul style="margin: 8px 0 0 18px; padding: 0;">
                        <li style="margin-bottom: 6px;"><b>Ancient & Biblical Greek:</b> Athenaze Complete MDB (580 cards), Athenaze Extended Lexicon (1,220 cards), Greek New Testament (6,428 cards), Mounce <i>Basics of Biblical Greek</i> (1,152 cards), Dobson <i>Learn New Testament Greek</i>, and JACT <i>Reading Greek</i>.</li>
                        <li style="margin-bottom: 6px;"><b>Biblical Hebrew & Aramaic:</b> Hebrew Old Testament (12,873 cards), Kelley <i>Biblical Hebrew</i>, Pratico-Van Pelt <i>Basics of Biblical Hebrew</i>, Dobson <i>Learn Biblical Hebrew</i>, and Biblical Aramaic.</li>
                        <li style="margin-bottom: 6px;"><b>Latin & Modern Languages:</b> Wheelock's Latin (4,869 cards), Oxford Latin Course, Collins French, German, Spanish, and Russian lexicons.</li>
                    </ul>
                </div>
                <div class="help-card">
                    <h4>Instant Loading & Offline JSON Downloads</h4>
                    <p>In the Library modal, you can filter by language or search by textbook author. Click <b>Load Into App</b> to immediately activate the deck with all bundled chapters, or click <b>JSON</b> to download a standalone offline backup.</p>
                    <div style="margin-top: 10px;">
                        <button class="btn btn-sm btn-primary" onclick="closeModal(); openCurriculumLibraryModal();">
                            <i data-lucide="book-open"></i> Open Curriculum Library Now
                        </button>
                    </div>
                </div>
            </div>
        `;
    } else if (activeTab === 'shortcuts') {
        body += `
            <div class="col" style="gap: 10px;">
                <div class="help-card">
                    <h4>Study Screen (Drill Mode)</h4>
                    <ul style="margin: 8px 0 0 18px; padding: 0;">
                        <li style="margin-bottom: 6px;"><kbd>Space</kbd> or <kbd>Enter</kbd> or <kbd>→</kbd> : <b>Flip Card</b> to reveal English/target language.</li>
                        <li style="margin-bottom: 6px;"><b>Direct Tap</b> on Card Face : Also flips the card immediately (great for phones and tablets!).</li>
                        <li style="margin-bottom: 6px;"><kbd>Y</kbd> : Mark <b>CORRECT</b> (progresses in spaced repetition).</li>
                        <li style="margin-bottom: 6px;"><kbd>N</kbd> : Mark <b>INCORRECT</b> (scheduled for next round review).</li>
                        <li style="margin-bottom: 6px;"><kbd>←</kbd> (Left Arrow) : <b>Undo</b> last judgment (lossless rollback).</li>
                        <li style="margin-bottom: 6px;"><kbd>Enter</kbd> or <kbd>Space</kbd> on Round Complete : <b>Start Next Round</b> immediately.</li>
                    </ul>
                </div>
                <div class="help-card">
                    <h4>Hands on the Keyboard or Thumb on the Phone</h4>
                    <p>On desktop, keep your hands on the keyboard (<kbd>Space</kbd> to flip, <kbd>Y</kbd>/<kbd>N</kbd> to judge). On mobile phones, tap the card face to flip, then use large thumb buttons to mark your score!</p>
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
                    <h4>Preloaded Curriculum Library (24 Textbooks)</h4>
                    <p>Click the <b>Library</b> button in the deck bar to load any of the 24 canonical textbook databases (71,607 cards total) covering Athenaze, Mounce, Wheelock, Kelley, Dobson, JACT, and more. You can also switch between Chapters 1 through 16 or the authentic 580-card MDB database directly from the <b>Active Deck</b> dropdown.</p>
                </div>
                <div class="help-card">
                    <h4>Importing Custom Textbooks & Wordlists</h4>
                    <p>You can add vocabulary lists from any other textbook or spreadsheet in 3 quick steps:</p>
                    <ul style="margin: 8px 0 0 18px; padding: 0;">
                        <li style="margin-bottom: 6px;">1. Click <b style="color:var(--secondary)">+ New</b> at the top to create a deck.</li>
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
        '<p>This will reload all 16 Athenaze Book I chapter decks, the Master Deck, and the Authentic MDB database (580 cards). Any identical cards you already studied will preserve their study progress.</p>',
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
            const nonAthenaze = State.decks.filter(d => !d.src || !String(d.src.kind).startsWith('athenaze'));
            State.decks = [...canonical, ...nonAthenaze];
            State.curDeckId = canonical[0].id;
            save();
            renderAll();
            if (typeof gatherCards === 'function') gatherCards();
            alert('Successfully loaded all 16 Athenaze chapters, Master Deck, and Authentic MDB Database!');
        },
        'Restore Decks',
        'Cancel'
    );
}

function loadAuthenticMdbDeck() {
    let d = State.decks.find(x => x.id === 'deck_athenaze_mdb_canonical' || (x.src && x.src.kind === 'athenaze_mdb'));
    if (!d) {
        d = typeof buildAthenazeMdbDeck === 'function' ? buildAthenazeMdbDeck() : null;
        if (d) {
            State.decks.push(d);
            save();
        }
    }
    if (d) {
        if (typeof switchDeck === 'function') switchDeck(d.id);
        else {
            State.curDeckId = d.id;
            Store.setCur(d.id);
            renderAll();
        }
        alert('Loaded Authentic Athenaze MDB database (580 cards, 48 bundles, authentic study metrics).');
    } else {
        alert('MDB dataset not available.');
    }
}

function loadExtendedLexiconDeck() {
    let d = State.decks.find(x => x.name && x.name.includes('Extended Lexicon'));
    if (!d) {
        d = typeof buildAthenazeExtendedDeck === 'function' ? buildAthenazeExtendedDeck() : null;
        if (d) {
            State.decks.push(d);
            save();
        }
    }
    if (d) {
        if (typeof switchDeck === 'function') switchDeck(d.id);
        else {
            State.curDeckId = d.id;
            Store.setCur(d.id);
            renderAll();
        }
        alert('Loaded Athenaze Extended Lexicon (1,220 cards).');
    } else {
        alert('Extended Lexicon dataset not available.');
    }
}

function downloadMdbDeckJson() {
    if (typeof ATHENAZE_MDB_DECK !== 'undefined' && ATHENAZE_MDB_DECK) {
        Utils.dlBlob(new Blob([JSON.stringify(ATHENAZE_MDB_DECK, null, 2)], { type: 'application/json' }), 'Athenaze_MDB_Complete_580.json');
    } else {
        alert('MDB dataset not loaded.');
    }
}

function downloadExtendedDeckJson() {
    if (typeof ATHENAZE_EXTENDED_DECK !== 'undefined' && ATHENAZE_EXTENDED_DECK) {
        Utils.dlBlob(new Blob([JSON.stringify(ATHENAZE_EXTENDED_DECK, null, 2)], { type: 'application/json' }), 'Athenaze_Extended_1220.json');
    } else {
        alert('Extended dataset not loaded.');
    }
}

// =====================================================================
// CURRICULUM LIBRARY & MDB DECK BROWSER
// =====================================================================

let _catalogFilterLang = 'all';
let _catalogSearchQuery = '';

function renderCurriculumLibraryContent() {
    const catalog = window.FLASH_PRO_CATALOG || [];
    if (!catalog.length) {
        return `<div style="text-align:center; padding:30px; color:var(--text-secondary);">No curriculum catalog loaded.</div>`;
    }

    const languages = ['all', ...new Set(catalog.map(d => d.language))];
    const q = (_catalogSearchQuery || '').toLowerCase();

    const filtered = catalog.filter(d => {
        const matchLang = _catalogFilterLang === 'all' || d.language === _catalogFilterLang;
        const matchQ = !q || d.title.toLowerCase().includes(q) || d.category.toLowerCase().includes(q) || d.language.toLowerCase().includes(q);
        return matchLang && matchQ;
    });

    const totalCardsCount = catalog.reduce((acc, d) => acc + (d.totalCards || 0), 0);

    return `
        <div class="col" style="gap: 12px;">
            <div style="font-size: 0.88em; color: var(--text-secondary);">
                Browse, load, and download <b>${catalog.length} textbooks and language decks</b> (${totalCardsCount.toLocaleString()} cards) converted with Unicode polytonic accents and vowel points directly from the original Microsoft Access databases.
            </div>
            <div class="catalog-filter-bar">
                <input type="text" class="catalog-search-input" id="catalog-search" placeholder="Search textbooks (e.g. Mounce, Wheelock, Kelley, Dobson, French...)" value="${Utils.escAttr(_catalogSearchQuery)}" oninput="onCatalogSearch(this.value)">
                <div class="row" style="gap:6px; flex-wrap:wrap;">
                    ${languages.map(lang => `
                        <button class="btn btn-sm ${lang === _catalogFilterLang ? 'btn-primary' : 'btn-secondary'}" onclick="filterCatalogByLang('${Utils.escJs(lang)}')">
                            ${lang === 'all' ? '🌐 All Languages' : lang}
                        </button>
                    `).join('')}
                </div>
            </div>
            <div class="catalog-grid" id="catalog-card-grid">
                ${filtered.map(d => {
                    const isLoaded = State.decks.some(x => x.id === d.id || (x.src && x.src.kind === `mdb_${d.id.replace('deck_', '')}`));
                    return `
                        <div class="catalog-card">
                            <div>
                                <div class="catalog-card-header">
                                    <div class="catalog-card-title">${Utils.escH(d.title)}</div>
                                    <span class="tag">${Utils.escH(d.language)}</span>
                                </div>
                                <div class="catalog-card-meta">
                                    <span>📁 ${Utils.escH(d.category)}</span>
                                    <span>🎴 <b>${d.totalCards.toLocaleString()}</b> cards</span>
                                    <span>📦 <b>${d.totalBundles}</b> bundles</span>
                                </div>
                                ${d.sampleFront ? `
                                    <div class="catalog-card-sample">
                                        <b>Sample:</b> ${Utils.escH(d.sampleFront)} ➔ <i>${Utils.escH(d.sampleBack)}</i>
                                    </div>
                                ` : ''}
                            </div>
                            <div class="catalog-card-actions">
                                <button class="btn btn-sm btn-secondary" onclick="downloadCatalogDeck('${Utils.escJs(d.id)}')" title="Download standalone JSON deck">
                                    <i data-lucide="download"></i> JSON
                                </button>
                                <button class="btn btn-sm ${isLoaded ? 'btn-secondary' : 'btn-primary'}" onclick="loadCatalogDeck('${Utils.escJs(d.id)}')">
                                    <i data-lucide="${isLoaded ? 'check' : 'plus-circle'}"></i> ${isLoaded ? 'Switch To Deck' : 'Load Into App'}
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function openCurriculumLibraryModal() {
    openModal('🏛️ Curriculum & Textbook Library', renderCurriculumLibraryContent(), null, null, 'Close', 'modal-wide');
}

function onCatalogSearch(query) {
    _catalogSearchQuery = query;
    const bodyEl = document.getElementById('modal-body');
    if (bodyEl) {
        bodyEl.innerHTML = renderCurriculumLibraryContent();
        const input = document.getElementById('catalog-search');
        if (input) {
            if (typeof input.focus === 'function') input.focus();
            if (typeof input.setSelectionRange === 'function') {
                input.setSelectionRange(input.value.length, input.value.length);
            }
        }
    }
}

function filterCatalogByLang(lang) {
    _catalogFilterLang = lang;
    const bodyEl = document.getElementById('modal-body');
    if (bodyEl) bodyEl.innerHTML = renderCurriculumLibraryContent();
}

async function fetchDeckData(deckItem) {
    // If deck is Athenaze MDB or Extended, we have them directly in global memory
    if (deckItem.id === 'deck_athenaze_mdb_canonical' && typeof ATHENAZE_MDB_DECK !== 'undefined') {
        return JSON.parse(JSON.stringify(ATHENAZE_MDB_DECK));
    }
    if (deckItem.id === 'deck_athenaze_extended_lexicon' && typeof ATHENAZE_EXTENDED_DECK !== 'undefined') {
        return JSON.parse(JSON.stringify(ATHENAZE_EXTENDED_DECK));
    }
    const resp = await fetch(deckItem.file);
    if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
    return await resp.json();
}

async function loadCatalogDeck(deckId) {
    const catalog = window.FLASH_PRO_CATALOG || [];
    const item = catalog.find(d => d.id === deckId);
    if (!item) return;

    // Check if already loaded
    let existing = State.decks.find(x => x.id === deckId || (x.src && x.src.kind === `mdb_${deckId.replace('deck_', '')}`));
    if (existing) {
        switchDeck(existing.id);
        closeModal();
        return;
    }

    try {
        const deckData = await fetchDeckData(item);
        if (!deckData) throw new Error('Deck data empty');

        // Convert cards into State format if necessary
        const categories = (deckData.categories || []).map(c => typeof c === 'string' ? { id: Utils.uid(), name: c } : c);
        const bundles = (deckData.bundles || []).map(b => ({
            id: b.id || Utils.uid(),
            name: b.name || 'Bundle',
            cardIds: b.cardIds || b.items || []
        }));
        const criteria = (deckData.criteria || []).map(cr => ({
            id: cr.id || Utils.uid(),
            name: cr.name || 'Criteria',
            logic: cr.logic || ''
        }));

        const cards = (deckData.cards || []).map((c, i) => {
            const fb = c.fb || { timesRight: c.timesRight || 0, timesWrong: c.timesWrong || 0, timesRightSinceWrong: c.timesRightSinceWrong || 0, dateLastRight: DEFAULT_DATE, dateLastWrong: DEFAULT_DATE };
            const bf = c.bf || { timesRight: c.backTimesRight || 0, timesWrong: c.backTimesWrong || 0, timesRightSinceWrong: c.backTimesRightSinceWrong || 0, dateLastRight: DEFAULT_DATE, dateLastWrong: DEFAULT_DATE };
            return {
                id: c.id ? String(c.id) : `${deckId}_${i + 1}`,
                num: c.num || c.number || (i + 1),
                front: c.front || '',
                back: c.back || '',
                categoryId: c.categoryId || categories[0]?.id || '',
                category: c.category || categories[0]?.name || '',
                frequency: c.frequency || 1,
                editedDate: c.editedDate || Date.now(),
                fb,
                bf
            };
        });

        const newDeck = {
            id: deckData.id || deckId,
            name: deckData.name || item.title,
            createdDate: deckData.createdDate || Date.now(),
            src: deckData.src || { kind: `mdb_${deckId.replace('deck_', '')}`, cardsCount: cards.length },
            language: deckData.language || item.language,
            settings: deckData.settings || { fontSize: 24, maximumSelected: 10, headTmpl: '', frontTmpl: '', backTmpl: '' },
            categories,
            bundles,
            criteria,
            cards
        };
        newDeck.catalogFile = item.file;   // read-only source: rehydrated from repo on load
        State.decks.push(newDeck);
        saveCatalogStub(newDeck);
        switchDeck(newDeck.id);
        closeModal();
    } catch (err) {
        console.error("Failed to load deck from catalog:", err);
        alert(`Could not load deck: ${err.message}. If running via local file:///, download the JSON and import via the I/O tab.`);
    }
}

async function downloadCatalogDeck(deckId) {
    const catalog = window.FLASH_PRO_CATALOG || [];
    const item = catalog.find(d => d.id === deckId);
    if (!item) return;

    try {
        const data = await fetchDeckData(item);
        const fileName = (item.title.replace(/[^a-zA-Z0-9_-]/g, '_') + '.json');
        Utils.dlBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), fileName);
    } catch (err) {
        console.error("Failed to download catalog deck:", err);
        alert(`Download error: ${err.message}`);
    }
}

