        // =====================================================================
        // DATA MODEL
        // =====================================================================
        const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        const now = () => Date.now();
        const dayMs = 86400000;

        function mkCard(front = '', back = '', categoryId = '', frequency = 0) {
            const mk = () => ({ timesRight: 0, timesWrong: 0, timesRightSinceWrong: 0, dateLastRight: null, dateLastWrong: null });
            return { id: uid(), front, back, categoryId, frequency, editedDate: now(), fb: mk(), bf: mk() };
        }
        function mkDeck(name = 'New Deck') {
            return {
                id: uid(), name,
                cards: [],
                categories: [{ id: uid(), name: 'General' }],
                bundles: [],
                criteria: [
                    { id: uid(), name: 'All Cards', logic: '' },
                    { id: uid(), name: 'Never Studied', logic: 'TimesRight == 0 && TimesWrong == 0' },
                    { id: uid(), name: 'Needs Review (< 3 right)', logic: 'TimesRightSinceWrong < 3' },
                    { id: uid(), name: 'Elapsed Time', logic: 'DateLastRight > 0 && (Now - DateLastRight) > (DateLastRight - (DateLastWrong||DateLastRight))' },
                    { id: uid(), name: 'High Frequency', logic: 'Frequency >= 10' },
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

        // =====================================================================
        // APP STATE
        // =====================================================================
        let decks = [];
        let curDeckId = '';
        let gatheredCards = [];
        let drillSession = null;
        let editIdx = 0;
        let editCards = [];
        let selectedTableRow = null;
        let modalCallback = null;

        function deck() { return decks.find(d => d.id === curDeckId) || null }
        function save() { Store.save(decks) }
        function card(id) { return deck()?.cards.find(c => c.id === id) }
        function cat(id) { return deck()?.categories.find(c => c.id === id) }

        // =====================================================================
        // INIT
        // =====================================================================
        function init() {
            decks = Store.load();
            if (!decks.length) {
                const d = mkDeck('My Flashcards');
                // Add sample cards
                const cats = d.categories;
                ['amare (to love)', 'scribere (to write)', 'legere (to read)', 'venire (to come)', 'videre (to see)'].forEach((b, i) => {
                    d.cards.push(mkCard(['amor', 'scriptor', 'lector', 'ventor', 'visor'][i], b, cats[0].id, i * 5 + 5));
                });
                decks.push(d);
                save();
            }
            curDeckId = Store.currentId();
            if (!deck()) curDeckId = decks[0].id;
            Store.setCur(curDeckId);
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
            sel.innerHTML = decks.map(d => `<option value="${d.id}"${d.id === curDeckId ? ' selected' : ''}>${escH(d.name)}</option>`).join('');
        }
        function updateDeckStats() {
            const d = deck();
            if (!d) return;
            document.getElementById('deck-stats').textContent = `${d.cards.length} cards | ${d.bundles.length} bundles | ${d.categories.length} categories`;
        }
        function switchDeck(id) { curDeckId = id; Store.setCur(id); gatheredCards = []; renderSelectView(); renderEditView(); renderBundleView(); renderCriteriaView(); renderSettingsView(); updateDeckStats(); }
        function newDeck() {
            openModal('New Deck', '<input type="text" id="m-name" placeholder="Deck name…" style="width:100%">', () => {
                const name = document.getElementById('m-name').value.trim();
                if (!name) return;
                const d = mkDeck(name);
                decks.push(d); save();
                curDeckId = d.id; Store.setCur(d.id);
                renderDeckBar(); renderSelectView(); renderEditView(); renderBundleView(); renderCriteriaView(); renderSettingsView(); updateDeckStats();
            });
            setTimeout(() => document.getElementById('m-name')?.focus(), 50);
        }
        function deleteDeck() {
            if (decks.length <= 1) { alert('Cannot delete the last deck.'); return; }
            if (!confirm(`Delete deck "${deck().name}"? This cannot be undone.`)) return;
            decks = decks.filter(d => d.id !== curDeckId); save();
            curDeckId = decks[0].id; Store.setCur(curDeckId);
            renderDeckBar(); renderSelectView(); renderEditView(); renderBundleView(); renderCriteriaView(); renderSettingsView(); updateDeckStats();
        }
        function exportDeck() {
            const d = deck();
            const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
            dlBlob(blob, d.name.replace(/\s+/g, '_') + '.flashpro.json');
        }
        function importDeckFile() { document.getElementById('load-deck-input').click(); }
        function handleLoadDeck(e) {
            const f = e.target.files[0]; if (!f) return;
            const r = new FileReader();
            r.onload = ev => {
                try {
                    const d = JSON.parse(ev.target.result);
                    if (!d.cards || !d.id) throw new Error('Invalid deck file');
                    // give new ID to avoid collision
                    d.id = uid();
                    d.name = (d.name || 'Imported Deck') + ' (imported)';
                    decks.push(d); save(); curDeckId = d.id; Store.setCur(d.id);
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
            if (!logic || !logic.trim()) return true; // blank = all cards
            const m = card_obj[dir];
            const nowMs = now();
            let dlr = m.dateLastRight || 0;
            let dlw = m.dateLastWrong || 0;
            let drsw = 0;
            if (dlr > 0 && (dlw === 0 || dlr > dlw)) { drsw = (nowMs - dlr) / dayMs; }
            const ctx = {
                Now: nowMs, Frequency: card_obj.frequency || 0,
                TimesRight: m.timesRight || 0, TimesWrong: m.timesWrong || 0,
                TimesRightSinceWrong: m.timesRightSinceWrong || 0,
                DateLastRight: dlr, DateLastWrong: dlw, DaysRightSinceWrong: drsw,
            };
            let expr = logic;
            // replace = with == (but not >= <= !=)
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
        let selCriteriaId = '';
        let selBundleIds = new Set();
        let selCatIds = new Set();

        function renderSelectView() {
            const d = deck(); if (!d) return;
            // criteria list
            const cl = document.getElementById('criteria-list');
            cl.innerHTML = d.criteria.map(c => `<div class="li${selCriteriaId === c.id ? ' sel' : ''}" onclick="selectCriteria('${c.id}')">${escH(c.name)}</div>`).join('') || '<div class="empty-msg">No criteria</div>';
            // bundles
            const bl = document.getElementById('bundle-list');
            bl.innerHTML = d.bundles.map(b => `<div class="li${selBundleIds.has(b.id) ? ' sel2' : ''}" onclick="toggleBundle('${b.id}')">${escH(b.name)}<span class="badge">${b.cardIds.length}</span></div>`).join('') || '<div class="empty-msg">No bundles</div>';
            // categories
            const cat_l = document.getElementById('cat-list');
            cat_l.innerHTML = d.categories.map(c => `<div class="li${selCatIds.has(c.id) ? ' sel2' : ''}" onclick="toggleCat('${c.id}')">${escH(c.name)}</div>`).join('') || '<div class="empty-msg">No categories</div>';
            renderGatheredList();
        }
        function selectCriteria(id) {
            selCriteriaId = id;
            const c = deck().criteria.find(x => x.id === id);
            document.getElementById('criteria-display').textContent = c ? c.logic : '';
            renderSelectView();
        }
        function toggleBundle(id) { if (selBundleIds.has(id)) selBundleIds.delete(id); else selBundleIds.add(id); renderSelectView(); }
        function toggleCat(id) { if (selCatIds.has(id)) selCatIds.delete(id); else selCatIds.add(id); renderSelectView(); }
        function renderGatheredList() {
            const gl = document.getElementById('gathered-list');
            if (!gatheredCards.length) { gl.innerHTML = '<div class="empty-msg">Press Gather to find matching cards</div>'; document.getElementById('sel-badge').textContent = '0'; return; }
            gl.innerHTML = gatheredCards.map((c, i) => `<div class="li">${i + 1}. ${escH(c.front)}</div>`).join('');
            document.getElementById('sel-badge').textContent = gatheredCards.length;
        }
        function gatherCards() {
            const d = deck(); if (!d) return;
            const crit = d.criteria.find(c => c.id === selCriteriaId);
            const logic = crit ? crit.logic : '';
            const dir = document.getElementById('drill-direction').value;
            const dirs = dir === 'both' ? ['fb', 'bf'] : [dir];
            const bFilter = selBundleIds.size > 0;
            const catFilter = selCatIds.size > 0;
            let seen = new Set();
            let result = [];
            for (const card_obj of d.cards) {
                if (bFilter) {
                    const inBundle = d.bundles.some(b => selBundleIds.has(b.id) && b.cardIds.includes(card_obj.id));
                    if (!inBundle) continue;
                }
                if (catFilter && !selCatIds.has(card_obj.categoryId)) continue;
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
            gatheredCards = result.slice(0, max);
            renderGatheredList();
            document.getElementById('gathered-count').textContent = `(${result.length} matched, showing ${gatheredCards.length})`;
        }
        function startDrill() {
            if (!gatheredCards.length) { alert('No cards gathered. Press Gather first.'); return; }
            drillSession = {
                cards: [...gatheredCards],
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
            const s = drillSession; if (!s) return;
            if (s.idx >= s.cards.length) { endDrill(); return; }
            const c = s.cards[s.idx];
            const total = s.cards.length;
            const left = total - s.idx;
            document.getElementById('drill-progress').textContent = `Card ${s.idx + 1} of ${total}`;
            document.getElementById('session-dir').textContent = c._dir === 'fb' ? 'Front → Back' : 'Back → Front';
            const d = deck();
            const settings = d.settings || {};
            const frontText = c._dir === 'fb' ? c.front : c.back;
            const backText = c._dir === 'fb' ? c.back : c.front;
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
                const html = `<html><head>${head}<style>body{margin:8px;color:#dde1ec;font-size:${fontSize}px;display:flex;align-items:center;justify-content:center;min-height:80px;word-break:break-word;text-align:center;}*{box-sizing:border-box;}</style></head><body>${tmpl.replace(/\{\{front\}\}/g, escH(text)).replace(/\{\{back\}\}/g, escH(text))}</body></html>`;
                el.innerHTML = `<iframe srcdoc="${escAttr(html)}" style="width:100%;height:100%;min-height:140px;border:none;background:transparent"></iframe>`;
            } else {
                el.style.fontSize = fontSize + 'px';
                el.textContent = text;
            }
        }
        function flipCard() {
            const s = drillSession; if (!s) return;
            const c = s.cards[s.idx];
            const d = deck();
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
            const s = drillSession; if (!s) return;
            const c = s.cards[s.idx];
            const d = deck();
            const realCard = d.cards.find(x => x.id === c.id);
            if (realCard) {
                const m = realCard[c._dir];
                if (right) {
                    m.timesRight++; m.timesRightSinceWrong++; m.dateLastRight = now();
                    if (right) s.right++;
                } else {
                    m.timesWrong++; m.timesRightSinceWrong = 0; m.dateLastWrong = now();
                    s.wrong++;
                }
                save();
            }
            s.history.push({ cardId: c.id, dir: c._dir, right });
            s.idx++;
            renderDrillCard();
        }
        function prevCard() {
            const s = drillSession; if (!s || s.idx <= 0) return;
            s.idx--;
            if (s.history.length > 0) {
                const last = s.history.pop();
                const d = deck();
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
            const s = drillSession;
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
            const s = drillSession;
            const total = s.right + s.wrong;
            const score = total ? Math.round(s.right / total * 100) : 0;
            document.getElementById('drill-front').textContent = `Session Complete! Score: ${score}% (${s.right} right, ${s.wrong} wrong)`;
            document.getElementById('drill-back').style.display = 'none';
            document.getElementById('drill-btns-flip').style.display = 'none';
            document.getElementById('drill-btns-judge').style.display = 'none';
            updateDrillStats();
        }
        function editCurrentCard() {
            if (!drillSession) return;
            const c = drillSession.cards[drillSession.idx];
            if (!c) return;
            showView('edit');
            editCards = deck().cards;
            editIdx = editCards.findIndex(x => x.id === c.id);
            renderEditCard();
        }

        // =====================================================================
        // EDIT VIEW
        // =====================================================================
        function renderEditCards() {
            const d = deck(); if (!d) return;
            editCards = [...d.cards];
            renderEditCard();
        }
        function renderEditCard() {
            const d = deck(); if (!d) return;
            if (!editCards.length) { clearEditForm(); return; }
            if (editIdx < 0) editIdx = 0;
            if (editIdx >= editCards.length) editIdx = editCards.length - 1;
            const c = editCards[editIdx];
            document.getElementById('edit-pos').textContent = `${editIdx + 1} / ${editCards.length}`;
            document.getElementById('edit-front').value = c.front || '';
            document.getElementById('edit-back').value = c.back || '';
            document.getElementById('edit-freq').value = c.frequency || 0;
            // categories
            const catSel = document.getElementById('edit-cat');
            catSel.innerHTML = d.categories.map(cat => `<option value="${cat.id}"${cat.id === c.categoryId ? ' selected' : ''}>${escH(cat.name)}</option>`).join('');
            // metrics
            document.getElementById('metrics-fb').innerHTML = renderMetrics(c.fb);
            document.getElementById('metrics-bf').innerHTML = renderMetrics(c.bf);
            // bundles
            const cardBundles = d.bundles.filter(b => b.cardIds.includes(c.id));
            document.getElementById('edit-bundles').innerHTML = cardBundles.length ? cardBundles.map(b => `<span class="tag">${escH(b.name)}</span>`).join('') : '<span style="color:#5a6890;font-size:.8em">No bundles</span>';
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
            if (dir === 'first') editIdx = 0;
            else if (dir === 'prev') editIdx = Math.max(0, editIdx - 1);
            else if (dir === 'next') editIdx = Math.min(editCards.length - 1, editIdx + 1);
            else if (dir === 'last') editIdx = editCards.length - 1;
            renderEditCard();
        }
        function editSearch(q) {
            const d = deck(); if (!d) return;
            q = q.toLowerCase();
            editCards = q ? d.cards.filter(c => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)) : d.cards;
            editIdx = 0;
            renderEditCard();
        }
        function saveCurrentCard() {
            const d = deck(); if (!d || !editCards.length) return;
            const c = editCards[editIdx];
            const realCard = d.cards.find(x => x.id === c.id);
            if (!realCard) return;
            realCard.front = document.getElementById('edit-front').value;
            realCard.back = document.getElementById('edit-back').value;
            realCard.frequency = parseFloat(document.getElementById('edit-freq').value) || 0;
            realCard.categoryId = document.getElementById('edit-cat').value;
            realCard.editedDate = now();
            Object.assign(c, realCard);
            save(); updateDeckStats();
            flash('edit-pos', 'Saved!');
        }
        function addNewCard() {
            const d = deck(); if (!d) return;
            const c = mkCard('', '', d.categories[0]?.id || '');
            d.cards.push(c); save();
            editCards = d.cards;
            editIdx = editCards.length - 1;
            renderEditCard();
            document.getElementById('edit-front').focus();
            updateDeckStats();
        }
        function deleteCurrentCard() {
            const d = deck(); if (!d || !editCards.length) return;
            const c = editCards[editIdx];
            if (!confirm('Delete this card?')) return;
            d.cards = d.cards.filter(x => x.id !== c.id);
            d.bundles.forEach(b => b.cardIds = b.cardIds.filter(id => id !== c.id));
            save();
            editCards = d.cards;
            editIdx = Math.min(editIdx, editCards.length - 1);
            renderEditCard(); updateDeckStats();
        }
        function clearHistory(scope) {
            const d = deck(); if (!d) return;
            const mk = () => ({ timesRight: 0, timesWrong: 0, timesRightSinceWrong: 0, dateLastRight: null, dateLastWrong: null });
            if (scope === 'card' && editCards.length) {
                const c = d.cards.find(x => x.id === editCards[editIdx].id);
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
            const d = deck(); if (!d) return;
            const q = (document.getElementById('table-search').value || '').toLowerCase();
            let rows = d[type] || [];
            if (q) rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
            const cols = TABLE_COLS[type];
            document.getElementById('table-head').innerHTML = '<tr><th>#</th>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>';
            document.getElementById('table-body').innerHTML = rows.map((r, i) => `<tr onclick="selectTableRow(this,'${r.id}')" data-id="${r.id}"><td>${i + 1}</td>${cols.map(c => `<td><input value="${escAttr(String(r[c] ?? ''))}" onchange="updateTableCell('${type}','${r.id}','${c}',this.value)"></td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length + 1}" style="text-align:center;color:#3a4060;padding:20px">No data</td></tr>`;
        }
        function selectTableRow(tr, id) { selectedTableRow = id;[...document.querySelectorAll('#table-body tr')].forEach(r => r.style.background = ''); tr.style.background = '#1e2540'; }
        function updateTableCell(type, id, col, val) {
            const d = deck(); if (!d) return;
            const r = (d[type] || []).find(x => x.id === id); if (!r) return;
            r[col] = isNaN(val) || val === '' ? val : Number(val);
            save();
        }
        function addTableRow() {
            const type = document.getElementById('table-select').value;
            const d = deck(); if (!d) return;
            if (type === 'cards') d.cards.push(mkCard());
            else if (type === 'categories') d.categories.push({ id: uid(), name: 'New Category' });
            else if (type === 'criteria') d.criteria.push({ id: uid(), name: 'New Criteria', logic: '' });
            else if (type === 'bundles') d.bundles.push({ id: uid(), name: 'New Bundle', cardIds: [] });
            save(); renderTable(type); updateDeckStats();
        }
        function deleteTableRow() {
            const type = document.getElementById('table-select').value;
            const d = deck(); if (!d || !selectedTableRow) return;
            if (!confirm('Delete selected row?')) return;
            d[type] = (d[type] || []).filter(r => r.id !== selectedTableRow);
            save(); selectedTableRow = null; renderTable(type); updateDeckStats();
        }

        // =====================================================================
        // BUNDLES VIEW
        // =====================================================================
        let bvSelCards = new Set();
        let bvSelBundleCards = new Set();

        function renderBundleView() {
            const d = deck(); if (!d) return;
            const q = (document.getElementById('bundle-card-search').value || '').toLowerCase();
            const cards = q ? d.cards.filter(c => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q)) : d.cards;
            document.getElementById('bv-cards').innerHTML = cards.map(c => `<div class="li${bvSelCards.has(c.id) ? ' sel' : ''}" onclick="toggleBvCard('${c.id}')">${escH(c.front)}</div>`).join('') || '<div class="empty-msg">No cards</div>';
            const bSel = document.getElementById('bv-bundle-select');
            const prevVal = bSel.value;
            bSel.innerHTML = d.bundles.map(b => `<option value="${b.id}">${escH(b.name)}</option>`).join('') || '<option value="">-- no bundles --</option>';
            if (prevVal && d.bundles.find(b => b.id === prevVal)) bSel.value = prevVal;
            const bid = bSel.value;
            const bundle = d.bundles.find(b => b.id === bid);
            if (bundle) {
                const bcards = bundle.cardIds.map(id => d.cards.find(c => c.id === id)).filter(Boolean);
                document.getElementById('bv-bundle-cards').innerHTML = bcards.map(c => `<div class="li${bvSelBundleCards.has(c.id) ? ' sel' : ''}" onclick="toggleBvBundleCard('${c.id}')">${escH(c.front)}</div>`).join('') || '<div class="empty-msg">Bundle is empty</div>';
            } else { document.getElementById('bv-bundle-cards').innerHTML = '<div class="empty-msg">Select a bundle</div>'; }
        }
        function toggleBvCard(id) { if (bvSelCards.has(id)) bvSelCards.delete(id); else bvSelCards.add(id); renderBundleView(); }
        function toggleBvBundleCard(id) { if (bvSelBundleCards.has(id)) bvSelBundleCards.delete(id); else bvSelBundleCards.add(id); renderBundleView(); }
        function addToBundle() {
            const d = deck(); if (!d) return;
            const bid = document.getElementById('bv-bundle-select').value;
            const bundle = d.bundles.find(b => b.id === bid); if (!bundle) { alert('Select a bundle first.'); return; }
            bvSelCards.forEach(id => { if (!bundle.cardIds.includes(id)) bundle.cardIds.push(id); });
            save(); bvSelCards.clear(); renderBundleView();
        }
        function removeFromBundle() {
            const d = deck(); if (!d) return;
            const bid = document.getElementById('bv-bundle-select').value;
            const bundle = d.bundles.find(b => b.id === bid); if (!bundle) return;
            bundle.cardIds = bundle.cardIds.filter(id => !bvSelBundleCards.has(id));
            save(); bvSelBundleCards.clear(); renderBundleView();
        }
        function createBundle() {
            const name = document.getElementById('new-bundle-name').value.trim();
            if (!name) { alert('Enter a bundle name.'); return; }
            const d = deck(); if (!d) return;
            d.bundles.push({ id: uid(), name, cardIds: [] });
            save(); document.getElementById('new-bundle-name').value = ''; renderBundleView(); renderSelectView(); updateDeckStats();
        }
        function deleteBundle() {
            const d = deck(); if (!d) return;
            const bid = document.getElementById('bv-bundle-select').value; if (!bid) { alert('Select a bundle first.'); return; }
            if (!confirm('Delete this bundle?')) return;
            d.bundles = d.bundles.filter(b => b.id !== bid);
            save(); renderBundleView(); renderSelectView(); updateDeckStats();
        }

        // =====================================================================
        // CRITERIA VIEW
        // =====================================================================
        let selCritMgrId = '';
        function renderCriteriaView() {
            const d = deck(); if (!d) return;
            document.getElementById('criteria-mgr-list').innerHTML = d.criteria.map(c => `<div class="li${selCritMgrId === c.id ? ' sel' : ''}" onclick="selectCritMgr('${c.id}')">${escH(c.name)}</div>`).join('') || '<div class="empty-msg">No criteria</div>';
        }
        function selectCritMgr(id) {
            selCritMgrId = id;
            const d = deck(); const c = d.criteria.find(x => x.id === id);
            if (c) { document.getElementById('crit-name').value = c.name; document.getElementById('crit-logic').value = c.logic; }
            renderCriteriaView();
        }
        function newCriteria() {
            selCritMgrId = '';
            document.getElementById('crit-name').value = '';
            document.getElementById('crit-logic').value = '';
            renderCriteriaView();
        }
        function saveCriteria() {
            const d = deck(); if (!d) return;
            const name = document.getElementById('crit-name').value.trim();
            const logic = document.getElementById('crit-logic').value.trim();
            if (!name) { alert('Enter a name.'); return; }
            if (selCritMgrId) {
                const c = d.criteria.find(x => x.id === selCritMgrId); if (c) { c.name = name; c.logic = logic; }
            } else { d.criteria.push({ id: uid(), name, logic }); selCritMgrId = d.criteria[d.criteria.length - 1].id; }
            save(); renderCriteriaView(); renderSelectView();
        }
        function deleteCriteria() {
            if (!selCritMgrId) return;
            if (!confirm('Delete this criteria?')) return;
            const d = deck(); d.criteria = d.criteria.filter(c => c.id !== selCritMgrId);
            selCritMgrId = ''; save(); renderCriteriaView(); renderSelectView();
        }
        function testCriteria() {
            const d = deck(); if (!d) return;
            const logic = document.getElementById('crit-logic').value.trim();
            const dir = document.getElementById('drill-direction').value === 'bf' ? 'bf' : 'fb';
            const matches = d.cards.filter(c => evaluateCriteria(logic, c, dir));
            document.getElementById('crit-test-result').textContent = `→ ${matches.length} card(s) match`;
        }

        // =====================================================================
        // SETTINGS VIEW
        // =====================================================================
        function renderSettingsView() {
            const d = deck(); if (!d) return;
            const s = d.settings || {};
            document.getElementById('font-size').value = s.fontSize || 22;
            document.getElementById('font-size-label').textContent = (s.fontSize || 22) + 'px';
            document.getElementById('tmpl-head').value = s.headTmpl || '';
            document.getElementById('tmpl-front').value = s.frontTmpl || '';
            document.getElementById('tmpl-back').value = s.backTmpl || '';
        }
        function updateFontSize(v) { document.getElementById('font-size-label').textContent = v + 'px'; }
        function saveSettings() {
            const d = deck(); if (!d) return;
            if (!d.settings) d.settings = {};
            d.settings.fontSize = parseInt(document.getElementById('font-size').value) || 22;
            d.settings.headTmpl = document.getElementById('tmpl-head').value;
            d.settings.frontTmpl = document.getElementById('tmpl-front').value;
            d.settings.backTmpl = document.getElementById('tmpl-back').value;
            save(); alert('Settings saved.');
        }
        function resetSettings() {
            const d = deck(); if (!d) return;
            d.settings = { fontSize: 22, headTmpl: '', frontTmpl: '', backTmpl: '' };
            save(); renderSettingsView();
        }

        // =====================================================================
        // IMPORT / EXPORT
        // =====================================================================
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
            const d = deck(); if (!d) return;
            const scope = document.getElementById('export-scope').value;
            const cards = scope === 'gathered' && gatheredCards.length ? gatheredCards : d.cards;
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
            dlBlob(new Blob([content], { type: mime }), d.name + '_export.' + ext);
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
            const d = deck();
            document.getElementById('import-mapping').innerHTML = `<div class="flab">Map columns to card fields</div>` + headers.map((h, i) => `<div class="row"><span style="min-width:100px;font-size:.82em;color:#5a6890">${h}</span><select id="imap-${i}" style="flex:1"><option value="">-- skip --</option>${['front', 'back', 'categoryId', 'frequency'].map(f => `<option value="${f}"${h.toLowerCase() === f.toLowerCase() ? ` selected` : ''}>${f}</option>`).join('')}</select></div>`).join('');
            document.getElementById('import-btn').style.display = 'block';
        }
        function doImport() {
            const d = deck(); if (!d || !importParsed) return;
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
            const d = deck(); if (!d) return;
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
            const d = deck(); if (!d) return;
            const cards = gatheredCards.length ? gatheredCards : d.cards;
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escH(d.name)} Quiz</title>
<style>body{font-family:system-ui;background:#12151e;color:#dde1ec;padding:20px;max-width:700px;margin:auto}
h1{color:#e84560;margin-bottom:20px}.card{background:#1a1f32;border:1px solid #2a3050;border-radius:10px;padding:20px;margin:14px 0}
.front{font-size:1.3em;font-weight:700}.back{color:#5a6890;margin-top:8px;display:none;font-size:1.1em}
.toggle{margin-top:10px;background:#2a3050;color:#dde1ec;border:none;padding:5px 14px;border-radius:4px;cursor:pointer}
</style></head><body>
<h1>${escH(d.name)} — Quiz (${cards.length} cards)</h1>
${cards.map((c, i) => `<div class="card"><div class="front">${i + 1}. ${escH(c.front)}</div><div class="back" id="b${i}">${escH(c.back)}</div><button class="toggle" onclick="t(${i})">Show Answer</button></div>`).join('')}
<script>function t(i){const el=document.getElementById('b'+i);el.style.display=el.style.display==='block'?'none':'block';}<\/script>
</body></html>`;
            dlBlob(new Blob([html], { type: 'text/html' }), d.name + '_quiz.html');
        }

        // =====================================================================
        // MODAL
        // =====================================================================
        function openModal(title, body, cb) {
            document.getElementById('modal-title').textContent = title;
            document.getElementById('modal-body').innerHTML = body;
            document.getElementById('modal').style.display = 'flex';
            modalCallback = cb;
        }
        function closeModal() { document.getElementById('modal').style.display = 'none'; modalCallback = null; }
        function modalOk() { if (modalCallback) modalCallback(); closeModal(); }

        // =====================================================================
        // HELPERS
        // =====================================================================
        function escH(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
        function escAttr(s) { return String(s || '').replace(/"/g, '&quot;'); }
        function dlBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
        function flash(id, msg) { const el = document.getElementById(id); const prev = el.textContent; el.textContent = msg; setTimeout(() => el.textContent = prev, 1500); }

        // =====================================================================
        // KEYBOARD SHORTCUTS
        // =====================================================================
        document.addEventListener('keydown', e => {
            const tag = document.activeElement.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (e.key === 'ArrowRight' || e.key === 'Enter') flipCard();
            else if (e.key === 'y' || e.key === 'Y') judgeCard(true);
            else if (e.key === 'n' || e.key === 'N') judgeCard(false);
            else if (e.key === 'ArrowLeft') prevCard();
        });

        // =====================================================================
        // START
        // =====================================================================
        init();
