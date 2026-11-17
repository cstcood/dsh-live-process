/* Render the settings page outside the browser to see whether it throws. */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

const store = new Map();
const listeners = new Set();

const documentMock = {
  documentElement: { style: { colorScheme: 'dark' }, setAttribute() {}, removeAttribute() {} },
  body: { hasAttribute: () => false, append() {}, appendChild() {}, addEventListener() {}, removeEventListener() {} },
  head: { append() {}, appendChild() {} },
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {}, textContent: '' }),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener() {},
  removeEventListener() {},
};

let captured = null;

global.window = {
  localStorage: {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key),
  },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  addEventListener() {},
  removeEventListener() {},
  requestAnimationFrame: fn => setTimeout(fn, 0),
  cancelAnimationFrame() {},
  __ModuleLoader__: {
    load(entry) {
      captured = entry;
    },
  },
};
global.document = documentMock;
global.matchMedia = window.matchMedia;
global.MutationObserver = class {
  observe() {}
  disconnect() {}
};
global.Node = { DOCUMENT_POSITION_FOLLOWING: 4, DOCUMENT_POSITION_PRECEDING: 2 };
global.requestAnimationFrame = window.requestAnimationFrame;
global.cancelAnimationFrame = window.cancelAnimationFrame;

const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: init => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useRef: value => ({ current: value }),
  useMemo: fn => fn(),
  useCallback: fn => fn(),
  Component: class Component {
    constructor(props) {
      this.props = props || {};
      this.state = {};
    }
  },
};

const requireMock = name => {
  if (name === 'react') return React;
  if (name === 'react/jsx-runtime') return { jsx: React.createElement, jsxs: React.createElement, Fragment: 'Fragment' };
  return {};
};

new Function('window', 'document', 'MutationObserver', 'Node', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame', src)(
  global.window,
  global.document,
  global.MutationObserver,
  global.Node,
  global.matchMedia,
  global.requestAnimationFrame,
  global.cancelAnimationFrame,
);

if (captured === null) {
  console.log('FAIL: module never registered');
  process.exit(1);
}

const mod = captured.factory(requireMock);
console.log('module keys:', Object.keys(mod));

const ctx = {
  effect(fn) {
    const dispose = fn();
    return () => {
      if (typeof dispose === 'function') dispose();
    };
  },
  slots: {
    inject(_name, fn) {
      return fn();
    },
    register(options, component) {
      if (options && options.name === 'settings.section') {
        global.__page = component;
      }
      return () => {};
    },
  },
  on() {},
  logger: { info() {}, warn() {}, error() {} },
};

try {
  mod.apply(ctx);
  console.log('apply OK');
} catch (error) {
  console.log('apply FAIL:', error && error.message);
  console.log(error && error.stack);
  process.exit(1);
}

if (typeof global.__page !== 'function') {
  console.log('FAIL: settings page never registered');
  process.exit(1);
}

function describe(node, depth = 0, lines = []) {
  if (node === null || node === undefined || typeof node !== 'object') return lines;
  const label = typeof node.type === 'string' ? node.type : (node.type && node.type.name) || String(node.type);
  const cls = node.props && node.props.className ? `.${String(node.props.className).split(' ').join('.')}` : '';
  lines.push(`${'  '.repeat(depth)}${label}${cls}`);
  for (const child of node.children || []) describe(child, depth + 1, lines);
  return lines;
}

try {
  const tree = global.__page();
  console.log('render OK, root =', tree && tree.type, 'children =', tree && tree.children && tree.children.length);
  console.log(describe(tree).slice(0, 40).join('\n'));
} catch (error) {
  console.log('render FAIL:', error && error.message);
  console.log(error && error.stack);
  process.exit(1);
}

process.exit(0);
