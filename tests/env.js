// Loads the app's browser scripts into an isolated vm context with a minimal
// DOM/localStorage stand-in, so the real code can be exercised under node:test.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = ['js/state.js', 'js/criteria.js', 'js/drill.js', 'js/views.js', 'js/io.js'];
// What index.html loads, in order, when booting the whole app.
const BOOT_SCRIPTS = ['athenaze-data.js', 'data/catalog-data.js', ...SCRIPTS, 'app.js'];

function fakeElement(id, tagName = 'div') {
    const classes = new Set();
    return {
        id, tagName: tagName.toUpperCase(), value: '', textContent: '', innerHTML: '', title: '',
        style: {}, dataset: {},
        classList: {
            add: c => classes.add(c), remove: c => classes.delete(c),
            contains: c => classes.has(c), toggle: c => classes.has(c) ? classes.delete(c) : classes.add(c),
        },
        setAttribute() {}, querySelector: () => null, focus() {}, click() {},
        closest() { return null; },
    };
}

// Minimal parse of the start tags in an HTML string: each tag's attributes,
// decoded as a browser would read them, plus its name under `tag`.
function parseElements(html) {
    const decode = v => v.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, '&');
    const out = [];
    for (const [, tag, body] of html.matchAll(/<([a-z]+)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*>/g)) {
        const attrs = { tag };
        for (const [, name, value = ''] of body.matchAll(/([^\s=>]+)(?:="([^"]*)")?/g)) attrs[name] = decode(value);
        out.push(attrs);
    }
    return out;
}

// The first element whose attributes include all of `where`.
function findElement(html, where) {
    return parseElements(html).find(a => Object.entries(where).every(([k, v]) => a[k] === v)) || null;
}

// {boot: true} loads the whole app as index.html does, running init();
// {search} sets location.search for its URL parameters.
function createEnv({ storage = {}, files = {}, boot = false, search = '' } = {}) {
    const elements = new Map();
    const listeners = {};
    const alerts = [];
    const loadedScripts = [];
    const store = { ...storage };
    const document = {
        documentElement: fakeElement('html'),
        activeElement: null,
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, fakeElement(id));
            return elements.get(id);
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
        createElement: tag => fakeElement('', tag),
        head: {
            // <script> tags added at runtime load from disk, asynchronously.
            appendChild(el) {
                if (el.tagName !== 'SCRIPT') return;
                loadedScripts.push(el.src);
                setTimeout(() => {
                    const p = path.join(ROOT, el.src);
                    if (!fs.existsSync(p)) return el.onerror();
                    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: el.src });
                    el.onload();
                });
            },
        },
    };
    const localStorage = {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
    };
    const fetch = async (url) => {
        if (url in files) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(files[url])) };
        if (files['*'] === 'disk') {
            const p = path.join(ROOT, url);
            if (fs.existsSync(p)) return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
        }
        throw new TypeError('Failed to fetch');
    };
    const sandbox = {
        document, localStorage, fetch, console,
        alert: msg => alerts.push(msg), confirm: () => true,
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
        URL: { createObjectURL: () => 'blob:', revokeObjectURL() {} },
        Blob: class { constructor(parts) { this.text = parts.join(''); } },
        // Test files are passed as { text }; onload fires synchronously.
        FileReader: class { readAsText(f) { this.onload({ target: { result: f.text } }); } },
        setTimeout, clearTimeout, setInterval, clearInterval,
        URLSearchParams, location: { search },
        matchMedia: () => ({ matches: false, addEventListener() {} }),
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    for (const f of boot ? BOOT_SCRIPTS : SCRIPTS) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
    }
    const dispatch = (type, target) => {
        for (const fn of listeners[type] || []) fn({ type, target });
    };
    return {
        ctx, store, alerts, elements, document, loadedScripts,
        run: code => vm.runInContext(code, ctx),
        // Stand-in for an element described by findElement(), to use as an
        // event target: dispatch('click', env.target(attrs)).
        target(attrs, value = '') {
            const el = fakeElement('');
            const camel = k => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            el.value = value;
            for (const [k, v] of Object.entries(attrs)) if (k.startsWith('data-')) el.dataset[camel(k.slice(5))] = v;
            el.closest = sel => {
                const m = sel.match(/^\[data-([a-z-]+)\]$/);
                return m && camel(m[1]) in el.dataset ? el : null;
            };
            return el;
        },
        dispatch,
        key(key) {
            let prevented = false;
            const e = { key, ctrlKey: false, metaKey: false, altKey: false, preventDefault() { prevented = true; } };
            for (const fn of listeners.keydown || []) fn(e);
            return prevented;
        },
    };
}

function readData(file) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

// Resolves after pending timers (e.g. runtime script loads) have run.
const settle = () => new Promise(r => setTimeout(r, 20));

module.exports = { createEnv, readData, parseElements, findElement, settle };
