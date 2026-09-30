// Loads the app's browser scripts into an isolated vm context with a minimal
// DOM/localStorage stand-in, so the real code can be exercised under node:test.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = ['js/state.js', 'js/criteria.js', 'js/drill.js', 'js/views.js', 'js/io.js'];

function fakeElement(id) {
    const classes = new Set();
    return {
        id, value: '', textContent: '', innerHTML: '', title: '',
        style: {},
        classList: {
            add: c => classes.add(c), remove: c => classes.delete(c),
            contains: c => classes.has(c), toggle: c => classes.has(c) ? classes.delete(c) : classes.add(c),
        },
        setAttribute() {}, querySelector: () => null, focus() {}, click() {},
    };
}

function createEnv({ storage = {}, files = {} } = {}) {
    const elements = new Map();
    const listeners = {};
    const alerts = [];
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
        createElement: () => fakeElement(''),
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
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    for (const f of SCRIPTS) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
    }
    return {
        ctx, store, alerts, elements, document,
        run: code => vm.runInContext(code, ctx),
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

module.exports = { createEnv, readData };
