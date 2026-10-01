# Flash! Pro — Instruction Manual

Welcome to **Flash! Pro**, a professional flashcard management system for deep learning and mastery. This manual provides a deep dive into every feature of the platform.

---

## 🏗️ Core Concept: The "Gather" Workflow
Unlike simple flashcard apps, Flash! Pro uses a **dynamic query system**:
1.  **Repository**: All your cards live in a central database (Deck).
2.  **Logic (Criteria)**: You define rules (e.g., "Cards I missed today").
3.  **Gather**: You extract a subset based on those rules.
4.  **Session**: You drill only the gathered cards.

---

## 🔘 The Navigation Bar
Access all modules from the top navigation:
-   **Select**: Choose what to study and launch a session.
-   **Drill**: The interactive study interface.
-   **Edit**: Detailed view for individual card management.
-   **Tables**: Spreadsheet-like view for bulk data entry.
-   **Bundles**: Organize cards into specific groups (e.g., "Week 1 Vocabulary").
-   **Criteria**: The Logic Rule Manager for session filtering.
-   **Settings**: Personalize appearance and templates.
-   **I/O**: Import/Export and generate standalone quiz files.

---

## 🔍 Select View
This is your "Session Builder."
1.  **Session Logic**: Choose a pre-defined rule (e.g., "Never Studied").
2.  **Filter by Bundle/Category**: (Optional) Further narrow your session to specific topics.
3.  **Mode**: 
    -   *Front → Back*: Default.
    -   *Back → Front*: Reversed.
    -   *Synchronized (Both)*: Randomly presents both directions within the same session.
4.  **Gather Cards**: Click this to populate your session queue.
5.  **Start Session**: Enter the **Drill** view.

---

## 🧠 Drill View (Learning Mode)
-   **Flip Card**: Press **Enter** or **Right Arrow** (or click "Flip Card").
-   **Judgment**: After flipping, judge your performance:
    -   **CORRECT**: Press **Y** or click green button.
    -   **INCORRECT**: Press **N** or click red button.
-   **Undo**: Press **Left Arrow** to return to the previous card if you made a mistake.
-   **Edit Current**: Click the edit icon to jump straight to the card's details and return to the session.

---

## ⚙️ Criteria & The Logic Rule Manager
This is the "Power User" feature. You write rules, in a language much like a SQL `WHERE` clause, that decide which cards appear and in what order:

```
[condition] [ORDER BY expression [ASC|DESC], ...] [LIMIT n]
```

Every part is optional: an empty rule gathers every card, and `ORDER BY Frequency DESC LIMIT 20` is a complete rule.

### Available Constants
-   `Now`: Current timestamp.
-   `Frequency`: The frequency value assigned to the card.
-   `TimesRight` / `TimesWrong`: Total career counts.
-   `TimesRightSinceWrong`: Your current success streak.
-   `DateLastRight` / `DateLastWrong`: Timestamps of last interactions.
-   `DaysRightSinceWrong`: Number of days since you last missed the card.
-   `DayMs`: One day in milliseconds (86400000), for use with the timestamps.

The counts and dates are for the direction being drilled (front→back or back→front). `LastRightTime` / `LastWrongTime` are accepted as older names for `DateLastRight` / `DateLastWrong`.

### Card Fields
Any other name reads that field of the card: `Front`, `Back`, `Category`, `Num`, or any field an imported deck carries. Use a dot for nested fields, such as `morph.tense` or `ref.book`. A card without the field never matches a comparison on it, and **Run Test** reports a name that no card in the deck has, which catches typos.

Names are not case-sensitive. The words `AND`, `OR`, `NOT`, `LIKE`, `IN`, `BETWEEN`, `ORDER`, `BY`, `ASC`, `DESC` and `LIMIT` are reserved, so a field with one of those names can't be used in a rule.

### Text
Put text in single or double quotes: `'λόγος'` or `"λόγος"`. To include the quote itself, double it: `'it''s'`.

Text is compared in Unicode NFC form, so a letter typed as one precomposed character matches the same letter stored as a base letter plus combining accents.

-   `=` / `<>`: exact match, accents and case included.
-   `LIKE`: SQL wildcards (`%` for any run of characters, `_` for one character). Ignores case but keeps accents: `Front LIKE 'λό%'`.
-   `~=`: a loose match that ignores case, Greek accents and breathings, Hebrew vowel points and cantillation, and the difference between σ and ς. It takes the same wildcards: `Front ~= 'αγ%'` finds ἀγαθός and ἅγιος, and `Front ~= 'שלום'` finds שָׁלוֹם.

