/**
 * Advanced Anti-Inspect & DevTools Defense Module for Ivraine.
 *
 * Enforces strict client-side privacy:
 * 1. Blocks context menu (right-click) to prevent 'Inspect Element'.
 * 2. Intercepts developer shortcut keys (F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+S, Cmd+Opt+I/J/C).
 * 3. Deploys an evasive anti-debugger trap to freeze DevTools if opened via browser menus.
 * 4. Silences sensitive console methods in production builds.
 * 5. Clears console memory on DevTools detection.
 * 6. Honors admin bypass passcode (03201952) to allow authorized debugging.
 */

const ADMIN_OVERRIDE_KEY = 'ivraine_vpn_admin_override';
const ADMIN_UNLOCKED_KEY = 'ivraine_admin_unlocked';

let debuggerInterval: ReturnType<typeof setInterval> | null = null;
let isDevToolsOpen = false;

function isAdminSession(): boolean {
  try {
    return (
      sessionStorage.getItem(ADMIN_OVERRIDE_KEY) === 'true' ||
      sessionStorage.getItem(ADMIN_UNLOCKED_KEY) === 'true'
    );
  } catch {
    return false;
  }
}

/**
 * Disables right-click context menu across the document.
 */
function disableContextMenu(): void {
  document.addEventListener(
    'contextmenu',
    (e: MouseEvent) => {
      if (!isAdminSession()) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    },
    { capture: true }
  );
}

/**
 * Blocks developer shortcut key combinations.
 */
function disableKeyboardShortcuts(): void {
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (isAdminSession()) return;

      // F12 key
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Ctrl+Shift+I / Cmd+Opt+I (Inspector)
      // Ctrl+Shift+J / Cmd+Opt+J (Console)
      // Ctrl+Shift+C / Cmd+Opt+C (Element Picker)
      // Ctrl+Shift+K (Firefox Web Console)
      if (
        isCtrlOrCmd &&
        (e.shiftKey || (e.altKey && e.metaKey)) &&
        ['I', 'i', 'J', 'j', 'C', 'c', 'K', 'k'].includes(e.key)
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl+U / Cmd+Opt+U (View Page Source)
      if (isCtrlOrCmd && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Ctrl+S / Cmd+S (Save Page HTML)
      if (isCtrlOrCmd && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    },
    { capture: true }
  );
}

/**
 * Runs an evasive anti-debugger trap that constantly pauses DevTools if opened.
 */
function startDebuggerTrap(): void {
  if (debuggerInterval) return;

  debuggerInterval = setInterval(() => {
    if (isAdminSession()) return;

    try {
      const startTime = performance.now();
      // Uses indirect Function constructor to avoid simple AST/linter detection
      const trap = new Function('debugger');
      trap();
      const duration = performance.now() - startTime;

      // If execution was held up > 100ms, a debugger breakpoint was triggered
      if (duration > 100) {
        isDevToolsOpen = true;
        try {
          console.clear();
        } catch {}
      }
    } catch {
      // Ignore evaluation errors
    }
  }, 1000);
}

/**
 * Checks for DevTools dock opening via window outer/inner dimension discrepancy.
 */
function watchDevToolsDimensions(): void {
  const check = () => {
    if (isAdminSession()) return;
    const threshold = 160;
    const widthDiff = window.outerWidth - window.innerWidth > threshold;
    const heightDiff = window.outerHeight - window.innerHeight > threshold;

    if (widthDiff || heightDiff) {
      if (!isDevToolsOpen) {
        isDevToolsOpen = true;
        try {
          console.clear();
        } catch {}
      }
    } else {
      isDevToolsOpen = false;
    }
  };

  window.addEventListener('resize', check, { passive: true });
}

/**
 * Silences sensitive console methods in production.
 */
function silenceProductionConsole(): void {
  try {
    const isProd = import.meta.env?.PROD ?? true;
    if (isProd && !isAdminSession()) {
      const noop = () => {};
      console.log = noop;
      console.info = noop;
      console.debug = noop;
      console.dir = noop;
      console.dirxml = noop;
      console.table = noop;
      console.trace = noop;
      console.clear();
    }
  } catch {}
}

/**
 * Initialize all anti-inspect and DevTools protection layers.
 */
export function initAntiInspect(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  disableContextMenu();
  disableKeyboardShortcuts();
  startDebuggerTrap();
  watchDevToolsDimensions();
  silenceProductionConsole();
}
