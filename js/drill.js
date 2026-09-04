// =====================================================================
// DRILL SESSION & STUDY RUNNER
// =====================================================================

function startDrill() {
    if (typeof gatherCards === 'function') gatherCards();
    if (!State.gatheredCards.length) { alert('No cards gathered matching your selection.'); return; }
    cancelAutoRestart();
    State.drillSession = {
        cards: [...State.gatheredCards],
        idx: 0,
        flipped: false,
        right: 0,
        wrong: 0,
        history: [],
    };
    if (typeof showView === 'function') showView('drill');
    renderDrillCard();
}

function renderDrillCard() {
    const s = State.drillSession; if (!s) return;
    cancelAutoRestart();
    const comp = document.getElementById('drill-completion');
    if (comp) comp.style.display = 'none';
    const frontEl = document.getElementById('drill-front');
    if (frontEl) frontEl.style.display = 'flex';

    if (s.idx >= s.cards.length) { endDrill(); return; }
    const c = s.cards[s.idx];
    const total = s.cards.length;
    const progEl = document.getElementById('drill-progress');
    if (progEl) progEl.textContent = `Card ${s.idx + 1} of ${total}`;
    const dirEl = document.getElementById('session-dir');
    if (dirEl) dirEl.textContent = c._dir === 'fb' ? 'Front → Back' : 'Back → Front';
    const d = State.deck;
    const settings = d?.settings || {};
    const frontText = c._dir === 'fb' ? c.front : c.back;
    renderCardFace('drill-front', frontText, settings.frontTmpl || '', settings.headTmpl || '', settings.fontSize || 28, 'front');
    const backEl = document.getElementById('drill-back');
    if (backEl) backEl.style.display = 'none';
    s.flipped = false;
    const flipBtns = document.getElementById('drill-btns-flip');
    if (flipBtns) flipBtns.style.display = 'flex';
    const judgeBtns = document.getElementById('drill-btns-judge');
    if (judgeBtns) judgeBtns.style.display = 'none';
    updateDrillStats();
}

function renderCardFace(elId, text, tmpl, head, fontSize, side) {
    const el = document.getElementById(elId);
    if (!el) return;
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
    const settings = d?.settings || {};
    const backText = c._dir === 'fb' ? c.back : c.front;
    const backEl = document.getElementById('drill-back');
    renderCardFace('drill-back', backText, settings.backTmpl || '', settings.headTmpl || '', settings.fontSize || 22, 'back');
    if (backEl) backEl.style.display = 'flex';
    s.flipped = true;
    const flipBtns = document.getElementById('drill-btns-flip');
    if (flipBtns) flipBtns.style.display = 'none';
    const judgeBtns = document.getElementById('drill-btns-judge');
    if (judgeBtns) judgeBtns.style.display = 'flex';
}

function judgeCard(right) {
    const s = State.drillSession; if (!s) return;
    const c = s.cards[s.idx];
    const d = State.deck;
    const realCard = d?.cards.find(x => x.id === c.id);
    let prevMetrics = null;
    if (realCard) {
        const dir = c._dir === 'bf' ? 'bf' : 'fb';
        const m = realCard[dir] = realCard[dir] || { timesRight: 0, timesWrong: 0, timesRightSinceWrong: 0, dateLastRight: null, dateLastWrong: null };
        prevMetrics = { ...m };
        if (right) {
            m.timesRight++; m.timesRightSinceWrong++; m.dateLastRight = Utils.now();
            s.right++;
        } else {
            m.timesWrong++; m.timesRightSinceWrong = 0; m.dateLastWrong = Utils.now();
            s.wrong++;
        }
        syncCardAcrossDecks(realCard.id, dir, m);
        save();
    }
    s.history.push({ cardId: c.id, dir: c._dir, right, prevMetrics });
    s.idx++;
    renderDrillCard();
}

