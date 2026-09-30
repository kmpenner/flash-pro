// =====================================================================
// CRITERIA ENGINE & SELECTION
// =====================================================================

// Rules are parsed by a small expression grammar rather than run as JavaScript,
// so a rule in an imported deck can only compare numbers: it cannot run code.
// Operators follow JavaScript precedence and semantics (so `a || b` yields a
// value, as in `(DateLastWrong || DateLastRight)`), plus AND / OR, a single `=`
// for equality and `<>` for inequality. The keyword NOT binds looser than the
// comparisons, as in SQL (`NOT Frequency > 5`), while `!` binds tightly as in
// JavaScript. Names are case-insensitive.

const CRITERIA_NAMES = {
    now: 'Now', dayms: 'DayMs', frequency: 'Frequency',
    timesright: 'TimesRight', timeswrong: 'TimesWrong', timesrightsincewrong: 'TimesRightSinceWrong',
    datelastright: 'DateLastRight', datelastwrong: 'DateLastWrong',
    lastrighttime: 'DateLastRight', lastwrongtime: 'DateLastWrong',
    daysrightsincewrong: 'DaysRightSinceWrong',
};

const CRITERIA_BINARY = {
    '||': (a, b) => a || b, '&&': (a, b) => a && b,
    '==': (a, b) => a == b, '!=': (a, b) => a != b, '===': (a, b) => a === b, '!==': (a, b) => a !== b,
    '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b,
    '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => a / b, '%': (a, b) => a % b,
};
const CRITERIA_ALIASES = { and: '&&', or: '||', not: 'NOT', '=': '==', '<>': '!=' };
const CRITERIA_LEVELS = [['||'], ['&&'], ['==', '!=', '===', '!=='], ['<', '<=', '>', '>='], ['+', '-'], ['*', '/', '%']];
const CRITERIA_NOT_LEVEL = 2; // NOT applies to a whole comparison

function tokenizeCriteria(src) {
    const re = /(\d*\.?\d+(?:e[+-]?\d+)?)|([A-Za-z_]\w*)|(===|!==|==|!=|<>|<=|>=|&&|\|\||[-+*/%<>=!()])/iy;
    const tokens = [];
    let pos = 0;
    for (;;) {
        while (/\s/.test(src[pos] || '')) pos++;
        if (pos >= src.length) break;
        re.lastIndex = pos;
        const m = re.exec(src);
        if (!m) throw new SyntaxError(`Unexpected "${src[pos]}" at position ${pos + 1}`);
        pos = re.lastIndex;
        if (m[1] !== undefined) tokens.push({ type: 'num', value: Number(m[1]) });
        else if (m[2] !== undefined) {
            const w = m[2].toLowerCase();
            if (Object.hasOwn(CRITERIA_ALIASES, w)) tokens.push({ type: 'op', value: CRITERIA_ALIASES[w] });
            else if (w === 'true' || w === 'false') tokens.push({ type: 'num', value: w === 'true' });
            else if (Object.hasOwn(CRITERIA_NAMES, w)) tokens.push({ type: 'name', value: CRITERIA_NAMES[w] });
            else throw new ReferenceError(`Unknown name "${m[2]}"`);
        } else tokens.push({ type: 'op', value: CRITERIA_ALIASES[m[3]] || m[3] });
    }
    return tokens;
}

// Compiles a rule into a function (vars) => value. Throws on a malformed rule.
function parseCriteria(src) {
    const tokens = tokenizeCriteria(src);
    let i = 0;
    const peekOp = () => tokens[i] && tokens[i].type === 'op' ? tokens[i].value : null;
    const expect = op => {
        if (peekOp() !== op) throw new SyntaxError(tokens[i] ? `Expected "${op}" but found "${tokens[i].value}"` : `Expected "${op}" at end of rule`);
        i++;
    };
    const binary = level => {
        if (level === CRITERIA_LEVELS.length) return unary();
        if (level === CRITERIA_NOT_LEVEL && peekOp() === 'NOT') {
            i++;
            const e = binary(level);
            return v => !e(v);
        }
        let left = binary(level + 1);
        while (CRITERIA_LEVELS[level].includes(peekOp())) {
            const f = CRITERIA_BINARY[tokens[i++].value];
            const l = left, r = binary(level + 1);
            left = v => f(l(v), r(v));
        }
        return left;
    };
    const unary = () => {
        const op = peekOp();
        if (op === '!' || op === '-' || op === '+') {
            i++;
            const e = unary();
            return op === '!' ? v => !e(v) : op === '-' ? v => -e(v) : v => +e(v);
        }
        return primary();
    };
    const primary = () => {
        const t = tokens[i++];
        if (!t) throw new SyntaxError('Unexpected end of rule');
        if (t.type === 'num') return () => t.value;
        if (t.type === 'name') return v => v[t.value];
        if (t.value === '(') { const e = binary(0); expect(')'); return e; }
        throw new SyntaxError(`Unexpected "${t.value}"`);
    };
    if (!tokens.length) return () => true;
    const expr = binary(0);
    if (i < tokens.length) throw new SyntaxError(`Unexpected "${tokens[i].value}"`);
    return expr;
}

