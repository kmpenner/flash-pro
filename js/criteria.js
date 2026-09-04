// =====================================================================
// CRITERIA ENGINE & SELECTION
// =====================================================================

function evaluateCriteria(logic, card_obj, dir, throwOnError = false) {
    if (!logic || !logic.trim()) return true;
    const m = card_obj[dir] || {};
    const nowMs = Utils.now();
    let dlr = m.dateLastRight || DEFAULT_DATE;
    let dlw = m.dateLastWrong || DEFAULT_DATE;
    let drsw = 0;
    if (dlr !== DEFAULT_DATE && (dlw === DEFAULT_DATE || dlr > dlw)) { drsw = (nowMs - dlr) / Utils.dayMs; }
    const ctx = {
        Now: nowMs, NOW: nowMs, Frequency: card_obj.frequency || 0,
        TimesRight: m.timesRight || 0, TimesWrong: m.timesWrong || 0,
        TimesRightSinceWrong: m.timesRightSinceWrong || 0,
        DateLastRight: dlr, DateLastWrong: dlw,
        LastRightTime: dlr, LastWrongTime: dlw,
        DaysRightSinceWrong: drsw,
    };
    let expr = logic;
    expr = expr.replace(/([^!<>=])=([^=])/g, '$1==$2');
    for (const [k, v] of Object.entries(ctx)) {
        expr = expr.replace(new RegExp('\\b' + k + '\\b', 'g'), String(v));
    }
    expr = expr.replace(/\bAND\b/gi, '&&').replace(/\bOR\b/gi, '||');
    try {
        return !!Function('"use strict";return(' + expr + ')')();
    } catch (err) {
        if (throwOnError) throw err;
        return false;
    }
}

// =====================================================================
// SELECT VIEW
// =====================================================================

function renderSelectView() {
    const d = State.deck; if (!d) return;
    const cl = document.getElementById('criteria-list');
    if (cl) {
        cl.innerHTML = d.criteria.map(c => `<div class="li${State.selCriteriaId === c.id ? ' sel' : ''}" onclick="selectCriteria('${c.id}')">${Utils.escH(c.name)}</div>`).join('') || '<div class="empty-msg">No criteria</div>';
    }
    const bl = document.getElementById('bundle-list');
    if (bl) {
        bl.innerHTML = d.bundles.map(b => `<div class="li${State.selBundleIds.has(b.id) ? ' sel2' : ''}" onclick="toggleBundle('${b.id}')">${Utils.escH(b.name)}<span class="badge">${b.cardIds.length}</span></div>`).join('') || '<div class="empty-msg">No bundles</div>';
    }
    const cat_l = document.getElementById('cat-list');
    if (cat_l) {
        cat_l.innerHTML = d.categories.map(c => `<div class="li${State.selCatIds.has(c.id) ? ' sel2' : ''}" onclick="toggleCat('${c.id}')">${Utils.escH(c.name)}</div>`).join('') || '<div class="empty-msg">No categories</div>';
    }
    renderGatheredList();
}

function selectCriteria(id) {
    State.selCriteriaId = id;
    const c = State.deck?.criteria.find(x => x.id === id);
    const disp = document.getElementById('criteria-display');
    if (disp) disp.textContent = c ? c.logic : '';
    renderSelectView();
    gatherCards();
}

function toggleBundle(id) {
    if (State.selBundleIds.has(id)) State.selBundleIds.delete(id);
    else State.selBundleIds.add(id);
    renderSelectView();
    gatherCards();
}

function toggleCat(id) {
    if (State.selCatIds.has(id)) State.selCatIds.delete(id);
    else State.selCatIds.add(id);
    renderSelectView();
    gatherCards();
}

function renderGatheredList() {
    const gl = document.getElementById('gathered-list');
    const badge = document.getElementById('sel-badge');
    if (!gl) return;
    if (!State.gatheredCards.length) {
        gl.innerHTML = '<div class="empty-msg">Press Gather to find matching cards</div>';
        if (badge) badge.textContent = '0';
        return;
    }
    gl.innerHTML = State.gatheredCards.map((c, i) => `<div class="li">${i + 1}. ${Utils.escH(c.front)}</div>`).join('');
    if (badge) badge.textContent = State.gatheredCards.length;
}

