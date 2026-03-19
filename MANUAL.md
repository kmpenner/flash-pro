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
This is the "Power User" feature. You can write JavaScript-syntax rules to control which cards appear.

### Available Constants
-   `Now`: Current timestamp.
-   `Frequency`: The frequency value assigned to the card.
-   `TimesRight` / `TimesWrong`: Total career counts.
-   `TimesRightSinceWrong`: Your current success streak.
-   `DateLastRight` / `DateLastWrong`: Timestamps of last interactions.
-   `DaysRightSinceWrong`: Number of days since you last missed the card.

### Example Rules
-   `TimesRight < 5`: High-reinforcement mode.
-   `(Now - DateLastRight) > 86400000`: Cards not seen in over 24 hours.
-   `Frequency > 50`: Master the "High Value" cards.

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

## 💾 Saving & Backups
All data is stored in your browser's **Local Storage**. 
-   **Manual Backup**: Click the **Save Deck** icon in the header to download a `.flashpro.json` file. 
-   **Restoration**: Drag and drop or click the **Folder Open** icon to restore a backup.

---
© 2026 kmpenner. All rights reserved.