### Operators
-   Comparison: `==` (or a single `=`), `!=` (or `<>`), `<`, `<=`, `>`, `>=`, `LIKE`, `~=`
-   Lists and ranges: `x IN (a, b, c)`, `x BETWEEN low AND high` (inclusive)
-   Arithmetic: `+`, `-`, `*`, `/`, `%`
-   Logic: `AND` / `&&`, `OR` / `||`, `NOT` / `!`, with parentheses for grouping. `NOT` also negates `LIKE`, `IN` and `BETWEEN`: `morph.pos NOT IN ('noun', 'adj')`.

### Order and Limit
`ORDER BY` sorts the gathered cards by one or more expressions, each `ASC` (the default) or `DESC`. Cards missing a sort value come last either way. When a rule has `ORDER BY`, it takes precedence over the **Sort** menu, and the menu then only breaks ties. `LIMIT n` keeps the first *n* matches; the session size still applies after it.

### Example Rules
-   `TimesRight < 5`: High-reinforcement mode.
-   `(Now - DateLastRight) > DayMs`: Cards not seen in over 24 hours.
-   `Frequency > 50`: Master the "High Value" cards.
-   `Frequency BETWEEN 200 AND 300`: A frequency band.
-   `morph.tense = 'aor' AND morph.voice IN ('mid', 'pass')`: Aorist middles and passives, in a deck with morphology fields.
-   `Front ~= 'λογ%'`: Every form beginning λογ-, however it is accented.
-   `TimesWrong > 0 ORDER BY TimesWrong DESC LIMIT 20`: Your 20 most-missed cards.

---

## 📥 I/O (Import / Export)
### Importing
1.  Navigate to **I/O**.
2.  Paste list data (TSV from Excel/Sheets works best).
3.  Click **Validate & Map**.
4.  Assign your columns to `Front`, `Back`, etc.
5.  Click **Finalize Import**.

### Standalone Quizzes
You can generate a "Portable Quiz." This is a single, zero-dependency HTML file containing your current gathered cards. 
-   **Usage**: Send this file to your phone or another person. No login or app installation is required to take the quiz.

---

## 🎨 Settings & Templates
Flash! Pro supports **HTML Injection**:
-   **Head Injector**: Add custom CSS (e.g., Google Fonts or styling for specific languages).
-   **Markup Templates**: Use `{{front}}` and `{{back}}` placeholders to wrap your card content in custom HTML structures (e.g., to create multi-column cards).
-   **Typography Scaling**: Adjust font sizes globally for more comfortable reading in session.

---

## 🔄 Cross-Deck Study Synchronization
When studying curated collections such as the *Athenaze* Book I vocabulary:
- **Unified History**: Cards share deterministic identifiers (`ath_${ch}_${idx}`) across both individual chapter decks and the comprehensive Book I Master Deck.
- **Bi-Directional Sync**: Answering or undoing a card in a chapter deck instantly synchronizes its performance metrics (`timesRight`, `timesWrong`, streaks, and timestamps) with the Master Deck (and vice versa).
- **Spaced Repetition**: Intervals calculated by `(NOW - LastRightTime) > (LastRightTime - LastWrongTime)` remain continuous regardless of whether you drill by chapter or across the whole book.
- **Lossless Undo**: Undoing a card judgment (using the Left Arrow or Back button) restores the exact pre-answer snapshot without polluting repetition intervals.

---

## 🔒 Security & Trust Model
Flash! Pro is a zero-backend, client-side application running completely in your browser:
- **Criteria Rules**: Rules are read by a small built-in parser that only understands the constants, card fields and operators listed above. A rule can read card data but cannot change it or run code, including one that arrives in an imported deck file.
- **Template Rendering**: Custom card templates (`{{front}}`, `{{back}}`) and head injections are rendered within `srcdoc` iframes.
- **Trust Warning**: A deck's settings can include custom HTML templates, which are shown in a sandboxed frame with scripts disabled. Even so, only import `.flashpro.json` deck files from sources you trust.

---

## 💾 Saving & Backups
All data is stored in your browser's **Local Storage**. 
-   **Manual Backup**: Click the **Save Deck** icon in the header to download a `.flashpro.json` file. 
-   **Restoration**: Drag and drop or click the **Folder Open** icon to restore a backup.

---
© 2026 kmpenner. All rights reserved.