function gatherCards() {
    const d = State.deck; if (!d) return;
    const crit = d.criteria.find(c => c.id === State.selCriteriaId);
    const logic = crit ? crit.logic : '';
    const dirEl = document.getElementById('drill-direction');
    const dir = (dirEl && dirEl.value) ? dirEl.value : 'fb';
    const dirs = dir === 'both' ? ['fb', 'bf'] : [dir];
    const bFilter = State.selBundleIds.size > 0;
    const catFilter = State.selCatIds.size > 0;
    let seen = new Set();
    let matched = [];
    const nowMs = Utils.now();

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
                matched.push({ ...card_obj, _dir: dr });
            }
        }
    }

    // Rank matched cards according to the pure spaced repetition formula:
    // Overdue = (Now - LastRightTime) - (LastRightTime - LastWrongTime)
    // - Missed cards (aWrong > aRight) have negative intervals and highest overdue scores (~53 yrs)
    // - Unstudied cards (default 2000-01-01) have overdue scores of ~26 yrs and preserve textbook order
    // - Actively reviewed cards are sorted by elapsed overdue duration relative to their interval
    matched.sort((a, b) => {
        const ma = a[a._dir] || {};
        const mb = b[b._dir] || {};
        const aRight = ma.dateLastRight || DEFAULT_DATE;
        const bRight = mb.dateLastRight || DEFAULT_DATE;
        const aWrong = ma.dateLastWrong || DEFAULT_DATE;
        const bWrong = mb.dateLastWrong || DEFAULT_DATE;

        const aInterval = aRight - aWrong;
        const bInterval = bRight - bWrong;
        const aOverdue = (nowMs - aRight) - aInterval;
        const bOverdue = (nowMs - bRight) - bInterval;
        return bOverdue - aOverdue;
    });

    const max = getSessionLimit();
    State.gatheredCards = matched.slice(0, max);
    renderGatheredList();
    const gc = document.getElementById('gathered-count');
    if (gc) gc.textContent = `(${matched.length} matched, queueing ${State.gatheredCards.length})`;
}

// =====================================================================
// CRITERIA MANAGER
// =====================================================================

function renderCriteriaView() {
    const d = State.deck; if (!d) return;
    const mgrList = document.getElementById('criteria-mgr-list');
    if (mgrList) {
        mgrList.innerHTML = d.criteria.map(c => `<div class="li${State.selCritMgrId === c.id ? ' sel' : ''}" onclick="selectCritMgr('${c.id}')">${Utils.escH(c.name)}</div>`).join('') || '<div class="empty-msg">No criteria</div>';
    }
}

function selectCritMgr(id) {
    State.selCritMgrId = id;
    const d = State.deck; const c = d?.criteria.find(x => x.id === id);
    if (c) {
        const nameEl = document.getElementById('crit-name');
        const logicEl = document.getElementById('crit-logic');
        if (nameEl) nameEl.value = c.name;
        if (logicEl) logicEl.value = c.logic;
    }
    renderCriteriaView();
}

function newCriteria() {
    State.selCritMgrId = '';
    const nameEl = document.getElementById('crit-name');
    const logicEl = document.getElementById('crit-logic');
    if (nameEl) nameEl.value = '';
    if (logicEl) logicEl.value = '';
    renderCriteriaView();
}

function saveCriteria() {
    const d = State.deck; if (!d) return;
    const name = (document.getElementById('crit-name')?.value || '').trim();
    const logic = (document.getElementById('crit-logic')?.value || '').trim();
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
    const d = State.deck; if (!d) return;
    d.criteria = d.criteria.filter(c => c.id !== State.selCritMgrId);
    State.selCritMgrId = ''; save(); renderCriteriaView(); renderSelectView();
}

function testCriteria() {
    const d = State.deck; if (!d) return;
    const logic = (document.getElementById('crit-logic')?.value || '').trim();
    const dir = document.getElementById('drill-direction')?.value === 'bf' ? 'bf' : 'fb';
    const resEl = document.getElementById('crit-test-result');
    if (!resEl) return;
    try {
        const matches = d.cards.filter(c => evaluateCriteria(logic, c, dir, true));
        resEl.style.color = '';
        resEl.textContent = `→ ${matches.length} card(s) match`;
    } catch (err) {
        resEl.style.color = '#ef4444';
        resEl.textContent = `→ Error: ${err.message}`;
    }
}
