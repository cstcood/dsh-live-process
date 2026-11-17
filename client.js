/**
 * Live-process presentation for the Chat transcript, with a settings page.
 *
 * Two jobs:
 * 1. Drive each foldable process block through its own disclosure control so it
 *    opens while running and folds back once it settles (or stays open / stays
 *    folded, per the configured rule).
 * 2. Give every transcript block kind a distinct treatment — accent bar, tinted
 *    surface, radius, padding, font — all configurable from Settings, with a
 *    separate palette for the dark and the light application theme.
 *
 * The Chat and Tool packages own the disclosure state and expose no setting for
 * it, so this module watches the rendered rows and clicks their own controls.
 * Configuration lives in localStorage: it is a browser-side presentation
 * preference, it applies without a Host restart, and it survives reloads.
 */
window.__ModuleLoader__.load({
  id: '@cstcood/dsh-live-process',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const RETRY_MS = 400;
    const MAX_ATTEMPTS = 4;
    const VERSION = '1.7.3';
    const STYLE_ID = 'dsh-live-process-blocks';
    const STORE_KEY = 'dsh-live-process:config';
    const MARK = 'data-dsh-block';

    const FOLD_MODES = [
      { id: 'auto', label: '运行时展开，结束后折叠' },
      { id: 'expand', label: '全部展开' },
      { id: 'collapse', label: '全部折叠' },
      { id: 'off', label: '不干预' },
    ];

    /** Which palette the styles use. `auto` follows the application theme. */
    const SCHEME_MODES = [
      { id: 'auto', label: '跟随界面', title: '界面切到暗色就用暗色套，切到浅色就用浅色套' },
      { id: 'dark', label: '暗色', title: '始终使用暗色套配色' },
      { id: 'light', label: '浅色', title: '始终使用浅色套配色' },
    ];

    /** Per-block override of the global fold rule. */
    const BLOCK_MODES = [
      { id: 'inherit', label: '跟随全局', title: '使用上方折叠规则' },
      { id: 'expand', label: '展开', title: '新出现的行一律展开' },
      { id: 'collapse', label: '折叠', title: '新出现的行一律折叠' },
      { id: 'auto', label: '运行时', title: '运行时展开，结束后折叠' },
      { id: 'off', label: '不干预', title: '不碰展开状态' },
    ];

    /**
     * When a finished row folds. `onEnd` folds the moment the row stops
     * producing; `onNext` keeps it open until the next process row arrives, so
     * the row you are reading never collapses out from under you.
     */
    const FOLD_TIMINGS = [
      { id: 'onNext', label: '下一条出现时', title: '结束后保持展开，等下一行过程出现再折叠' },
      { id: 'onEnd', label: '结束即折叠', title: '一行停止运行就立刻折叠' },
    ];

    // ------------------------------------------------------------- block kinds

    /** Whether any process row in the transcript is still producing. */
    function anyLive() {
      return document.querySelector(
        '[data-variant="think"][data-state="running"],'
        + ' [data-tool][data-state="running"],'
        + ' [data-tool][data-state="preparing"],'
        + ' [data-variant="others"][data-state="running"]',
      ) !== null;
    }

    /**
     * A context injection carries no running state of its own: it arrives fully
     * formed and never changes again, so there is nothing to poll for "still
     * producing". Treat a row as live for a short window after it first shows
     * up instead — it opens on arrival and folds itself once the window closes.
     */
    const CONTEXT_LIVE_MS = 3000;
    const firstSeen = new WeakMap();
    let primed = false;

    function contextLive(row) {
      const seen = firstSeen.get(row);
      if (seen === undefined) {
        // Rows already on screen when the driver starts are history, not news.
        firstSeen.set(row, primed ? Date.now() : 0);
        return primed;
      }
      return Date.now() - seen < CONTEXT_LIVE_MS;
    }

    const BLOCK_DEFS = [
      {
        key: 'think',
        label: '思考块',
        hint: '模型推理过程行',
        group: 'process',
        dark: { color: '#8b7cf6', bg: 7 },
        light: { color: '#6d4fd8', bg: 9 },
        on: true,
        foldable: true,
        leaf: true,
        timed: true,
        rows: () => document.querySelectorAll('[data-variant="think"]'),
        live: row => row.getAttribute('data-state') === 'running',
      },
      {
        key: 'tool',
        label: '工具块',
        hint: '工具调用行（最外层）',
        group: 'process',
        dark: { color: '#2f9e6e', bg: 6 },
        light: { color: '#1f8a5c', bg: 8 },
        on: true,
        foldable: true,
        leaf: true,
        timed: true,
        rows: () => [...document.querySelectorAll('[data-tool]')]
          .filter(row => row.parentElement?.closest('[data-tool]') === null),
        live: row => {
          const state = row.getAttribute('data-state');
          return state === 'running' || state === 'preparing';
        },
      },
      {
        key: 'command',
        label: '命令卡',
        hint: '其他命令输出卡片',
        group: 'process',
        dark: { color: '#c98a2e', bg: 6 },
        light: { color: '#b06f14', bg: 8 },
        on: true,
        foldable: true,
        leaf: true,
        timed: true,
        rows: () => document.querySelectorAll('[data-variant="others"]:not([data-tool])'),
        live: row => {
          const state = row.getAttribute('data-state');
          return state === 'running' || state === 'preparing';
        },
      },
      {
        key: 'context',
        label: '上下文注入',
        hint: '技能目录 / 指令 / 回忆',
        group: 'process',
        dark: { color: '#3b82c4', bg: 5 },
        light: { color: '#2a6fb0', bg: 7 },
        on: true,
        foldable: true,
        leaf: true,
        // No timer: an injection is part of building the request, and the host
        // records no start or end for it. A number here would be invented.
        timed: false,
        // The injection body only exists while the row is open, so it cannot be
        // used to find the row: a collapsed row would never be discovered and
        // therefore never opened. Locate the seat by node kind instead, then take
        // the disclosure root inside it.
        rows: () => [...document.querySelectorAll('[data-chat-flow-kind="context"]')]
          .map(seat => seat.querySelector('[data-disclosure-header]')?.parentElement ?? null)
          .filter(row => row !== null),
        live: row => contextLive(row),
      },
      {
        key: 'compaction',
        label: '压缩标记',
        hint: '历史压缩提示行',
        group: 'process',
        dark: { color: '#8a8f98', bg: 5 },
        light: { color: '#6b7280', bg: 7 },
        on: true,
        foldable: true,
        rows: () => [...document.querySelectorAll('[data-compaction-icon]')]
          .map(marker => marker.closest('button')?.parentElement ?? null)
          .filter(row => row !== null),
        live: () => false,
      },
      {
        key: 'process',
        label: '过程组',
        hint: '轮次过程分组容器',
        group: 'process',
        dark: { color: '#7a6bd8', bg: 4 },
        light: { color: '#5b4bc4', bg: 6 },
        on: true,
        foldable: true,
        rows: () => document.querySelectorAll('[data-turn-process]'),
        live: row => row.hasAttribute('data-open'),
      },
      {
        key: 'tail',
        label: '轮次尾部',
        hint: '轮次结束操作区',
        group: 'other',
        dark: { color: '#8a8f98', bg: 0 },
        light: { color: '#6b7280', bg: 0 },
        on: false,
        foldable: false,
        rows: () => document.querySelectorAll('[data-turn-tail]'),
        live: () => false,
      },
      {
        key: 'user',
        label: '用户气泡',
        hint: '你发出的消息',
        group: 'other',
        dark: { color: '#4a86c8', bg: 5 },
        light: { color: '#2f6fb0', bg: 7 },
        on: false,
        foldable: false,
        rows: () => document.querySelectorAll('[data-message-bubble]'),
        live: () => false,
      },
      {
        key: 'running',
        label: '运行状态',
        hint: '生成中提示条',
        group: 'other',
        dark: { color: '#2f9e6e', bg: 0 },
        light: { color: '#1f8a5c', bg: 0 },
        on: false,
        foldable: false,
        rows: () => document.querySelectorAll('[data-chat-running]'),
        live: () => false,
      },
      {
        key: 'queue',
        label: '队列面板',
        hint: '排队中的消息',
        group: 'other',
        dark: { color: '#8a8f98', bg: 4 },
        light: { color: '#6b7280', bg: 6 },
        on: false,
        foldable: false,
        rows: () => document.querySelectorAll('[data-queue-dock]'),
        live: () => false,
      },
      {
        key: 'todo',
        label: '待办面板',
        hint: '任务清单',
        group: 'other',
        dark: { color: '#c98a2e', bg: 4 },
        light: { color: '#b06f14', bg: 6 },
        on: false,
        foldable: false,
        rows: () => document.querySelectorAll('[data-testid="todo-panel"]'),
        live: () => false,
      },
      {
        key: 'steering',
        label: '插话消息',
        hint: '待处理的插话',
        group: 'other',
        dark: { color: '#c98a2e', bg: 4 },
        light: { color: '#b06f14', bg: 6 },
        on: false,
        foldable: false,
        rows: () => document.querySelectorAll('[data-pending-steering]'),
        live: () => false,
      },
    ];

    const SCHEME_IDS = ['dark', 'light'];

    const COMMON_DEFAULTS = {
      dark: { liveBg: 13, barWidth: 3, radius: 8, padBlock: 7, padInline: 12, padLeft: 14, codeBg: 12, codeBlockBg: 8, fontFamily: '' },
      light: { liveBg: 18, barWidth: 3, radius: 8, padBlock: 7, padInline: 12, padLeft: 14, codeBg: 12, codeBlockBg: 8, fontFamily: '' },
    };

    const COMMON_RANGES = {
      liveBg: [0, 60],
      barWidth: [0, 8],
      radius: [0, 20],
      padBlock: [0, 24],
      padInline: [0, 40],
      padLeft: [0, 40],
      codeBg: [0, 40],
      codeBlockBg: [0, 40],
    };

    const HEX = /^#[0-9a-f]{6}$/i;

    function clamp(value, low, high) {
      return Math.min(high, Math.max(low, value));
    }

    function defaultScheme(id) {
      return {
        common: { ...COMMON_DEFAULTS[id] },
        blocks: Object.fromEntries(
          BLOCK_DEFS.map(def => [def.key, { on: def.on, color: def[id].color, bg: def[id].bg, fontSize: 0 }]),
        ),
      };
    }

    function sanitizeScheme(raw, id) {
      const out = defaultScheme(id);
      if (raw === null || typeof raw !== 'object') return out;

      const common = raw.common;
      if (common !== null && typeof common === 'object') {
        for (const [key, [low, high]] of Object.entries(COMMON_RANGES)) {
          const value = Number(common[key]);
          if (Number.isFinite(value)) out.common[key] = clamp(Math.round(value), low, high);
        }
        if (typeof common.fontFamily === 'string') out.common.fontFamily = common.fontFamily.slice(0, 120);
      }

      const blocks = raw.blocks;
      if (blocks !== null && typeof blocks === 'object') {
        for (const def of BLOCK_DEFS) {
          const source = blocks[def.key];
          if (source === null || typeof source !== 'object') continue;
          const target = out.blocks[def.key];
          if (typeof source.on === 'boolean') target.on = source.on;
          if (typeof source.color === 'string' && HEX.test(source.color)) target.color = source.color;
          const bg = Number(source.bg);
          if (Number.isFinite(bg)) target.bg = clamp(Math.round(bg), 0, 40);
          const fontSize = Number(source.fontSize);
          if (Number.isFinite(fontSize)) target.fontSize = clamp(Math.round(fontSize), 0, 24);
        }
      }
      return out;
    }

    function sanitize(raw) {
      const out = {
        foldMode: 'auto',
        foldTiming: 'onNext',
        foldLast: false,
        showTimer: true,
        schemeMode: 'auto',
        modes: Object.fromEntries(BLOCK_DEFS.map(def => [def.key, 'inherit'])),
        schemes: { dark: defaultScheme('dark'), light: defaultScheme('light') },
      };
      if (raw === null || typeof raw !== 'object') return out;
      if (FOLD_MODES.some(mode => mode.id === raw.foldMode)) out.foldMode = raw.foldMode;
      if (FOLD_TIMINGS.some(mode => mode.id === raw.foldTiming)) out.foldTiming = raw.foldTiming;
      if (typeof raw.foldLast === 'boolean') out.foldLast = raw.foldLast;
      if (typeof raw.showTimer === 'boolean') out.showTimer = raw.showTimer;
      if (SCHEME_MODES.some(mode => mode.id === raw.schemeMode)) out.schemeMode = raw.schemeMode;

      // v1 stored one palette at the top level: copy it into both schemes.
      const legacy = raw.common !== undefined || raw.blocks !== undefined
        ? { common: raw.common, blocks: raw.blocks }
        : null;
      if (legacy !== null) {
        out.schemes.dark = sanitizeScheme(legacy, 'dark');
        out.schemes.light = sanitizeScheme(legacy, 'light');
      }

      const schemes = raw.schemes;
      if (schemes !== null && typeof schemes === 'object') {
        for (const id of SCHEME_IDS) {
          if (schemes[id] !== undefined) out.schemes[id] = sanitizeScheme(schemes[id], id);
        }
      }

      // v1 kept the fold override inside each block; v2 keeps it palette-neutral.
      const modes = raw.modes;
      if (modes !== null && typeof modes === 'object') {
        for (const def of BLOCK_DEFS) {
          if (BLOCK_MODES.some(mode => mode.id === modes[def.key])) out.modes[def.key] = modes[def.key];
        }
      } else {
        const blocks = raw.blocks;
        if (blocks !== null && typeof blocks === 'object') {
          for (const def of BLOCK_DEFS) {
            const source = blocks[def.key];
            if (source === null || typeof source !== 'object') continue;
            if (BLOCK_MODES.some(mode => mode.id === source.mode)) out.modes[def.key] = source.mode;
            else if (source.fold === false) out.modes[def.key] = 'off';
          }
        }
      }
      return out;
    }

    function read() {
      try {
        const text = window.localStorage.getItem(STORE_KEY);
        return text === null ? sanitize(null) : sanitize(JSON.parse(text));
      } catch {
        return sanitize(null);
      }
    }

    let config = read();
    const listeners = new Set();

    function emit() {
      for (const listener of [...listeners]) listener();
    }

    function update(patch) {
      const next = { ...config, ...patch };
      if (patch.modes !== undefined) next.modes = { ...config.modes, ...patch.modes };
      if (patch.schemes !== undefined) next.schemes = { ...config.schemes, ...patch.schemes };
      config = sanitize(next);
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(config));
      } catch {
        /* storage unavailable: the in-memory value still applies */
      }
      emit();
    }

    function resetAll() {
      config = sanitize(null);
      try {
        window.localStorage.removeItem(STORE_KEY);
      } catch {
        /* nothing to clear */
      }
      emit();
    }

    function resetScheme(id) {
      update({ schemes: { [id]: defaultScheme(id) } });
    }

    function subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }

    // ---------------------------------------------------------- theme detection

    /** The application's resolved color scheme, as the theme presenter applied it. */
    function detectScheme() {
      const declared = document.documentElement.style.colorScheme;
      if (declared === 'dark' || declared === 'light') return declared;
      if (document.body !== null && document.body.hasAttribute('data-ds-dark-theme')) return 'dark';
      return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }

    /** The palette currently in force. */
    function activeScheme() {
      if (config.schemeMode === 'dark' || config.schemeMode === 'light') return config.schemeMode;
      return detectScheme();
    }

    function cssText(current, id) {
      const scheme = current.schemes[id];
      const family = scheme.common.fontFamily.replace(/["\\{};]/g, '').trim();
      const rules = [];
      const liveSelectors = [];

      // The upstream rows style themselves through CSS-module classes that sit
      // at the same specificity as a single attribute selector, so a plain
      // [data-dsh-block="think"] loses to `.root_x[data-variant="think"]`. The
      // doubled attribute keeps every rule one notch above the host's own.
      const self = key => `[${MARK}][${MARK}="${key}"]`;

      for (const def of BLOCK_DEFS) {
        const block = scheme.blocks[def.key];
        if (!block.on) continue;
        const lines = [
          `${self(def.key)} {`,
          `  --dsh-live-accent: ${block.color};`,
          `  box-shadow: inset ${scheme.common.barWidth}px 0 0 0 var(--dsh-live-accent);`,
          `  background: color-mix(in srgb, var(--dsh-live-accent) ${block.bg}%, transparent);`,
          `  border-radius: ${scheme.common.radius}px;`,
          `  padding: ${scheme.common.padBlock}px ${scheme.common.padInline}px ${scheme.common.padBlock}px ${scheme.common.padLeft}px;`,
        ];
        if (block.fontSize > 0) lines.push(`  font-size: ${block.fontSize}px;`);
        if (family !== '') lines.push(`  font-family: ${family};`);
        lines.push('}');
        rules.push(lines.join('\n'));

        if (def.key === 'think') liveSelectors.push(`${self('think')}[data-state="running"]`);
        if (def.key === 'tool' || def.key === 'command') {
          liveSelectors.push(`${self(def.key)}[data-state="running"]`);
          liveSelectors.push(`${self(def.key)}[data-state="preparing"]`);
        }
        if (def.key === 'process') liveSelectors.push(`${self('process')}[data-open]`);
      }

      if (liveSelectors.length > 0) {
        rules.push([
          liveSelectors.join(',\n'),
          '{',
          `  background: color-mix(in srgb, var(--dsh-live-accent) ${scheme.common.liveBg}%, transparent);`,
          '}',
        ].join('\n'));
      }

      // Inline code and code blocks keep the page surface, which reads as a white
      // patch on top of a tinted process block. Pull them onto a neutral veil
      // instead: the label colour darkens in the light scheme and lightens in
      // the dark one, so the chip reads as grey on either tint without fighting
      // the block's accent.
      const accent = 'var(--dsh-live-accent, var(--dsw-alias-label-primary))';
      const scope = `[${MARK}][${MARK}]`;
      rules.push([
        `${scope} :is(code, kbd, samp) {`,
        `  background: color-mix(in srgb, var(--dsw-alias-label-primary) ${scheme.common.codeBg}%, transparent);`,
        '  color: inherit;',
        '  border-radius: 4px;',
        '  padding: 1px 5px;',
        '  box-shadow: none;',
        '}',
        `${scope} pre {`,
        `  background: color-mix(in srgb, var(--dsw-alias-label-primary) ${scheme.common.codeBlockBg}%, transparent);`,
        '  border-radius: 6px;',
        '  box-shadow: none;',
        '}',
        `${scope} pre :is(code, kbd, samp) {`,
        '  background: none;',
        '  color: inherit;',
        '  padding: 0;',
        '}',
      ].join('\n'));

      // The disclosure header paints the page surface, so a tinted row turns
      // into a white band the moment it opens. Let the row's own tint show
      // through, and keep the hover feedback in the block's accent instead.
      // The reasoning header carries an extra open-state rule of its own, which
      // outranks the doubled attribute, so this block goes one level deeper.
      const deep = `[${MARK}][${MARK}][${MARK}]`;
      rules.push([
        `${deep} [data-open],`,
        `${deep} [data-disclosure-header],`,
        `${deep} [data-disclosure-row] {`,
        '  background: transparent;',
        '}',
        `${deep} [data-disclosure-header]:hover,`,
        `${deep} [data-disclosure-row]:hover {`,
        `  background: color-mix(in srgb, ${accent} 8%, transparent);`,
        '}',
      ].join('\n'));

      // The expanded body is a third surface: the disclosure renders it as a
      // sibling of the header and the row, and it brings its own page-coloured
      // panel. Clear it too, otherwise opening a tinted row reveals a white
      // slab underneath the header.
      rules.push([
        `${deep} [data-open] > :not([data-disclosure-header]):not([data-disclosure-row]) {`,
        '  background: transparent;',
        '}',
      ].join('\n'));

      // The context-injection row is a disclosure whose own container already
      // carries the transcript gutter, so the shared padding pushes its tinted
      // surface past the rows above and below it. Keep the tint, drop the inset,
      // and pin the box so the tint cannot grow past its own column.
      if (scheme.blocks.context.on) {
        rules.push([
          `${self('context')} {`,
          '  padding: 2px 8px 2px 10px;',
          '  margin: 0;',
          '  box-sizing: border-box;',
          '  max-width: 100%;',
          '}',
        ].join('\n'));
      }

      return rules.join('\n');
    }

    // ------------------------------------------------------- settings page CSS

    const TIMER_CSS = `
.dte-timer {
  margin-left: 8px;
  flex: none;
  font-size: 11px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
  opacity: 0.85;
}
.dte-timer[data-live="true"] {
  color: var(--dsw-alias-state-business-primary);
  opacity: 1;
}
`;

    const SETTINGS_CSS = `
.dte-page { display: flex; flex-direction: column; gap: 12px; padding: 2px 0 28px; }
.dte-stamp { font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.dte-stack { margin: 0; padding: 8px 10px; border-radius: 6px; background: var(--dsw-alias-bg-module-platform); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; color: var(--dsw-alias-label-secondary); max-height: 180px; overflow: auto; }
.dte-card {
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3);
  overflow: hidden;
}
.dte-card-pad { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.dte-group {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 11px 14px; margin: 0; border: 0; background: transparent;
  font: inherit; text-align: left; cursor: pointer;
  color: var(--dsw-alias-label-primary);
  transition: background .14s ease;
}
.dte-group:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.dte-group-title { font-size: 13px; font-weight: 600; letter-spacing: .01em; }
.dte-count {
  font-size: 11px; line-height: 16px; padding: 0 7px; border-radius: 999px;
  color: var(--dsw-alias-label-tertiary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);
}
.dte-chev {
  margin-left: auto; flex: none; font-size: 10px; line-height: 1;
  color: var(--dsw-alias-label-tertiary);
  transition: transform .16s ease;
}
.dte-chev[data-open="true"] { transform: rotate(90deg); }
.dte-group-body {
  display: flex; flex-direction: column; gap: 8px;
  padding: 0 12px 12px;
}
.dte-block {
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 8px;
  background: var(--dsw-alias-bg-module-platform);
  overflow: hidden;
}
.dte-block-head { display: flex; align-items: center; gap: 8px; padding: 7px 10px; }
.dte-block-open {
  display: flex; align-items: center; gap: 8px; flex: 1 1 auto; min-width: 0;
  padding: 2px 0; margin: 0; border: 0; background: transparent;
  font: inherit; text-align: left; cursor: pointer;
  color: var(--dsw-alias-label-primary);
}
.dte-dot {
  width: 10px; height: 10px; border-radius: 3px; flex: none;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #000 14%, transparent);
}
.dte-block-name { font-size: 13px; font-weight: 500; flex: none; }
.dte-block-hint {
  font-size: 11px; color: var(--dsw-alias-label-tertiary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
}
.dte-block-body {
  display: flex; flex-direction: column; gap: 8px;
  padding: 4px 10px 10px;
  border-top: 0.5px solid var(--dsw-alias-border-l4);
}
.dte-switch { position: relative; flex: none; width: 32px; height: 18px; display: block; }
.dte-switch input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.dte-switch span {
  position: absolute; inset: 0; border-radius: 999px; pointer-events: none;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent);
  transition: background .16s ease;
}
.dte-switch span::after {
  content: ''; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
  border-radius: 50%; background: #fff;
  box-shadow: 0 1px 2px color-mix(in srgb, #000 28%, transparent);
  transition: transform .16s ease;
}
.dte-switch input:checked + span { background: var(--dsw-alias-state-business-primary); }
.dte-switch input:checked + span::after { transform: translateX(14px); }
.dte-switch input:focus-visible + span { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.dte-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dte-row-main { display: flex; flex-direction: column; gap: 2px; flex: 1 1 220px; min-width: 0; }
.dte-row-label { font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-primary); }
.dte-row-hint { font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
.dte-label { font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary); min-width: 64px; }
.dte-input {
  height: 28px; padding: 0 8px; font: inherit; font-size: 12px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-3);
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 6px; box-sizing: border-box;
  transition: border-color .14s ease;
}
.dte-input:focus { outline: none; border-color: var(--dsw-alias-state-business-primary); }
.dte-swatch {
  width: 40px; height: 28px; padding: 2px; flex: none; cursor: pointer;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 6px; background: var(--dsw-alias-bg-layer-3);
  box-sizing: border-box;
}
.dte-range { flex: 1 1 130px; min-width: 110px; accent-color: var(--dsw-alias-state-business-primary); }
.dte-val { font-size: 11px; color: var(--dsw-alias-label-tertiary); min-width: 38px; text-align: right; font-variant-numeric: tabular-nums; }
.dte-seg { display: flex; gap: 6px; flex-wrap: wrap; }
.dte-seg button {
  padding: 6px 12px; font: inherit; font-size: 12px; line-height: 1.4;
  border-radius: 999px; cursor: pointer;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  border: 0.5px solid var(--dsw-alias-border-l4);
  transition: background .14s ease, color .14s ease, border-color .14s ease;
}
.dte-seg button:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }
.dte-seg button[aria-checked="true"] {
  color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);
  border-color: var(--dsw-alias-state-business-primary);
}
.dte-seg-sm button { padding: 4px 10px; font-size: 11px; }
.dte-hint { margin: 0; font-size: 11px; line-height: 1.6; color: var(--dsw-alias-label-tertiary); }
.dte-diag { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px 14px; }
.dte-diag-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dte-diag-row .dte-val { font-size: 12px; color: var(--dsw-alias-label-primary); }
.dte-diag-detail { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
.dte-diag-line { display: block; padding: 8px 10px; border-radius: 6px; background: var(--dsw-alias-bg-module-platform); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; color: var(--dsw-alias-label-secondary); }
.dte-check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dte-preview { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 8px; background: var(--dsw-alias-bg-module-platform); }
.dte-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.dte-reset {
  align-self: flex-start; padding: 6px 14px; font: inherit; font-size: 12px;
  border-radius: 999px; cursor: pointer;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  border: 0.5px solid var(--dsw-alias-border-l4);
  transition: background .14s ease, color .14s ease;
}
.dte-reset:hover { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }
.dte-badge {
  font-size: 11px; line-height: 16px; padding: 0 7px; border-radius: 999px;
  color: var(--dsw-alias-label-secondary);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);
}
`;

    // ---------------------------------------------------------------- settings

    function Row(props) {
      return h('div', { className: 'dte-row' }, props.children);
    }

    function Chevron(props) {
      return h('span', { className: 'dte-chev', 'data-open': props.open ? 'true' : 'false', 'aria-hidden': true }, '▶');
    }

    function ColorField(props) {
      const [draft, setDraft] = React.useState(props.value);
      React.useEffect(() => {
        setDraft(props.value);
      }, [props.value]);
      return h(
        Row,
        null,
        h('span', { className: 'dte-label' }, props.label),
        h('input', {
          type: 'color',
          className: 'dte-swatch',
          value: props.value,
          'aria-label': `${props.label}颜色`,
          onChange: event => {
            props.onChange(event.target.value);
          },
        }),
        h('input', {
          type: 'text',
          spellCheck: false,
          className: 'dte-input',
          style: { width: '96px' },
          value: draft,
          'aria-label': `${props.label}颜色十六进制`,
          onChange: event => {
            const next = event.target.value;
            setDraft(next);
            if (HEX.test(next)) props.onChange(next);
          },
          onBlur: () => {
            setDraft(props.value);
          },
        }),
      );
    }

    function SliderField(props) {
      return h(
        Row,
        null,
        h('span', { className: 'dte-label' }, props.label),
        h('input', {
          type: 'range',
          min: props.min,
          max: props.max,
          step: 1,
          className: 'dte-range',
          value: props.value,
          'aria-label': props.label,
          onChange: event => {
            props.onChange(Number(event.target.value));
          },
        }),
        h('span', { className: 'dte-val' }, props.suffix === undefined ? String(props.value) : `${props.value}${props.suffix}`),
      );
    }

    function NumberField(props) {
      return h(
        Row,
        null,
        h('span', { className: 'dte-label' }, props.label),
        h('input', {
          type: 'number',
          min: props.min,
          max: props.max,
          step: 1,
          className: 'dte-input',
          style: { width: '68px' },
          value: props.value,
          'aria-label': props.label,
          onChange: event => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) props.onChange(next);
          },
        }),
        props.hint === undefined ? null : h('span', { className: 'dte-hint' }, props.hint),
      );
    }

    function Switch(props) {
      return h(
        'label',
        { className: 'dte-switch', title: props.title },
        h('input', {
          type: 'checkbox',
          checked: props.checked,
          'aria-label': props.title,
          onChange: event => {
            props.onChange(event.target.checked);
          },
        }),
        h('span', null),
      );
    }

    function BlockCard(props) {
      const { def, block, mode, onChange, onModeChange } = props;
      const [open, setOpen] = React.useState(false);
      return h(
        'div',
        { className: 'dte-block' },
        h(
          'div',
          { className: 'dte-block-head' },
          h(
            'button',
            {
              type: 'button',
              className: 'dte-block-open',
              'aria-expanded': open,
              onClick: () => {
                setOpen(value => !value);
              },
            },
            h('span', { className: 'dte-dot', style: { background: block.on ? block.color : 'transparent', boxShadow: block.on ? undefined : 'inset 0 0 0 1px var(--dsw-alias-border-l4)' } }),
            h('span', { className: 'dte-block-name' }, def.label),
            h('span', { className: 'dte-block-hint' }, def.hint),
            h(Chevron, { open }),
          ),
          h(Switch, {
            checked: block.on,
            title: `${def.label}启用`,
            onChange: value => {
              onChange({ on: value });
            },
          }),
        ),
        open
          ? h(
            'div',
            { className: 'dte-block-body' },
            h(ColorField, {
              label: '颜色',
              value: block.color,
              onChange: value => {
                onChange({ color: value });
              },
            }),
            h(SliderField, {
              label: '底色',
              min: 0,
              max: 40,
              value: block.bg,
              suffix: '%',
              onChange: value => {
                onChange({ bg: value });
              },
            }),
            h(NumberField, {
              label: '字号',
              min: 0,
              max: 24,
              value: block.fontSize,
              hint: '0 = 继承',
              onChange: value => {
                onChange({ fontSize: value });
              },
            }),
            def.foldable
              ? h(
                'div',
                { className: 'dte-row' },
                h('span', { className: 'dte-label' }, '展开策略'),
                h(
                  'div',
                  { className: 'dte-seg dte-seg-sm', role: 'radiogroup', 'aria-label': `${def.label}展开策略` },
                  BLOCK_MODES.map(item =>
                    h(
                      'button',
                      {
                        key: item.id,
                        type: 'button',
                        role: 'radio',
                        title: item.title,
                        'aria-checked': mode === item.id,
                        onClick: () => {
                          onModeChange(item.id);
                        },
                      },
                      item.label,
                    ),
                  ),
                ),
              )
              : null,
          )
          : null,
      );
    }

    function Group(props) {
      const [open, setOpen] = React.useState(props.defaultOpen);
      return h(
        'section',
        { className: 'dte-card' },
        h(
          'button',
          {
            type: 'button',
            className: 'dte-group',
            'aria-expanded': open,
            onClick: () => {
              setOpen(value => !value);
            },
          },
          h('span', { className: 'dte-group-title' }, props.title),
          props.badge === undefined ? null : h('span', { className: 'dte-badge' }, props.badge),
          h('span', { className: 'dte-count' }, String(props.count)),
          h(Chevron, { open }),
        ),
        open ? h('div', { className: 'dte-group-body' }, props.children) : null,
      );
    }

    /** Live DOM census for the diagnostics card: what the driver actually sees. */
    function sampleRows() {
      const all = selector => [...document.querySelectorAll(selector)];
      const opened = selector => all(selector).filter(row => {
        const flagged = row.querySelector('[aria-expanded]');
        return flagged !== null && flagged.getAttribute('aria-expanded') === 'true';
      }).length;
      const tools = all('[data-tool]');
      // Per-row detail for the newest tool rows: which tool, what state it is in,
      // whether it exposes a disclosure control at all, and whether that control
      // reports open. That triple is the whole expand decision, so printing it
      // turns "it does not expand" into a concrete failing term.
      const detail = tools.slice(-10).map(row => {
        const name = row.getAttribute('data-tool') ?? '?';
        const state = row.getAttribute('data-state') ?? '?';
        const hasControl = row.querySelector('[data-disclosure-row][aria-expanded]') !== null;
        const header = row.querySelector('[data-disclosure-header]');
        const root = header === null ? null : header.parentElement;
        const open = root !== null && root.hasAttribute('data-open');
        return `${name} ${state} ${hasControl ? (open ? '开' : '关') : '无控件'}`;
      });
      return {
        think: all('[data-variant="think"]').length,
        thinkOpen: opened('[data-variant="think"]'),
        tool: tools.length,
        toolOpen: opened('[data-tool]'),
        toolRunning: tools.filter(row => row.getAttribute('data-state') === 'running').length,
        toolPreparing: tools.filter(row => row.getAttribute('data-state') === 'preparing').length,
        toolExpandable: tools.filter(row => row.querySelector('[data-disclosure-row][aria-expanded]') !== null).length,
        command: all('[data-variant="others"]').length,
        context: all('[data-context-injection-body]').length,
        pinned: scrollCensus().pinned,
        jumps: scrollCensus().jumps,
        detail: detail.join(' · '),
      };
    }

    function scrollCensus() {
      const scroller = document.querySelector('[data-conversation-scroll]');
      const state = scroller === null ? undefined : pinStates.get(scroller);
      if (state === undefined) return { pinned: false, jumps: 0 };
      return { pinned: state.pinned, jumps: state.jumps };
    }

    function Preview(props) {
      const scheme = props.scheme;
      const family = scheme.common.fontFamily.replace(/["\\{};]/g, '').trim();
      return h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: `${scheme.common.padBlock}px ${scheme.common.padInline}px ${scheme.common.padBlock}px ${scheme.common.padLeft}px`,
            borderRadius: `${scheme.common.radius}px`,
            background: `color-mix(in srgb, ${props.color} ${props.tint}%, transparent)`,
            boxShadow: `inset ${scheme.common.barWidth}px 0 0 0 ${props.color}`,
            fontSize: props.fontSize > 0 ? `${props.fontSize}px` : undefined,
            fontFamily: family === '' ? undefined : family,
            color: 'var(--dsw-alias-label-primary)',
          },
        },
        h('span', null, props.title),
        h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)' } }, props.meta),
      );
    }

    /**
     * The settings page is the one surface where a render error blanks the whole
     * panel with no clue why. Hooks stay at the top level so the hook count never
     * changes between renders; only the tree build is guarded, and a thrown error
     * becomes a readable message plus a one-click reset instead of an empty page.
     */
    function Page() {
      const [current, setCurrent] = React.useState(config);
      const [uiScheme, setUiScheme] = React.useState(safeDetect);
      React.useEffect(() => subscribe(() => setCurrent({ ...config })), []);
      React.useEffect(() => {
        const id = setInterval(() => {
          const next = safeDetect();
          setUiScheme(prev => (prev === next ? prev : next));
        }, 600);
        return () => clearInterval(id);
      }, []);
      const [census, setCensus] = React.useState(safeCensus);
      React.useEffect(() => {
        const id = setInterval(() => setCensus(safeCensus()), 800);
        return () => clearInterval(id);
      }, []);

      try {
        return h(Boundary, null, pageTree(current, uiScheme, census));
      } catch (error) {
        return pageError(error);
      }
    }

    /**
     * Catches a throw from a child component (a block card, a preview row) that
     * the try/catch above cannot see, because React renders children later.
     */
    class Boundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }

      static getDerivedStateFromError(error) {
        return { error };
      }

      render() {
        if (this.state.error !== null) return pageError(this.state.error);
        return this.props.children;
      }
    }

    function safeDetect() {
      try {
        return detectScheme();
      } catch {
        return 'dark';
      }
    }

    function safeCensus() {
      try {
        return sampleRows();
      } catch {
        return {
          think: 0,
          thinkOpen: 0,
          tool: 0,
          toolOpen: 0,
          toolRunning: 0,
          toolPreparing: 0,
          toolExpandable: 0,
          command: 0,
          context: 0,
          pinned: false,
          jumps: 0,
          detail: '',
        };
      }
    }

    function pageError(error) {
      const message = error && error.message ? error.message : String(error);
      const stack =
        error && typeof error.stack === 'string'
          ? error.stack.split('\n').slice(0, 8).join('\n')
          : '';
      return h(
        'div',
        { className: 'dte-page' },
        h(
          'section',
          { className: 'dte-card' },
          h(
            'div',
            { className: 'dte-card-pad' },
            h('span', { className: 'dte-group-title' }, '过程块样式渲染失败'),
            h('p', { className: 'dte-hint' }, `v${VERSION} · ${message}`),
            stack !== ''
              ? h('pre', { className: 'dte-stack' }, stack)
              : null,
            h(
              'p',
              { className: 'dte-hint' },
              '先点下面的按钮清掉本插件存在这个浏览器里的配置并刷新页面。如果仍然失败，把上面这段文字反馈给插件作者。',
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dte-reset',
                onClick: () => {
                  resetAll();
                },
              },
              '清除配置并恢复默认',
            ),
          ),
        ),
      );
    }

    function pageTree(current, uiScheme, census) {
      const target = current.schemeMode === 'auto' ? uiScheme : current.schemeMode;
      const scheme = current.schemes[target] ?? current.schemes.dark;

      const patchScheme = patch => {
        update({ schemes: { [target]: { ...scheme, ...patch } } });
      };
      const patchBlock = (key, patch) => {
        patchScheme({ blocks: { ...scheme.blocks, [key]: { ...scheme.blocks[key], ...patch } } });
      };
      const patchMode = (key, mode) => {
        update({ modes: { [key]: mode } });
      };

      const processDefs = BLOCK_DEFS.filter(def => def.group === 'process');
      const otherDefs = BLOCK_DEFS.filter(def => def.group === 'other');
      const enabled = BLOCK_DEFS.filter(def => scheme.blocks[def.key].on);
      const schemeLabel = target === 'dark' ? '暗色套' : '浅色套';

      return h(
        'div',
        { className: 'dte-page' },
        h(
          'div',
          { className: 'dte-stamp' },
          `v${VERSION} · ${schemeLabel} · ${BLOCK_DEFS.length} 类块 · 配置存于本浏览器`,
        ),
        h(
          'section',
          { className: 'dte-card' },
          h(
            'div',
            { className: 'dte-card-pad' },
            h('span', { className: 'dte-group-title' }, '配色方案'),
            h(
              'div',
              { className: 'dte-seg', role: 'radiogroup', 'aria-label': '配色方案' },
              SCHEME_MODES.map(mode =>
                h(
                  'button',
                  {
                    key: mode.id,
                    type: 'button',
                    role: 'radio',
                    title: mode.title,
                    'aria-checked': current.schemeMode === mode.id,
                    onClick: () => {
                      update({ schemeMode: mode.id });
                    },
                  },
                  mode.label,
                ),
              ),
            ),
            h(
              'p',
              { className: 'dte-hint' },
              `界面当前是${uiScheme === 'dark' ? '暗色' : '浅色'}，正在编辑${schemeLabel}。暗色与浅色各存一套颜色、底色、字号与字体，界面主题切换时自动套用对应的一套；折叠规则与展开策略是两套共用的。`,
            ),
          ),
        ),
        h(
          'section',
          { className: 'dte-card' },
          h(
            'div',
            { className: 'dte-card-pad' },
            h('span', { className: 'dte-group-title' }, '折叠规则'),
            h(
              'div',
              { className: 'dte-seg', role: 'radiogroup', 'aria-label': '折叠规则' },
              FOLD_MODES.map(mode =>
                h(
                  'button',
                  {
                    key: mode.id,
                    type: 'button',
                    role: 'radio',
                    'aria-checked': current.foldMode === mode.id,
                    onClick: () => {
                      update({ foldMode: mode.id });
                    },
                  },
                  mode.label,
                ),
              ),
            ),
            h(
              'p',
              { className: 'dte-hint' },
              '「运行时展开」让过程块在运行中自动打开、结束后自动折叠；你手动展开的行不会被折叠。「全部展开」「全部折叠」只在新行出现时应用一次，之后尊重你的手动操作。每个块可在下方单独覆盖这条规则——例如全局选「全部展开」，只让思考块展开、工具块保持折叠。',
            ),
            h('span', { className: 'dte-group-title', style: { marginTop: '14px' } }, '折叠时机'),
            h(
              'div',
              { className: 'dte-seg', role: 'radiogroup', 'aria-label': '折叠时机' },
              FOLD_TIMINGS.map(mode =>
                h(
                  'button',
                  {
                    key: mode.id,
                    type: 'button',
                    role: 'radio',
                    title: mode.title,
                    'aria-checked': current.foldTiming === mode.id,
                    onClick: () => {
                      update({ foldTiming: mode.id });
                    },
                  },
                  mode.label,
                ),
              ),
            ),
            h(
              'div',
              { className: 'dte-row' },
              h(
                'div',
                { className: 'dte-row-main' },
                h('span', { className: 'dte-row-label' }, '最后一步是正文时折叠'),
                h(
                  'span',
                  { className: 'dte-row-hint' },
                  '关：最后一条过程行一直展开，直到下一条过程出现；开：它后面没有过程行时也折叠。',
                ),
              ),
              h(Switch, {
                checked: current.foldLast,
                title: '最后一步是正文时折叠',
                onChange: value => {
                  update({ foldLast: value });
                },
              }),
            ),
            h(
              'div',
              { className: 'dte-row' },
              h(
                'div',
                { className: 'dte-row-main' },
                h('span', { className: 'dte-row-label' }, '显示耗时'),
                h(
                  'span',
                  { className: 'dte-row-hint' },
                  '过程行标题后显示运行时长（工具、命令、思考、上下文注入），运行中实时递增，结束后定格。',
                ),
              ),
              h(Switch, {
                checked: current.showTimer,
                title: '显示耗时',
                onChange: value => {
                  update({ showTimer: value });
                },
              }),
            ),
          ),
        ),
        h(
          Group,
          { title: '过程块', badge: schemeLabel, count: processDefs.length, defaultOpen: true },
          ...processDefs.map(def =>
            h(BlockCard, {
              key: def.key,
              def,
              block: scheme.blocks[def.key],
              mode: current.modes[def.key],
              onChange: patch => {
                patchBlock(def.key, patch);
              },
              onModeChange: mode => {
                patchMode(def.key, mode);
              },
            }),
          ),
        ),
        h(
          Group,
          { title: '其他块', badge: schemeLabel, count: otherDefs.length, defaultOpen: false },
          h('p', { className: 'dte-hint' }, '这些块本来不是过程块，打开色条与底色可能影响原有布局。'),
          ...otherDefs.map(def =>
            h(BlockCard, {
              key: def.key,
              def,
              block: scheme.blocks[def.key],
              mode: current.modes[def.key],
              onChange: patch => {
                patchBlock(def.key, patch);
              },
              onModeChange: mode => {
                patchMode(def.key, mode);
              },
            }),
          ),
        ),
        h(
          Group,
          { title: '通用', badge: schemeLabel, count: 6, defaultOpen: false },
          h(
            Row,
            null,
            h('span', { className: 'dte-label' }, '字体'),
            h('input', {
              type: 'text',
              spellCheck: false,
              placeholder: '继承界面字体',
              className: 'dte-input',
              style: { flex: '1 1 200px', minWidth: '160px' },
              value: scheme.common.fontFamily,
              'aria-label': '字体',
              onChange: event => {
                patchScheme({ common: { ...scheme.common, fontFamily: event.target.value } });
              },
            }),
          ),
          h(SliderField, {
            label: '运行态浓度',
            min: 0,
            max: 60,
            value: scheme.common.liveBg,
            suffix: '%',
            onChange: value => {
              patchScheme({ common: { ...scheme.common, liveBg: value } });
            },
          }),
          h(SliderField, {
            label: '色条宽度',
            min: 0,
            max: 8,
            value: scheme.common.barWidth,
            suffix: 'px',
            onChange: value => {
              patchScheme({ common: { ...scheme.common, barWidth: value } });
            },
          }),
          h(SliderField, {
            label: '圆角',
            min: 0,
            max: 20,
            value: scheme.common.radius,
            suffix: 'px',
            onChange: value => {
              patchScheme({ common: { ...scheme.common, radius: value } });
            },
          }),
          h(SliderField, {
            label: '上下内边距',
            min: 0,
            max: 24,
            value: scheme.common.padBlock,
            suffix: 'px',
            onChange: value => {
              patchScheme({ common: { ...scheme.common, padBlock: value } });
            },
          }),
          h(SliderField, {
            label: '右内边距',
            min: 0,
            max: 40,
            value: scheme.common.padInline,
            suffix: 'px',
            onChange: value => {
              patchScheme({ common: { ...scheme.common, padInline: value } });
            },
          }),
          h(SliderField, {
            label: '左内边距',
            min: 0,
            max: 40,
            value: scheme.common.padLeft,
            suffix: 'px',
            onChange: value => {
              patchScheme({ common: { ...scheme.common, padLeft: value } });
            },
          }),
          h(SliderField, {
            label: '行内代码底色',
            min: 0,
            max: 40,
            value: scheme.common.codeBg,
            suffix: '%',
            onChange: value => {
              patchScheme({ common: { ...scheme.common, codeBg: value } });
            },
          }),
          h(SliderField, {
            label: '代码块底色',
            min: 0,
            max: 40,
            value: scheme.common.codeBlockBg,
            suffix: '%',
            onChange: value => {
              patchScheme({ common: { ...scheme.common, codeBlockBg: value } });
            },
          }),
        ),
        h(
          Group,
          { title: '预览', badge: schemeLabel, count: enabled.length, defaultOpen: false },
          h(
            'div',
            { className: 'dte-preview' },
            enabled.length === 0
              ? h('p', { className: 'dte-hint' }, '当前没有启用任何块。')
              : enabled.map(def => {
                const block = scheme.blocks[def.key];
                return h(Preview, {
                  key: def.key,
                  scheme,
                  color: block.color,
                  tint: block.bg,
                  fontSize: block.fontSize,
                  title: def.label,
                  meta: def.hint,
                });
              }),
          ),
          h('p', { className: 'dte-hint' }, '改动立即生效，无需重启；配置保存在本浏览器。'),
        ),
        h(
          Group,
          { title: '诊断', badge: `v${VERSION}`, count: 11, defaultOpen: false },
          h('p', { className: 'dte-hint' }, '这些是插件此刻在页面上实际看到的行。若「工具块」有行但「可展开」为 0，说明上游还没给出可展开的内容；若「已展开」始终为 0 而「运行中」大于 0，说明点击没有落到展开控件上。'),
          h(
            'div',
            { className: 'dte-diag' },
            ...[
              ['思考行', census.think],
              ['思考已展开', census.thinkOpen],
              ['工具行', census.tool],
              ['工具已展开', census.toolOpen],
              ['工具运行中', census.toolRunning],
              ['工具准备中', census.toolPreparing],
              ['工具可展开', census.toolExpandable],
              ['命令卡', census.command],
              ['上下文注入', census.context],
              ['贴底中', census.pinned ? '是' : '否'],
              ['拉回次数', census.jumps],
            ].map(([label, value]) =>
              h(
                'div',
                { className: 'dte-diag-row', key: label },
                h('span', null, label),
                h('span', { className: 'dte-val' }, String(value)),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dte-diag-detail' },
            h('span', { className: 'dte-row-label' }, '最近工具行的真实状态'),
            h('code', { className: 'dte-diag-line' }, census.detail === '' ? '（当前没有工具行）' : census.detail),
          ),
        ),
        h(
          'div',
          { className: 'dte-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'dte-reset',
              onClick: () => {
                resetScheme(target);
              },
            },
            `重置${schemeLabel}`,
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dte-reset',
              onClick: () => {
                resetAll();
              },
            },
            '全部恢复默认',
          ),
        ),
      );
    }

    // ------------------------------------------------------------------ driver

    return {
      inject: ['slots'],
      apply(ctx) {
        const autoOpened = new WeakSet();
        const lastState = new WeakMap();
        // One click per (row, state, intent). The disclosure's own `open` is
        // `expanded && expandable`, so a row that cannot open yet reports closed
        // even after a click landed; verifying and re-clicking would toggle the
        // pending state straight back off. Firing once per state transition keeps
        // the click authoritative and lets the row's own state change re-arm it.
        const fired = new WeakMap();
        const retries = new WeakMap();
        const rowMode = new WeakMap();
        const timers = new Set();
        let frame = 0;

        function control(row) {
          // Only the disclosure row itself. A loose `[aria-expanded]` or
          // `[role="button"]` fallback lands on whatever comes first inside the
          // row — and a read or edit row leads with its file path, which is a
          // link. Clicking that opens the file and leaves the row collapsed, so
          // the row looks unexpandable while the click quietly went elsewhere.
          return row.querySelector('[data-disclosure-row][aria-expanded]')
            ?? row.querySelector('[data-disclosure-row][role="button"]');
        }

        function scrollerOf(row) {
          return row.closest('[data-conversation-scroll]');
        }

        function atBottom(element) {
          return element.scrollHeight - element.clientHeight - element.scrollTop <= 24;
        }

        const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' ']);

        /**
         * The upstream follow controller stops following the moment it samples a
         * scroll it did not perform, and expanding a row above the tail produces
         * exactly that: scroll anchoring shifts `scrollTop`, the controller reads
         * it as the reader leaving, and the tail is abandoned for the rest of the
         * turn. So the pin is owned here instead. It survives content growth and
         * only a real reader gesture releases it.
         */
        const pinStates = new WeakMap();

        function pinStateOf(scroller) {
          const known = pinStates.get(scroller);
          if (known !== undefined) return known;
          const state = {
            pinned: atBottom(scroller),
            programmatic: false,
            lastTop: scroller.scrollTop,
            gestureAt: 0,
            jumps: 0,
          };
          pinStates.set(scroller, state);
          scroller.addEventListener('scroll', () => {
            const top = scroller.scrollTop;
            if (state.programmatic) {
              state.programmatic = false;
              state.lastTop = top;
              return;
            }
            // The viewport can be thrown above the tail by something other than
            // the reader: a spacer reclaimed under the floor, history pruned
            // above it, a fold that shrank the content. While pinned, content
            // growth only ever moves `scrollTop` down, so any upward movement is
            // not the reader and gets undone.
            const jumped = state.pinned
              && top < state.lastTop - 2
              && Date.now() - state.gestureAt > 600;
            state.lastTop = top;
            if (jumped) {
              state.jumps += 1;
              state.programmatic = true;
              scroller.scrollTop = scroller.scrollHeight;
              state.lastTop = scroller.scrollTop;
              return;
            }
            state.pinned = atBottom(scroller);
          }, { passive: true });
          const release = () => {
            state.pinned = false;
            state.gestureAt = Date.now();
          };
          scroller.addEventListener('wheel', release, { passive: true });
          scroller.addEventListener('touchmove', release, { passive: true });
          // Only the scrollbar strip counts: a pointerdown on a row is a click on
          // that row, not the reader taking over the viewport.
          scroller.addEventListener('pointerdown', (event) => {
            const rect = scroller.getBoundingClientRect();
            if (event.clientX - rect.left >= scroller.clientWidth) release();
          }, { passive: true });
          scroller.addEventListener('keydown', (event) => {
            if (SCROLL_KEYS.has(event.key)) release();
          });
          return state;
        }

        function pinToBottom(scroller) {
          if (scroller === null || !scroller.isConnected) return;
          const state = pinStateOf(scroller);
          if (!state.pinned) return;
          const floor = scroller.scrollHeight - scroller.clientHeight;
          if (floor - scroller.scrollTop <= 1) return;
          state.programmatic = true;
          scroller.scrollTop = floor;
          state.lastTop = scroller.scrollTop;
        }

        function holdTail(scroller) {
          for (const delay of [60, 220, 520]) {
            const timer = setTimeout(() => {
              timers.delete(timer);
              pinToBottom(scroller);
            }, delay);
            timers.add(timer);
          }
        }

        /**
         * A tool row carries no timing of its own: `data-state` flips from
         * preparing/running to a settled value and nothing records when. The badge
         * goes into the disclosure header, which React does not rebuild on a state
         * change, and is re-created if it ever disappears.
         */
        const startedAt = new WeakMap();
        const settledAt = new WeakMap();
        const badgeText = new WeakMap();
        // The anchor a row carried when its window opened, so the settled anchor
        // can be mirrored too.
        const anchorAtStart = new WeakMap();

        // The measured window of every call, keyed by chat anchor, mirrored into
        // localStorage. A reload or a plugin restart must not wipe the timings of
        // calls that already finished — the call is over, its duration is a fact.
        const TIMER_KEY = 'dsh-live-process:timers';
        // Enough headroom for the whole backfill (a session log yields roughly
        // 1500 windows) plus weeks of live measuring.
        const TIMER_LIMIT = 20000;
        const timerStore = (() => {
          const map = new Map();
          try {
            const raw = window.localStorage.getItem(TIMER_KEY);
            const parsed = raw === null ? null : JSON.parse(raw);
            if (parsed !== null && typeof parsed === 'object') {
              for (const [key, value] of Object.entries(parsed)) {
                if (Array.isArray(value) && typeof value[0] === 'number' && Number.isFinite(value[0])) {
                  map.set(key, { start: value[0], end: typeof value[1] === 'number' ? value[1] : null });
                }
              }
            }
          } catch {
            // A corrupt or unavailable store just means nothing is remembered.
          }
          return map;
        })();

        function saveTimers() {
          try {
            // Insertion order is not time order: the backfill appends whole
            // sessions at once, so trimming by iteration order would delete the
            // newest windows it had just added. Keep the newest by start time.
            if (timerStore.size > TIMER_LIMIT) {
              const ordered = [...timerStore.entries()].sort((left, right) => left[1].start - right[1].start);
              for (const [key] of ordered.slice(0, timerStore.size - TIMER_LIMIT)) timerStore.delete(key);
            }
            const plain = {};
            for (const [key, value] of timerStore) plain[key] = [value.start, value.end];
            window.localStorage.setItem(TIMER_KEY, JSON.stringify(plain));
          } catch {
            // Storage quota or a private window: timings stay in memory only.
          }
        }

        function dropBadge(row) {
          const header = row.querySelector('[data-disclosure-header]');
          const stale = header === null ? null : header.querySelector(':scope > .dte-timer');
          if (stale !== null) stale.remove();
        }

        function anchorOf(row) {
          const hosted = row.closest('[data-chat-anchor-key]');
          const anchor = hosted === null ? null : hosted.getAttribute('data-chat-anchor-key');
          return anchor === null || anchor === '' ? null : anchor;
        }

        function formatElapsed(ms) {
          // A backfilled window can be nonsense if a clock moved or two records
          // disagree; show nothing rather than a negative duration.
          if (!Number.isFinite(ms) || ms < 0) return '';
          if (ms < 1000) return `${Math.round(ms)}ms`;
          if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
          const minutes = Math.floor(ms / 60000);
          const seconds = Math.round((ms % 60000) / 1000);
          return `${minutes}m${seconds}s`;
        }

        function badgeOf(row) {
          const header = row.querySelector('[data-disclosure-header]');
          if (header === null) return null;
          const known = header.querySelector(':scope > .dte-timer');
          if (known !== null) return known;
          const badge = document.createElement('span');
          badge.className = 'dte-timer';
          header.appendChild(badge);
          return badge;
        }

        function tickTimer(row, def) {
          if (!config.showTimer) return;
          const anchor = anchorOf(row);
          // A context row carries no `data-state`, and a reasoning row's own
          // running flag is the row's live signal, so the block definition owns
          // the verdict whenever it has one.
          const state = row.getAttribute('data-state');
          const live = def !== undefined ? def.live(row) : state === 'running' || state === 'preparing';

          // The element is the primary key. A reasoning row's anchor is derived
          // from a provisional assistant-step counter while it streams and is
          // re-derived once it settles, so an anchor-only store loses the window
          // exactly when the row finishes. The anchor store stays as the
          // cross-reload mirror.
          let start = startedAt.get(row);
          let end = settledAt.get(row);

          if (start === undefined && anchor !== null) {
            const record = timerStore.get(anchor);
            if (record !== undefined) {
              start = record.start;
              startedAt.set(row, start);
              if (record.end !== null) {
                end = record.end;
                settledAt.set(row, end);
              }
            }
          }

          if (start === undefined) {
            // A row first seen already settled has no observable start: the work
            // happened before this plugin was watching. Show nothing rather than a
            // made-up 0ms, and do not remember the decision — the log backfill can
            // still supply the real window a moment later.
            if (!live) {
              dropBadge(row);
              return;
            }
            start = Date.now();
            startedAt.set(row, start);
            anchorAtStart.set(row, anchor);
            if (anchor !== null) {
              timerStore.set(anchor, { start, end: null });
              saveTimers();
            }
          }

          if (!live && end === undefined) {
            end = Date.now();
            settledAt.set(row, end);
            // Mirror under both anchors: the provisional one the row carried while
            // it ran, and the settled one it carries now.
            const from = anchorAtStart.get(row);
            if (from !== undefined && from !== null) timerStore.set(from, { start, end });
            if (anchor !== null) timerStore.set(anchor, { start, end });
            if (from !== undefined || anchor !== null) saveTimers();
          }

          const elapsed = end === undefined ? Date.now() - start : end - start;
          const text = formatElapsed(elapsed);
          if (text === '') {
            dropBadge(row);
            return;
          }
          const badge = badgeOf(row);
          if (badge === null) return;
          if (badgeText.get(badge) !== text) {
            badge.textContent = text;
            badgeText.set(badge, text);
          }
          if (!live && end !== undefined) badge.removeAttribute('data-live');
          else badge.setAttribute('data-live', 'true');
        }

        /**
         * The disclosure root carries `data-open` exactly while it is open, which
         * is the one signal that does not depend on `expandable`: `aria-expanded`
         * is omitted entirely on a row that cannot open yet, so reading it alone
         * reports "closed" for a row whose pending state is already set.
         */
        function isOpen(row) {
          const header = row.querySelector('[data-disclosure-header]');
          const root = header === null ? null : header.parentElement;
          if (root !== null) return root.hasAttribute('data-open');
          const flagged = row.querySelector('[aria-expanded]');
          if (flagged !== null) return flagged.getAttribute('aria-expanded') === 'true';
          return row.hasAttribute('data-expanded') || row.hasAttribute('data-open');
        }

        function drive(row, want) {
          const target = control(row);
          if (target === null) return;
          const scroller = scrollerOf(row);
          // Only re-pin when the reader was already at the tail: expanding a row
          // from a scrolled-up position must not yank them to the bottom.
          const pinned = scroller !== null && atBottom(scroller);
          target.click();
          if (pinned) holdTail(scroller);
        }

        function driveRow(row, def, mode, isLast) {
          const stateNow = row.getAttribute('data-state');
          if (lastState.get(row) !== stateNow) {
            lastState.set(row, stateNow);
            fired.delete(row);
            retries.delete(row);
          }
          if (rowMode.get(row) !== mode) {
            rowMode.set(row, mode);
            fired.delete(row);
            retries.delete(row);
          }
          let want;
          if (mode === 'auto') {
            if (def.live(row)) {
              autoOpened.add(row);
              want = true;
            } else {
              if (!autoOpened.has(row)) return;
              // `onNext` holds a finished row open until the next process row
              // arrives, so the row you are reading never folds under you. The
              // last row has no successor to wait for, so `foldLast` decides.
              if (config.foldTiming === 'onNext' && isLast && !config.foldLast) return;
              autoOpened.delete(row);
              want = false;
            }
          } else {
            want = mode === 'expand';
          }
          const record = fired.get(row);
          if (record !== undefined && record.state === stateNow && record.want === want) {
            if (isOpen(row) === want) return;
            // The row reports the opposite of what we just asked for. Chat binds
            // every disclosure to a reset source that clears the open state when
            // the node is re-routed, so a single click can be undone a frame
            // later. Retry a bounded number of times instead of giving up on the
            // first reversal.
            const tries = (retries.get(row) ?? 0) + 1;
            if (tries > 6) return;
            retries.set(row, tries);
            fired.delete(row);
          }
          // A row that cannot open yet exposes no disclosure control at all. Leave
          // the intent unrecorded so the next sweep retries once the row grows one.
          if (control(row) === null) return;
          fired.set(row, { state: stateNow, want });
          if (isOpen(row) === want) return;
          drive(row, want);
        }

        function sweep() {
          frame = 0;
          const scheme = config.schemes[activeScheme()];
          const collected = [];
          for (const def of BLOCK_DEFS) {
            const block = scheme.blocks[def.key];
            const rows = [...def.rows()];
            collected.push({ def, rows });
            for (const row of rows) {
              if (block.on) {
                if (row.getAttribute(MARK) !== def.key) row.setAttribute(MARK, def.key);
              } else if (row.getAttribute(MARK) === def.key) {
                row.removeAttribute(MARK);
              }
            }
          }
          // The last leaf row is the one with nothing after it in the transcript:
          // that is where `foldLast` applies, because no successor will arrive to
          // trigger the `onNext` fold.
          const leaves = [];
          for (const { def, rows } of collected) if (def.leaf) leaves.push(...rows);
          leaves.sort((a, b) => {
            const position = a.compareDocumentPosition(b);
            if ((position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) return -1;
            if ((position & Node.DOCUMENT_POSITION_PRECEDING) !== 0) return 1;
            return 0;
          });
          const lastLeaf = leaves.length > 0 ? leaves[leaves.length - 1] : null;
          for (const { def, rows } of collected) {
            if (def.timed) for (const row of rows) tickTimer(row, def);
            if (!def.foldable) continue;
            const override = config.modes[def.key];
            const blockMode = override === 'inherit' ? config.foldMode : override;
            if (blockMode === 'off') continue;
            for (const row of rows) driveRow(row, def, blockMode, row === lastLeaf);
          }
          // Rows already on screen when the plugin started are history: their
          // work happened before anything was watching. Nothing is recorded for
          // them — a settled row without a remembered window simply shows no
          // badge, which a later backfill can still correct.
          primed = true;
          // Streaming grows the tail every frame; keep a pinned reader on it.
          pinToBottom(document.querySelector('[data-conversation-scroll]'));
          probe();
        }

        // TEMPORARY diagnostic uplink: the GUI has no debugging port, so the live
        // row state is posted to a local sink and read back from disk.
        let probeAt = 0;
        function probe() {
          if (Date.now() - probeAt < 300) return;
          probeAt = Date.now();
          try {
            const rows = [...document.querySelectorAll('[data-dsh-block]')];
            const payload = {
              v: VERSION,
              at: Date.now(),
              rows: rows.map(row => {
                const header = row.querySelector('[data-disclosure-header]');
                const root = header === null ? null : header.parentElement;
                const ctl = control(row);
                const badge = header === null ? null : header.querySelector(':scope > .dte-timer');
                return {
                  block: row.getAttribute('data-dsh-block'),
                  tool: row.getAttribute('data-tool'),
                  state: row.getAttribute('data-state'),
                  anchor: anchorOf(row),
                  open: root !== null && root.hasAttribute('data-open'),
                  hasRow: row.querySelector('[data-disclosure-row]') !== null,
                  hasAria: row.querySelector('[data-disclosure-row][aria-expanded]') !== null,
                  ctl: ctl !== null,
                  timer: badge === null ? null : badge.textContent,
                  bg: getComputedStyle(row).backgroundColor,
                  rootBg: root === null ? null : getComputedStyle(root).backgroundColor,
                  headerBg: header === null ? null : getComputedStyle(header).backgroundColor,
                  parentBg: row.parentElement === null
                    ? null
                    : getComputedStyle(row.parentElement).backgroundColor,
                  bodyBg: root === null || root.lastElementChild === null
                    ? null
                    : getComputedStyle(root.lastElementChild).backgroundColor,
                  box: (() => {
                    const rect = row.getBoundingClientRect();
                    return `${Math.round(rect.left)}/${Math.round(rect.width)}`;
                  })(),
                };
              }),
            };
            fetch('http://127.0.0.1:8899/probe', {
              method: 'POST',
              mode: 'no-cors',
              body: JSON.stringify(payload),
            }).catch(() => {});
          } catch {
            // The probe must never disturb the page.
          }
        }

        function schedule() {
          if (frame !== 0) return;
          frame = requestAnimationFrame(sweep);
        }

        ctx.effect(() => {
          const style = document.createElement('style');
          style.id = STYLE_ID;
          const paint = () => {
            style.textContent = `${cssText(config, activeScheme())}\n${TIMER_CSS}\n${SETTINGS_CSS}`;
          };
          paint();
          document.head.append(style);

          const off = subscribe(() => {
            paint();
            schedule();
          });

          const observer = new MutationObserver(schedule);
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['data-state', 'data-expanded', 'data-open', 'aria-expanded'],
          });

          // The theme presenter writes the resolved scheme onto the root element
          // and may toggle a body attribute; repaint the palette when it moves.
          const themeObserver = new MutationObserver(paint);
          themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
          themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'class'] });

          schedule();

          // Backfill: a call that finished before this plugin was watching has no
          // observable window, but its timestamps survive in the session log. The
          // local sink rebuilds the table on every request, so polling it keeps the
          // newest calls covered too. Without it the plugin works exactly as
          // before, so the request is allowed to fail silently.
          const refreshSeed = () => {
            fetch('http://127.0.0.1:8899/timers')
              .then(response => (response.ok ? response.json() : null))
              .then(data => {
                if (data === null || typeof data !== 'object') return;
                let added = 0;
                for (const [key, value] of Object.entries(data)) {
                  if (!Array.isArray(value) || typeof value[0] !== 'number') continue;
                  // The session log is the authority: its timestamps are what the
                  // scheduler actually measured, so they replace anything this
                  // plugin guessed by watching the DOM.
                  const next = { start: value[0], end: typeof value[1] === 'number' ? value[1] : null };
                  const held = timerStore.get(key);
                  if (held !== undefined && held.start === next.start && held.end === next.end) continue;
                  timerStore.set(key, next);
                  added += 1;
                }
                if (added > 0) {
                  saveTimers();
                  schedule();
                }
              })
              .catch(() => {});
          };
          refreshSeed();
          const seedTick = setInterval(refreshSeed, 15000);
          const probeTick = setInterval(probe, 400);

          // A context row's live window expires on a clock rather than on a DOM
          // change, so poll while the transcript is otherwise idle to let the
          // row fold itself once the window closes.
          const tick = setInterval(schedule, 1000);

          return () => {
            off();
            observer.disconnect();
            themeObserver.disconnect();
            clearInterval(tick);
            clearInterval(seedTick);
            clearInterval(probeTick);
            if (frame !== 0) cancelAnimationFrame(frame);
            frame = 0;
            for (const timer of timers) clearTimeout(timer);
            timers.clear();
            style.remove();
          };
        }, 'live-process: block styles and disclosure driver');

        ctx.effect(
          () =>
            ctx.slots.inject('settings.section', () =>
              ctx.slots.register(
                {
                  name: 'settings.section',
                  id: 'live-process',
                  order: 60,
                  label: () => '过程块样式',
                },
                Page,
              ),
            ),
          'live-process: settings page',
        );
      },
    };
  },
});