function criteriaVars(card_obj, dir, nowMs) {
    const m = card_obj[dir] || {};
    const dlr = m.dateLastRight || DEFAULT_DATE;
    const dlw = m.dateLastWrong || DEFAULT_DATE;
    let drsw = 0;
    if (dlr !== DEFAULT_DATE && (dlw === DEFAULT_DATE || dlr > dlw)) { drsw = (nowMs - dlr) / Utils.dayMs; }
    return {
        Now: nowMs, DayMs: Utils.dayMs, Frequency: card_obj.frequency || 0,
        TimesRight: m.timesRight || 0, TimesWrong: m.timesWrong || 0,
        TimesRightSinceWrong: m.timesRightSinceWrong || 0,
        DateLastRight: dlr, DateLastWrong: dlw, DaysRightSinceWrong: drsw,
    };
}

const _criteriaCache = new Map();

// Returns a predicate (card_obj, dir, nowMs?) => boolean. Throws on a malformed rule.
function compileCriteria(logic) {
    const src = (logic || '').trim();
    let pred = _criteriaCache.get(src);
    if (!pred) {
        const expr = parseCriteria(src);
        pred = (card_obj, dir, nowMs = Utils.now()) => !!expr(criteriaVars(card_obj, dir, nowMs));
        if (_criteriaCache.size > 200) _criteriaCache.clear();
        _criteriaCache.set(src, pred);
    }
    return pred;
}

