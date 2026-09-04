// =====================================================================
// FLASH! PRO — APPLICATION COORDINATOR & ENTRYPOINT
// =====================================================================

function init() {
    State.decks = Store.load();
    const isLegacyDefault = State.decks.length === 1 &&
        State.decks[0].name === 'My Flashcards' &&
        State.decks[0].cards.length === 5 &&
        State.decks[0].cards[0].front === 'amor';

    if (!State.decks.length || isLegacyDefault) {
        State.decks = createAllAthenazeDecks();
        save();
    } else {
        // Tag legacy Athenaze decks with machine metadata if missing
        for (const d of State.decks) {
            if (!d.src) {
                const m = d.name && d.name.match(/Athenaze Book I — Chapter (\d+)/);
                if (m) d.src = { kind: 'athenaze', ch: parseInt(m[1], 10) };
                else if (d.name && (d.name.includes('Chapters 1–16') || d.name.includes('Book I (Chapters'))) {
                    d.src = { kind: 'athenaze', ch: 'all' };
                }
            }
        }
        if (typeof ATHENAZE_CHAPTERS !== 'undefined') {
            const existingChs = new Set(
                State.decks
                    .filter(d => d.src && d.src.kind === 'athenaze')
                    .map(d => d.src.ch)
            );
            if (existingChs.size > 0 && existingChs.size < ATHENAZE_CHAPTERS.length + 1) {
                let changed = false;
                for (const ch of ATHENAZE_CHAPTERS) {
                    if (!existingChs.has(ch.num)) {
                        State.decks.push(buildAthenazeDeck(ch));
                        existingChs.add(ch.num);
                        changed = true;
                    }
                }
                if (!existingChs.has('all')) {
                    State.decks.push(buildAthenazeMasterDeck());
                    existingChs.add('all');
                    changed = true;
                }
                if (changed) save();
            }
        }
    }

    State.curDeckId = Store.currentId();
    if (!State.deck) State.curDeckId = State.decks[0].id;
    Store.setCur(State.curDeckId);

    const savedLimit = getSessionLimit();
    const elMax = document.getElementById('max-cards');
    if (elMax) elMax.value = savedLimit;
    const elDrillMax = document.getElementById('drill-max-cards');
    if (elDrillMax) elDrillMax.value = savedLimit;

    if (State.deck && State.deck.criteria) {
        const sr = State.deck.criteria.find(c => c.name === 'Spaced Repetition' || c.name === 'Elapsed Time');
        if (sr) {
            sr.name = 'Spaced Repetition';
            sr.logic = '(NOW - LastRightTime) > (LastRightTime - LastWrongTime)';
        }
        if (!State.selCriteriaId && State.deck.criteria.length) {
            State.selCriteriaId = (sr || State.deck.criteria[0]).id;
        }
    }

    // Check for URL query parameters (e.g. ?chapter=1a&drill=1 or ?ch=2b&limit=10)
    try {
        const params = new URLSearchParams(window.location.search);
        const chParam = params.get('chapter') || params.get('ch') || params.get('lesson');
        if (chParam) {
            const m = chParam.trim().match(/^(\d+)\s*([a-zA-Zα-ωΑ-Ω])?$/);
            if (m) {
                const chNum = parseInt(m[1], 10);
                const subLetter = m[2] ? (m[2].toLowerCase() === 'b' || m[2] === 'β' ? 'β' : 'α') : null;
                const targetDeck = State.decks.find(d => (d.src && d.src.kind === 'athenaze' && d.src.ch === chNum) || d.name.includes(`Chapter ${chNum}:`) || d.name.includes(`Chapter ${chNum} `) || d.name.includes(`Chapter ${chNum}α`));
                if (targetDeck) {
                    State.curDeckId = targetDeck.id;
                    Store.setCur(targetDeck.id);
                    State.selBundleIds.clear();
                    if (subLetter) {
                        const targetBundle = targetDeck.bundles.find(b => b.name.includes(`${chNum}${subLetter}`));
                        if (targetBundle) {
                            State.selBundleIds.add(targetBundle.id);
                        }
                    }
                }
            }
        }
        const limitParam = params.get('limit') || params.get('max');
        if (limitParam && !isNaN(limitParam)) {
            const lim = parseInt(limitParam, 10);
            if (lim > 0) {
                localStorage.setItem('flashpro_session_limit', String(lim));
                if (elMax) elMax.value = lim;
                if (elDrillMax) elDrillMax.value = lim;
            }
        }
        const dirParam = params.get('dir');
        if (dirParam && ['fb', 'bf', 'both'].includes(dirParam)) {
            const dirEl = document.getElementById('drill-direction');
            if (dirEl) dirEl.value = dirParam;
        }
    } catch (_) {}

    renderAll();
    gatherCards();

    // Check for direct drill URL query parameter (?drill=1 or ?start=1)
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('drill') === '1' || params.get('start') === '1') {
            startDrill();
        }
    } catch (_) {}
}

init();