function prevCard() {
    const s = State.drillSession; if (!s || s.idx <= 0) return;
    s.idx--;
    if (s.history.length > 0) {
        const last = s.history.pop();
        const d = State.deck;
        const rc = d?.cards.find(x => x.id === last.cardId);
        if (rc) {
            const dir = last.dir === 'bf' ? 'bf' : 'fb';
            if (last.prevMetrics) {
                rc[dir] = { ...last.prevMetrics };
            } else {
                const m = rc[dir] = rc[dir] || { timesRight: 0, timesWrong: 0, timesRightSinceWrong: 0, dateLastRight: null, dateLastWrong: null };
                if (last.right) { m.timesRight--; m.timesRightSinceWrong = Math.max(0, m.timesRightSinceWrong - 1); if (m.timesRight < 0) m.timesRight = 0; }
                else { m.timesWrong--; if (m.timesWrong < 0) m.timesWrong = 0; }
            }
            if (last.right) s.right = Math.max(0, s.right - 1);
            else s.wrong = Math.max(0, s.wrong - 1);
            syncCardAcrossDecks(rc.id, dir, rc[dir]);
            save();
        }
    }
    renderDrillCard();
}

function updateDrillStats() {
    const s = State.drillSession;
    if (!s) {
        ['s-left', 's-right', 's-wrong', 's-score'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '–';
        });
        return;
    }
    const left = s.cards.length - s.idx;
    const total = s.right + s.wrong;
    const score = total ? Math.round(s.right / total * 100) : 0;
    const lEl = document.getElementById('s-left');
    if (lEl) lEl.textContent = left;
    const rEl = document.getElementById('s-right');
    if (rEl) rEl.textContent = s.right;
    const wEl = document.getElementById('s-wrong');
    if (wEl) wEl.textContent = s.wrong;
    const sEl = document.getElementById('s-score');
    if (sEl) sEl.textContent = total ? score + '%' : '–';
}

function cancelAutoRestart() {
    if (State.drillCountdownTimer) {
        clearInterval(State.drillCountdownTimer);
        State.drillCountdownTimer = null;
    }
    State.drillCountdownSec = 0;
}

function restartDrillRound() {
    cancelAutoRestart();
    if (typeof gatherCards === 'function') gatherCards();
    startDrill();
}

function endDrill() {
    const s = State.drillSession;
    cancelAutoRestart();

    const total = s.right + s.wrong;
    const score = total ? Math.round(s.right / total * 100) : 0;
    const limit = getSessionLimit();

    const frontEl = document.getElementById('drill-front');
    if (frontEl) frontEl.style.display = 'none';
    const backEl = document.getElementById('drill-back');
    if (backEl) backEl.style.display = 'none';
    const flipBtns = document.getElementById('drill-btns-flip');
    if (flipBtns) flipBtns.style.display = 'none';
    const judgeBtns = document.getElementById('drill-btns-judge');
    if (judgeBtns) judgeBtns.style.display = 'none';

    const comp = document.getElementById('drill-completion');
    if (comp) {
        comp.style.display = 'flex';
        const scoreEl = document.getElementById('drill-completion-score');
        if (scoreEl) scoreEl.textContent = `Score: ${score}% (${s.right} correct, ${s.wrong} missed)`;
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }
    updateDrillStats();

    State.drillCountdownSec = 3;
    const cdEl = document.getElementById('drill-completion-countdown');
    if (cdEl) cdEl.textContent = `Next round of ${limit} cards starting in ${State.drillCountdownSec}s...`;

    State.drillCountdownTimer = setInterval(() => {
        State.drillCountdownSec--;
        if (State.drillCountdownSec <= 0) {
            cancelAutoRestart();
            restartDrillRound();
        } else {
            const el = document.getElementById('drill-completion-countdown');
            if (el) el.textContent = `Next round of ${limit} cards starting in ${State.drillCountdownSec}s...`;
        }
    }, 1000);
}

function editCurrentCard() {
    if (!State.drillSession) return;
    const c = State.drillSession.cards[State.drillSession.idx];
    if (!c) return;
    if (typeof showView === 'function') showView('edit');
    State.editCards = State.deck.cards;
    State.editIdx = State.editCards.findIndex(x => x.id === c.id);
    if (typeof renderEditCard === 'function') renderEditCard();
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (State.drillCountdownTimer) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
            e.preventDefault();
            restartDrillRound();
            return;
        }
    }
    if (e.key === 'ArrowRight' || e.key === 'Enter') flipCard();
    else if (e.key === 'y' || e.key === 'Y') judgeCard(true);
    else if (e.key === 'n' || e.key === 'N') judgeCard(false);
    else if (e.key === 'ArrowLeft') prevCard();
});