function evaluateCriteria(logic, card_obj, dir, throwOnError = false) {
    try {
        return compileCriteria(logic)(card_obj, dir);
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
    if (!d.criteria || !d.bundles || !d.categories) return; // stub deck: body still loading
    const cl = document.getElementById('criteria-list');
    if (cl) {
        cl.innerHTML = d.criteria.map(c => `<div class="li${State.selCriteriaId === c.id ? ' sel' : ''}" ${Utils.act('selectCriteria', c.id)}>${Utils.escH(c.name)}</div>`).join('') || '<div class="empty-msg">No criteria</div>';
    }
    const bl = document.getElementById('bundle-list');
    if (bl) {
        bl.innerHTML = d.bundles.map(b => `<div class="li${State.selBundleIds.has(b.id) ? ' sel2' : ''}" ${Utils.act('toggleBundle', b.id)}>${Utils.escH(b.name)}<span class="badge">${b.cardIds.length}</span></div>`).join('') || '<div class="empty-msg">No bundles</div>';
    }
    const cat_l = document.getElementById('cat-list');
    if (cat_l) {
        cat_l.innerHTML = d.categories.map(c => `<div class="li${State.selCatIds.has(c.id) ? ' sel2' : ''}" ${Utils.act('toggleCat', c.id)}>${Utils.escH(c.name)}</div>`).join('') || '<div class="empty-msg">No categories</div>';
    }

    // Auto-select sort field for deck: default to frequency if deck has positive frequency data
    const sortEl = document.getElementById('gather-sort');
    if (sortEl) {
        const hasFrequencyData = d.cards && d.cards.some(c => (c.frequency || 0) > 0);
        if (!State.userSelectedSort) {
            sortEl.value = hasFrequencyData ? 'frequency_desc' : 'overdue';
        }
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

function selectAllBundles(all) {
    const d = State.deck; if (!d) return;
    State.selBundleIds = all ? new Set(d.bundles.map(b => b.id)) : new Set();
    renderSelectView();
    gatherCards();
}

function selectAllCats(all) {
    const d = State.deck; if (!d) return;
    State.selCatIds = all ? new Set(d.categories.map(c => c.id)) : new Set();
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
    const d = State.deck; if (!d || !d.cards) return;
    const crit = d.criteria.find(c => c.id === State.selCriteriaId);
    const logic = crit ? crit.logic : '';
    const dirEl = document.getElementById('drill-direction');
    const dir = (dirEl && dirEl.value) ? dirEl.value : 'fb';
    const dirs = dir === 'both' ? ['fb', 'bf'] : [dir];
    let bundleCardIds = null;
    if (State.selBundleIds.size > 0) {
        bundleCardIds = new Set();
        for (const b of d.bundles) {
            if (State.selBundleIds.has(b.id)) for (const id of b.cardIds) bundleCardIds.add(id);
        }
    }
    const catFilter = State.selCatIds.size > 0;
    let pred;
    try { pred = compileCriteria(logic); } catch (_) { pred = () => false; } // malformed rule matches nothing
    let seen = new Set();
    let matched = [];
    const nowMs = Utils.now();

    for (const card_obj of d.cards) {
        if (bundleCardIds && !bundleCardIds.has(card_obj.id)) continue;
        if (catFilter && !State.selCatIds.has(card_obj.categoryId)) continue;
        for (const dr of dirs) {
            const key = card_obj.id + '_' + dr;
            if (seen.has(key)) continue;
            if (pred(card_obj, dr, nowMs)) {
                seen.add(key);
                matched.push({ ...card_obj, _dir: dr });
            }
        }
    }

    // Determine sort field
    const hasFrequencyData = d.cards && d.cards.some(c => (c.frequency || 0) > 0);
    const sortEl = document.getElementById('gather-sort');
    const sortMode = (sortEl && sortEl.value) ? sortEl.value : (hasFrequencyData ? 'frequency_desc' : 'overdue');

    const getOverdueDiff = (a, b) => {
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
    };

    if (sortMode === 'frequency_desc') {
        matched.sort((a, b) => {
            const diff = (b.frequency || 0) - (a.frequency || 0);
            return diff !== 0 ? diff : getOverdueDiff(a, b);
        });
    } else if (sortMode === 'frequency_asc') {
        matched.sort((a, b) => {
            const diff = (a.frequency || 0) - (b.frequency || 0);
            return diff !== 0 ? diff : getOverdueDiff(a, b);
        });
    } else if (sortMode === 'order') {
        matched.sort((a, b) => {
            const na = typeof a.num === 'number' ? a.num : (parseInt(a.num, 10) || 0);
            const nb = typeof b.num === 'number' ? b.num : (parseInt(b.num, 10) || 0);
            if (na !== nb) return na - nb;
            return String(a.id || '').localeCompare(String(b.id || ''));
        });
    } else if (sortMode === 'front') {
        matched.sort((a, b) => String(a.front || '').localeCompare(String(b.front || '')));
    } else if (sortMode === 'back') {
        matched.sort((a, b) => String(a.back || '').localeCompare(String(b.back || '')));
    } else if (sortMode === 'random') {
        for (let i = matched.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [matched[i], matched[j]] = [matched[j], matched[i]];
        }
    } else {
        // Default: Spaced Repetition (overdue)
        matched.sort(getOverdueDiff);
    }

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
    const d = State.deck; if (!d || !d.criteria) return; // stub deck guard
    const mgrList = document.getElementById('criteria-mgr-list');
    if (mgrList) {
        mgrList.innerHTML = d.criteria.map(c => `<div class="li${State.selCritMgrId === c.id ? ' sel' : ''}" ${Utils.act('selectCritMgr', c.id)}>${Utils.escH(c.name)}</div>`).join('') || '<div class="empty-msg">No criteria</div>';
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

// Classic Flash! Pro XP "Type of Drill" presets, restored as one-click criteria rules.
const DRILL_PRESETS = [
    { name: 'Freq. 100+', logic: 'Frequency >= 100' },
    { name: 'Freq. 200-300', logic: 'Frequency >= 200 AND Frequency <= 300' },
    { name: 'Frequency<50', logic: 'Frequency < 50' },
    { name: 'Hapax (Once Only)', logic: 'Frequency == 1' },
    { name: 'Emergency Quiz', logic: 'TimesWrong > 0 AND TimesRightSinceWrong < 2' },
];

function addDrillPreset(idx) {
    const d = State.deck; if (!d || !d.criteria) return; // stub deck guard
    const preset = DRILL_PRESETS[idx];
    if (!preset) return;
    const existing = d.criteria.find(c => c.name === preset.name);
    if (existing) {
        State.selCriteriaId = existing.id;
    } else {
        const newC = { id: Utils.uid(), name: preset.name, logic: preset.logic };
        d.criteria.push(newC);
        State.selCriteriaId = newC.id;
        save();
    }
    renderCriteriaView();
    renderSelectView();
    selectCriteria(State.selCriteriaId);
    gatherCards();
}

function saveCriteria() {
    const d = State.deck; if (!d || !d.criteria) return; // stub deck guard
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
        const pred = compileCriteria(logic);
        const matches = (d.cards || []).filter(c => pred(c, dir));
        resEl.style.color = '';
        resEl.textContent = `→ ${matches.length} card(s) match`;
    } catch (err) {
        resEl.style.color = '#ef4444';
        resEl.textContent = `→ Error: ${err.message}`;
    }
}
