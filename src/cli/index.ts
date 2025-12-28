#!/usr/bin/env bun
/**
 * Undu CLI
 * Simple version control for humans
 */

import { UnduStore } from "../engine";
import type { Status, Timeline, Diff, Checkpoint } from "../engine";
import {
  style,
  sym,
  print,
  printError,
  printSuccess,
  printWarning,
  relativeTime,
  formatSize,
  drawTimeline,
  HELP_TEXT
} from "./ui";

const VERSION = "0.0.1";

// Command aliases
const ALIASES: Record<string, string> = {
  s: 'save',
  b: 'back',
  u: 'back',      // 'u' also works for back
  undo: 'back',   // backwards compatibility
  h: 'history',
  d: 'diff',
  g: 'goto',
  p: 'peek',
  i: 'init',
};

// Parse arguments
function parseArgs(args: string[]): {
  command: string;
  args: string[];
  flags: {
    json: boolean;
    help: boolean;
    version: boolean;
    file?: string;
  };
} {
  const flags = {
    json: false,
    help: false,
    version: false,
    file: undefined as string | undefined,
  };

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--version' || arg === '-v') {
      flags.version = true;
    } else if (arg === '--file' || arg === '-f') {
      flags.file = args[++i];
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  let command = positional[0] || 'status';

  // Resolve alias
  if (ALIASES[command]) {
    command = ALIASES[command];
  }

  return {
    command,
    args: positional.slice(1),
    flags,
  };
}

