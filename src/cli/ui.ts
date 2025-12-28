/**
 * Undu CLI UI Helpers
 * Colors, formatting, terminal utilities
 */

// Check if we're in a TTY (for color support)
const isTTY = process.stdout.isTTY ?? false;

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Colors
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Backgrounds
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

// Color wrapper that respects TTY
function c(color: keyof typeof colors, text: string): string {
  if (!isTTY) return text;
  return `${colors[color]}${text}${colors.reset}`;
}

// Compound styles
export const style = {
  // Text styles
  bold: (t: string) => c('bold', t),
  dim: (t: string) => c('dim', t),
  italic: (t: string) => c('italic', t),

  // Semantic colors
  success: (t: string) => c('green', t),
  error: (t: string) => c('red', t),
  warning: (t: string) => c('yellow', t),
  info: (t: string) => c('cyan', t),
  muted: (t: string) => c('gray', t),

  // Status indicators
  added: (t: string) => c('green', t),
  modified: (t: string) => c('yellow', t),
  deleted: (t: string) => c('red', t),

  // UI elements
  checkpoint: (t: string) => c('cyan', t),
  autosave: (t: string) => c('gray', t),
  hash: (t: string) => c('dim', t),
  path: (t: string) => c('white', t),
};

// Symbols (with fallbacks for non-unicode terminals)
export const sym = {
  checkpoint: isTTY ? '●' : '*',
  autosave: isTTY ? '○' : 'o',
  current: isTTY ? '◆' : '>',
  line: isTTY ? '│' : '|',
  success: isTTY ? '✓' : '+',
  error: isTTY ? '✗' : 'x',
  warning: isTTY ? '!' : '!',
  arrow: isTTY ? '→' : '->',
  added: 'A',
  modified: 'M',
  deleted: 'D',
};

// Print helpers
export function print(...args: string[]): void {
  console.log(...args);
}

export function printError(message: string): void {
  console.error(style.error(`${sym.error} ${message}`));
}

export function printSuccess(message: string): void {
  console.log(style.success(`${sym.success} ${message}`));
}

export function printWarning(message: string): void {
  console.log(style.warning(`${sym.warning} ${message}`));
}

// Relative time formatting
export function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString();
}

// File size formatting
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Box drawing
export function box(title: string, content: string[]): string {
  const lines = [
    style.bold(`  ${title}`),
    style.muted('  ' + '─'.repeat(40)),
    ...content.map(l => `  ${l}`),
  ];
  return lines.join('\n');
}

// Timeline drawing
export function drawTimeline(
  checkpoints: Array<{
    id: string;
    message: string;
    timestamp: number;
    isAutoSave: boolean;
    isCurrent?: boolean;
  }>,
  hasUnsavedChanges: boolean
): string {
  const lines: string[] = [];

  lines.push(style.bold('  Your Timeline'));
  lines.push(style.muted('  ' + '━'.repeat(40)));

  // Show "Now" if there are unsaved changes
  if (hasUnsavedChanges) {
    lines.push(`  ${style.warning(sym.current)} ${style.bold('Now')} ${style.muted('(unsaved changes)')}`);
    lines.push(`  ${style.muted(sym.line)}`);
  }

  for (const cp of checkpoints) {
    const symbol = cp.isCurrent
      ? style.success(sym.current)
      : cp.isAutoSave
      ? style.autosave(sym.autosave)
      : style.checkpoint(sym.checkpoint);

    const message = cp.isAutoSave
      ? style.muted(`Auto-save`)
      : style.bold(`"${cp.message}"`);

    const time = style.muted(`— ${relativeTime(cp.timestamp)}`);
    const current = cp.isCurrent ? style.muted(' (current)') : '';

    lines.push(`  ${symbol} ${message} ${time}${current}`);

    // Only show connector if not last
    if (cp !== checkpoints[checkpoints.length - 1]) {
      lines.push(`  ${style.muted(sym.line)}`);
    }
  }

  lines.push(style.muted('  ' + '━'.repeat(40)));

  return lines.join('\n');
}

// Help text
export const HELP_TEXT = `
${style.bold('undu')} — Simple version control for humans

${style.bold('Usage:')}
  undu [command] [options]

${style.bold('Commands:')}
  ${style.info('(none)')}              Show status (default)
  ${style.info('init')}                Initialize undu in current directory
  ${style.info('save')} ${style.muted('<message>')}     Create a named checkpoint
  ${style.info('undo')} ${style.muted('[n]')}           Go back n steps (default: 1)
  ${style.info('goto')} ${style.muted('<name|id>')}     Jump to a checkpoint
  ${style.info('history')}             Show timeline
  ${style.info('diff')}                Show changes since last save
  ${style.info('peek')} ${style.muted('<name|id>')}     Preview a checkpoint

${style.bold('Aliases:')}
  ${style.muted('s')}  = save    ${style.muted('u')}  = undo    ${style.muted('h')}  = history
  ${style.muted('d')}  = diff    ${style.muted('g')}  = goto    ${style.muted('p')}  = peek

${style.bold('Options:')}
  --json              Output as JSON (for scripts/AI)
  --help, -h          Show this help
  --version, -v       Show version

${style.bold('Examples:')}
  ${style.muted('$')} undu save "login working"
  ${style.muted('$')} undu undo 3
  ${style.muted('$')} undu goto "before refactor"
  ${style.muted('$')} undu history --json

${style.muted('Learn more: https://github.com/bdekraker/undu')}
`;
