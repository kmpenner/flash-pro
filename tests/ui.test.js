// Icons ship with the app (no CDN), and icon-only buttons have text labels.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SOURCES = ['index.html', 'app.js', ...fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'icons.js').map(f => 'js/' + f)];

function iconsInUse() {
    const names = new Set();
    for (const f of SOURCES) {
        for (const m of read(f).matchAll(/data-lucide="([^"]+)"/g)) {
            if (m[1].includes('${')) for (const x of m[1].matchAll(/'([a-z0-9-]+)'/g)) names.add(x[1]);
            else names.add(m[1]);
        }
    }
    // Set at runtime by the theme button.
    for (const m of read('js/views.js').match(/THEME_ICONS = \{([^}]*)\}/)[1].matchAll(/'([a-z0-9-]+)'/g)) names.add(m[1]);
    return names;
}

function loadIcons() {
    const ctx = { window: {} };
    vm.runInNewContext(read('js/icons.js') + '\nwindow.__icons = LUCIDE_ICONS;', ctx);
    return ctx.window;
}

test('the page loads its icons locally, not from a CDN', () => {
    for (const f of ['index.html', 'FlashPro.html']) {
        const html = read(f);
        assert.doesNotMatch(html, /unpkg\.com|lucide\.min\.js/, f);
        assert.match(html, /<script src="js\/icons\.js"><\/script>/, f);
        assert.ok(html.indexOf('js/icons.js') < html.indexOf('lucide.createIcons()'), f);
    }
});

test('every icon the app uses is in js/icons.js', () => {
    const { __icons } = loadIcons();
    const missing = [...iconsInUse()].filter(n => !__icons[n]);
    assert.deepEqual(missing, [], 'run scripts/build-icons.js');
});

test('createIcons replaces placeholders with SVG, keeping id, title and class', () => {
    // A minimal DOM, enough for createIcons.
    const made = [];
    const el = (tag, attrs = {}) => {
        const node = {
            tagName: tag, attrs: { ...attrs }, children: [],
            get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); },
            getAttribute(n) { return Object.hasOwn(this.attrs, n) ? this.attrs[n] : null; },
            setAttribute(n, v) { this.attrs[n] = String(v); },
            appendChild(c) { this.children.push(c); },
            replaceWith(n) { made.push([this, n]); },
        };
        return node;
    };
    const placeholders = [el('i', { 'data-lucide': 'play', id: 'theme-icon', class: 'lucide lucide-sun big  spin' }), el('i', { 'data-lucide': 'no-such-icon' })];
    const ctx = { window: {}, document: { querySelectorAll: () => placeholders, createElementNS: (_, tag) => el(tag) } };
    vm.runInNewContext(read('js/icons.js'), ctx);
    ctx.window.lucide.createIcons();
    assert.equal(made.length, 1, 'unknown names are left alone');
    const svg = made[0][1];
    assert.equal(svg.tagName, 'svg');
    assert.equal(svg.attrs.id, 'theme-icon');
    assert.equal(svg.attrs.class, 'lucide lucide-play big spin', 'old icon classes replaced, others kept');
    assert.equal(svg.attrs['aria-hidden'], 'true');
    assert.equal(svg.attrs['data-lucide'], undefined, 'rendered icons are not re-rendered unless renamed');
    assert.ok(svg.children.length > 0);
});

test('every icon-only button has a text label', () => {
    for (const f of ['index.html', 'FlashPro.html']) {
        const html = read(f);
        const iconOnly = [...html.matchAll(/<button([^>]*)>\s*<i data-lucide="[^"]+"[^>]*><\/i>\s*<\/button>/g)];
        assert.ok(iconOnly.length >= 10, 'found the icon-only buttons');
        for (const [, attrs] of iconOnly) {
            assert.match(attrs, /aria-label="[^"]+"/, attrs.trim());
            assert.match(attrs, /title="[^"]+"/, attrs.trim());
        }
    }
});

test('index.html and FlashPro.html stay identical', () => {
    assert.equal(read('index.html'), read('FlashPro.html'));
});