// JSON output helper
function jsonOutput(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// Commands

async function cmdInit(json: boolean): Promise<number> {
  const cwd = process.cwd();
  const result = await UnduStore.init(cwd);

  if (!result.ok) {
    if (json) {
      jsonOutput({ ok: false, error: result.error });
    } else {
      printError(result.error);
    }
    return 1;
  }

  result.value.close();

  if (json) {
    jsonOutput({ ok: true, message: "Initialized undu repository" });
  } else {
    printSuccess("Initialized undu repository");
    print(style.muted("  Created .undu/ directory"));
    print(style.muted("  Created initial checkpoint"));
    print("");
    print("  Next: Make some changes, then run:");
    print(style.info("    undu save \"my first checkpoint\""));
  }

  return 0;
}

async function cmdStatus(json: boolean): Promise<number> {
  const result = await UnduStore.find(process.cwd());

  if (!result.ok) {
    if (json) {
      jsonOutput({ ok: false, error: result.error });
    } else {
      printError(result.error);
      print(style.muted("  Run 'undu init' to create a repository"));
    }
    return 1;
  }

  const store = result.value;
  const status = await store.getStatus();
  store.close();

  if (json) {
    jsonOutput({ ok: true, ...status });
    return 0;
  }

  // Pretty output
  print("");
  print(style.bold(`  undu ${sym.line} ${status.projectName}`));
  print(style.muted("  " + "─".repeat(40)));

  if (status.unsavedChanges.length === 0) {
    print(style.success(`  ${sym.success} All changes saved`));
  } else {
    print(`  ${style.warning(String(status.unsavedChanges.length))} files changed since "${status.currentCheckpoint?.message || 'initial'}"`);
    print("");

    for (const change of status.unsavedChanges.slice(0, 10)) {
      const typeStyle = change.type === 'added' ? style.added
        : change.type === 'deleted' ? style.deleted
        : style.modified;
      const typeSym = change.type === 'added' ? sym.added
        : change.type === 'deleted' ? sym.deleted
        : sym.modified;

      print(`    ${typeStyle(typeSym)}  ${style.path(change.path)}`);
    }

    if (status.unsavedChanges.length > 10) {
      print(style.muted(`    ... and ${status.unsavedChanges.length - 10} more`));
    }
  }

  print("");
  print(style.muted("  Quick actions:"));
  print(`    ${style.info('undu save "..."')}   Save these changes`);
  print(`    ${style.info('undu back')}         Discard changes`);
  print(`    ${style.info('undu diff')}         See what changed`);
  print("");

  return 0;
}

async function cmdSave(message: string, json: boolean): Promise<number> {
  if (!message) {
    if (json) {
      jsonOutput({ ok: false, error: "Message required" });
    } else {
      printError("Message required");
      print(style.muted("  Usage: undu save \"your message\""));
    }
    return 1;
  }

  const result = await UnduStore.find(process.cwd());
  if (!result.ok) {
    if (json) jsonOutput({ ok: false, error: result.error });
    else printError(result.error);
    return 1;
  }

  const store = result.value;
  const saveResult = await store.save(message, false);
  store.close();

  if (!saveResult.ok) {
    if (json) jsonOutput({ ok: false, error: saveResult.error });
    else printError(saveResult.error);
    return 1;
  }

  if (json) {
    jsonOutput({ ok: true, checkpoint: saveResult.value });
  } else {
    printSuccess(`Saved checkpoint: "${message}"`);
    print(style.muted(`  ID: ${saveResult.value.id}`));
    print(style.muted(`  Files: ${saveResult.value.files.length}`));
  }

  return 0;
}

async function cmdBack(steps: number, json: boolean): Promise<number> {
  const result = await UnduStore.find(process.cwd());
  if (!result.ok) {
    if (json) jsonOutput({ ok: false, error: result.error });
    else printError(result.error);
    return 1;
  }

  const store = result.value;
  const backResult = await store.undo(steps);  // Engine method still called 'undo'
  store.close();

  if (!backResult.ok) {
    if (json) jsonOutput({ ok: false, error: backResult.error });
    else printError(backResult.error);
    return 1;
  }

  if (json) {
    jsonOutput({ ok: true, restoredTo: backResult.value });
  } else {
    printSuccess(`Restored to: "${backResult.value.message}"`);
    print(style.muted(`  ${relativeTime(backResult.value.timestamp)}`));
  }

  return 0;
}

async function cmdGoto(target: string, json: boolean): Promise<number> {
  if (!target) {
    if (json) jsonOutput({ ok: false, error: "Target required" });
    else printError("Target required (checkpoint name or ID)");
    return 1;
  }

  const result = await UnduStore.find(process.cwd());
  if (!result.ok) {
    if (json) jsonOutput({ ok: false, error: result.error });
    else printError(result.error);
    return 1;
  }

  const store = result.value;
  const gotoResult = await store.goto(target);
  store.close();

  if (!gotoResult.ok) {
    if (json) jsonOutput({ ok: false, error: gotoResult.error });
    else printError(gotoResult.error);
    return 1;
  }

  if (json) {
    jsonOutput({ ok: true, restoredTo: gotoResult.value });
  } else {
    printSuccess(`Jumped to: "${gotoResult.value.message}"`);
    print(style.muted(`  ${relativeTime(gotoResult.value.timestamp)}`));
  }

  return 0;
}

async function cmdHistory(json: boolean): Promise<number> {
  const result = await UnduStore.find(process.cwd());
  if (!result.ok) {
    if (json) jsonOutput({ ok: false, error: result.error });
    else printError(result.error);
    return 1;
  }

  const store = result.value;
  const timeline = store.getTimeline();
  const status = await store.getStatus();
  store.close();

  if (json) {
    jsonOutput({ ok: true, timeline });
    return 0;
  }

  // Mark current checkpoint
  const checkpointsWithCurrent = timeline.checkpoints.map(cp => ({
    ...cp,
    isCurrent: cp.id === timeline.current
  }));

  print("");
  print(drawTimeline(checkpointsWithCurrent, status.unsavedChanges.length > 0));
  print("");

  return 0;
}

async function cmdDiff(json: boolean): Promise<number> {
  const result = await UnduStore.find(process.cwd());
  if (!result.ok) {
    if (json) jsonOutput({ ok: false, error: result.error });
    else printError(result.error);
    return 1;
  }

  const store = result.value;
  const diff = await store.getDiff();
  store.close();

  if (json) {
    jsonOutput({ ok: true, diff });
    return 0;
  }

  if (diff.changes.length === 0) {
    print(style.success(`${sym.success} No changes`));
    return 0;
  }

  print("");
  print(style.bold(`  Changes since "${diff.from?.message || 'initial'}"`));
  print(style.muted("  " + "─".repeat(40)));
  print("");

  for (const change of diff.changes) {
    const typeStyle = change.type === 'added' ? style.added
      : change.type === 'deleted' ? style.deleted
      : style.modified;
    const typeSym = change.type === 'added' ? sym.added
      : change.type === 'deleted' ? sym.deleted
      : sym.modified;

    print(`  ${typeStyle(typeSym)}  ${style.path(change.path)}`);
  }

  print("");
  print(style.muted(`  ${diff.summary.filesChanged} files changed`));
  print("");

  return 0;
}

async function cmdPeek(target: string, json: boolean): Promise<number> {
  if (!target) {
    if (json) jsonOutput({ ok: false, error: "Target required" });
    else printError("Target required (checkpoint name or ID)");
    return 1;
  }

  const result = await UnduStore.find(process.cwd());
  if (!result.ok) {
    if (json) jsonOutput({ ok: false, error: result.error });
    else printError(result.error);
    return 1;
  }

  const store = result.value;
  const peekResult = store.peek(target);
  store.close();

  if (!peekResult.ok) {
    if (json) jsonOutput({ ok: false, error: peekResult.error });
    else printError(peekResult.error);
    return 1;
  }

  const { checkpoint, files } = peekResult.value;

  if (json) {
    jsonOutput({ ok: true, checkpoint, files });
    return 0;
  }

  print("");
  print(style.bold(`  Preview: "${checkpoint.message}"`));
  print(style.muted("  " + "─".repeat(40)));
  print(`  Time: ${relativeTime(checkpoint.timestamp)}`);
  print(`  Files: ${files.length}`);
  print(`  Size: ${formatSize(files.reduce((sum, f) => sum + f.size, 0))}`);
  print(`  ID: ${style.hash(checkpoint.id)}`);
  print("");
  print(style.bold("  Files in this checkpoint:"));

  for (const file of files.slice(0, 15)) {
    print(`    ${style.path(file.path)} ${style.muted(`(${formatSize(file.size)})`)}`);
  }

  if (files.length > 15) {
    print(style.muted(`    ... and ${files.length - 15} more`));
  }

  print("");
  print(style.muted(`  Use 'undu goto ${target}' to restore this checkpoint`));
  print("");

  return 0;
}

// Main
async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const { command, args: cmdArgs, flags } = parseArgs(args);

  // Handle global flags
  if (flags.version) {
    if (flags.json) {
      jsonOutput({ version: VERSION });
    } else {
      print(`undu v${VERSION}`);
    }
    return 0;
  }

  if (flags.help) {
    print(HELP_TEXT);
    return 0;
  }

  // Route commands
  switch (command) {
    case 'init':
      return cmdInit(flags.json);

    case 'status':
      return cmdStatus(flags.json);

    case 'save':
      return cmdSave(cmdArgs.join(' '), flags.json);

    case 'back':
      const steps = parseInt(cmdArgs[0]) || 1;
      return cmdBack(steps, flags.json);

    case 'goto':
      return cmdGoto(cmdArgs.join(' '), flags.json);

    case 'history':
      return cmdHistory(flags.json);

    case 'diff':
      return cmdDiff(flags.json);

    case 'peek':
      return cmdPeek(cmdArgs.join(' '), flags.json);

    case 'help':
      print(HELP_TEXT);
      return 0;

    default:
      printError(`Unknown command: ${command}`);
      print(style.muted("  Run 'undu --help' for usage"));
      return 1;
  }
}

// Run
main()
  .then(code => process.exit(code))
  .catch(err => {
    printError(`Fatal: ${err.message}`);
    process.exit(1);
  });
