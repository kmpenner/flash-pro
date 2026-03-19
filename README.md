# Flash! Pro

**Flash! Pro** is a high-performance, premium flashcard management system designed for deep learning and record management. It combines a sleek, modern interface with a powerful JavaScript-driven criteria engine.

[**🚀 View Live Demo**](https://kmpenner.github.io/flash-pro/)

## ✨ Key Features

- **📂 Multiple Decks**: Manage disparate subjects within a single interface. Switching between decks is seamless.
- **⚙️ Advanced Logic Engine**: Uses custom JavaScript predicates to filter cards for study sessions. You can define rules like "Needs Review (< 3 right)" or "High Frequency (> 10)".
- **🧠 Card Bundles & Categories**: Group cards into specific bundles (e.g., "Greek Vocabulary") and use categories for logical organization.
- **📊 Detailed Analytics**: Every card mission (Front → Back, Back → Front) stores performance metrics like date of last success, times right/wrong, and success streaks.
- **🔄 Import & Export**: Export your data in **TSV**, **CSV**, or **JSON** formats. Bulk import cards from spreadsheets using the "Scan & Map" tool.
- **🧩 Standalone Quizzes**: Generate a portable, interactive HTML quiz file from any selection of cards — perfect for offline study.
- **🎨 Custom Templates**: Personalize card styling with custom HTML headers and templates for front/back faces.
- **🔍 Batch Refactoring**: Advanced find-and-replace tools for bulk editing your collection.

## 🚀 Getting Started

1.  **Open the Live App**: Visit the [GitHub Pages demo](https://kmpenner.github.io/flash-pro/) or open `index.html` in any modern web browser.
2.  **Create/Select a Deck**: Use the header menu to start a new deck or load an existing `.flashpro.json` file.
3.  **Add Cards**: Populate your deck using the **Edit** view or the **I/O** view for bulk imports.
4.  **Define Session Criteria**: Head to **Criteria** to build custom session filters using the built-in Logic Rule Manager.
5.  **Start Studying**: Select your criteria and bundles in the **Select** view, then "Gather Cards" and launch your **Session**.

## 📥 Data Import & Formats

**Flash! Pro** makes it easy to bulk import your existing study materials through the **I/O** view.

### 📝 Supported Formats
- **TSV / CSV**: Copy and paste data directly from spreadsheets (Excel, Google Sheets). The tool automatically detects TAB or COMMA delimiters.
- **JSON**: To restore an entire deck (including all analytics, categories, and settings), use the `.flashpro.json` file format.

### 🗺️ Column Mapping
When importing from text/spreadsheets:
1.  **Paste** your raw data into the ingest buffer.
2.  Click **Validate & Map** to scan the columns.
3.  **Link** each column to a card field (e.g., Column 1 → Front, Column 2 → Back).
4.  Specify a default **Category** if needed, then finalize the import.

## 💻 Technical Stack

- **Core Logic**: Vanilla JavaScript (ES6+)
- **Styling**: Modern CSS3 with a Focus on Glassmorphism aesthetics.
- **Icons**: [Lucide](https://lucide.dev/)
- **Data Persistence**: Local Storage + JSON Export support.

## ⚖️ License

MIT License. Feel free to use and adapt this for your personal learning needs.
