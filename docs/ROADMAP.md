# Undu Roadmap: Deep Feature Design

> Thinking through each feature from first principles, aligned with the undu philosophy.

---

## The Five Principles (Reference)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. ZERO CONCEPTS TO START     Works immediately, learn as needed           │
│  2. NOTHING IS EVER LOST       Safety as a core guarantee                   │
│  3. HUMAN LANGUAGE             No jargon, no cryptic commands               │
│  4. SHOW, DON'T TELL           Visual feedback for everything               │
│  5. AI-NATIVE                  Built assuming Claude is your partner        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

# Feature 0.5: Auto-Init & Watch Improvements

## Current Behavior

```
  Currently:
  ───────────────────────────────────────────────────────────────────
  • `undu init` is REQUIRED to create .undu/ directory
  • `undu watch` is SEPARATE command (not auto-started)
  • User must explicitly initialize and enable watching
```

## Proposed Improvements

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │  IMPROVEMENT 1: Auto-Init on First Save                                 │
  │  ───────────────────────────────────────────────────────────────────    │
  │                                                                         │
  │  Instead of:                                                            │
  │    $ undu save "first save"                                             │
  │    Error: Not an undu repository. Run 'undu init' first.                │
  │                                                                         │
  │  Do this:                                                               │
  │    $ undu save "first save"                                             │
  │    ✓ Initialized undu in my-project/                                    │
  │    ✓ Saved checkpoint: "first save"                                     │
  │                                                                         │
  │  Zero friction. Just works.                                             │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │  IMPROVEMENT 2: Combined Init + Watch                                   │
  │  ───────────────────────────────────────────────────────────────────    │
  │                                                                         │
  │    $ undu init --watch                                                  │
  │    ✓ Initialized undu in my-project/                                    │
  │    ✓ Watching for changes...                                            │
  │                                                                         │
  │  Or via config:                                                         │
  │    $ undu config set autoWatch true                                     │
  │                                                                         │
  │  Then any undu command auto-starts the watcher in background.           │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │  IMPROVEMENT 3: Background Daemon                                       │
  │  ───────────────────────────────────────────────────────────────────    │
  │                                                                         │
  │  Instead of keeping terminal open with `undu watch`:                    │
  │                                                                         │
  │    $ undu watch --daemon                                                │
  │    ✓ Started undu daemon (PID 12345)                                    │
  │    ✓ Auto-saving in background                                          │
  │                                                                         │
  │    $ undu watch --stop                                                  │
  │    ✓ Stopped undu daemon                                                │
  │                                                                         │
  │  Runs silently, survives terminal close.                                │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
```

## Design Decision

Keep `init` explicit for now (user knows they're enabling version control),
but make it more forgiving:
- Suggest `init` when running commands in uninitialized folder
- Add `--watch` flag to init
- Consider auto-init as opt-in config option

**Complexity:** Low (mostly UX polish)

---

# Feature 1: Auto-Save Daemon

## The Philosophy

> "Nothing is ever lost."

This is the **core promise** of undu. The user should never lose work because they
forgot to save. Like Google Docs, but for code.

## The Ideal Experience

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │   You write code.                                                       │
  │                                                                         │
  │   That's it. That's all you do.                                         │
  │                                                                         │
  │   In the background, undu is quietly saving your work.                  │
  │   You never think about it.                                             │
  │   You never lose anything.                                              │
  │                                                                         │
  │   When you want to mark something important:                            │
  │                                                                         │
  │       undu save "login working"                                         │
  │                                                                         │
  │   That's a checkpoint. Everything else is auto-saved.                   │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
```

## How It Should Work

### Triggering Auto-Saves

```
  When to save?
  ─────────────────────────────────────────────────────────────────────

  ┌─────────────────┐
  │  File Changed   │ ──▶ Start 30-second timer
  └─────────────────┘            │
                                 │ (more changes reset timer)
                                 ▼
                     ┌───────────────────────┐
                     │  30 sec of inactivity │ ──▶ AUTO-SAVE
                     └───────────────────────┘

  Also trigger on:
  • Editor save (Ctrl+S detected via file mtime)
  • Focus lost (user switches to another app)
  • Every 5 minutes regardless (safety net)
```

### What Gets Saved

```
  Auto-save (○)              Checkpoint (●)
  ────────────────────────────────────────────────────────

  • Automatic                • Manual (undu save "...")
  • Silent                   • Named by user
  • Frequent                 • Intentional
  • Pruned over time         • Kept forever
  • "I might need this"      • "This is important"
```

### Smart Pruning Strategy

```
  Time                    Auto-saves kept
  ─────────────────────────────────────────────────────────────────────

  Last 1 hour             ALL (~120 if saving every 30s)
  Last 24 hours           1 per 10 minutes (~144)
  Last 7 days             1 per hour (~168)
  Last 30 days            1 per day (~30)
  Older than 30 days      1 per week

  Named checkpoints (●)   NEVER PRUNED — kept forever

  ─────────────────────────────────────────────────────────────────────
  Total storage: A few hundred snapshots max, heavily deduplicated
```

### User Experience

```bash
# The daemon starts automatically when you run any undu command
# Or explicitly:
$ undu watch

  ┌─────────────────────────────────────────────────────────┐
  │  undu watching: my-project                              │
  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
  │                                                         │
  │  Auto-saving every 30 seconds of inactivity             │
  │  Press Ctrl+C to stop (your work is still safe)         │
  │                                                         │
  │  ○ Auto-saved — just now (3 files)                      │
  │                                                         │
  └─────────────────────────────────────────────────────────┘

# In your editor, you see a subtle indicator:
#   undu ● (green = all saved)
#   undu ○ (yellow = pending save, will happen in ~30s)

# History shows both auto-saves and checkpoints:
$ undu history

  Your Timeline
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ◆ Now (3 files changed)
  │
  ○ Auto-save ─────────────────────── 45 sec ago
  │
  ○ Auto-save ─────────────────────── 2 min ago
  │
  ● "Login feature complete" ──────── 8 min ago     ← you named this
  │
  ○ Auto-save ─────────────────────── 12 min ago
  │
  ○ Auto-save ─────────────────────── 15 min ago
  │
  ● "Started login work" ──────────── 20 min ago    ← you named this
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Implementation Details

```typescript
// Auto-save daemon architecture

┌─────────────────────────────────────────────────────────────────┐
│                       undu watch                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │ File Watcher│ ───▶ │  Debouncer  │ ───▶ │   Engine    │     │
│  │ (chokidar)  │      │  (30 sec)   │      │  .save()    │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│         │                                         │             │
│         │                                         ▼             │
│         │                                  ┌─────────────┐      │
│         │                                  │   Pruner    │      │
│         │                                  │ (runs daily)│      │
│         └──────────────────────────────────┴─────────────┘      │
│                                                                 │
│  Config (.undu/config.toml):                                    │
│  • autoSave.enabled = true                                      │
│  • autoSave.intervalMs = 30000                                  │
│  • autoSave.pruneAfterDays = 30                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

# Feature 2: Natural Language Commands

## The Philosophy

> "Human language — no jargon, no cryptic commands."
> "AI-native — built assuming Claude is your coding partner."

The user should be able to express **intent**, not memorize syntax.

## The Ideal Experience

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │   You think in human thoughts, not git commands.                        │
  │                                                                         │
  │   "I want to go back to this morning"                                   │
  │   "What did I change in the last hour?"                                 │
  │   "Undo everything except the config file"                              │
  │   "Go back to when the tests were passing"                              │
  │                                                                         │
  │   undu understands you.                                                 │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
```

## Command Categories

### 1. Time-Based (Parse Locally — No AI Needed)

```bash
$ undu "30 minutes ago"
  → undu goto --time="30m"

$ undu "this morning"
  → undu goto --time="today 9:00"

$ undu "yesterday"
  → undu goto --time="yesterday"

$ undu "last tuesday"
  → undu goto --time="last tuesday"

$ undu "2 hours ago"
  → undu goto --time="2h"
```

**Implementation:** Regex patterns + date parsing library. No AI needed.

### 2. Content-Based (Search Checkpoints)

```bash
$ undu "before the refactor"
  Searching checkpoints for "refactor"...

  Found:
    ● "Before big refactor" — 2 days ago
    ● "Refactored auth module" — 1 week ago

  Go to which one? [1/2]:

$ undu "when login was working"
  Searching for "login"...

  Found 3 checkpoints mentioning "login":
    1. "Login feature complete" — yesterday
    2. "Login bug fixed" — 3 days ago
    3. "Started login work" — last week

  Which one? [1/2/3]:
```

**Implementation:** SQLite full-text search on checkpoint messages.

### 3. Intent-Based (Needs AI)

```bash
$ undu "go back to when the tests were passing"
```

This is **hard**. Options:

```
  Option A: Tag-based (Simple)
  ────────────────────────────────────────────────────────────
  User manually tags checkpoints:

    $ undu save "tests passing" --tag=green

  Then:
    $ undu "when tests were passing"
    → Searches for --tag=green

  Pros: Simple, works offline
  Cons: Requires user discipline


  Option B: CI Integration (Automatic)
  ────────────────────────────────────────────────────────────
  undu hooks into test runner:

    $ undu test npm test

  If tests pass → auto-tag checkpoint as "green"
  If tests fail → auto-tag as "red"

  Then:
    $ undu "when tests were passing"
    → Find most recent "green" tag

  Pros: Automatic, accurate
  Cons: More complex setup


  Option C: AI Analysis (Smart)
  ────────────────────────────────────────────────────────────
  Claude analyzes the query and checkpoint history:

  User: "go back to when tests were passing"

  Claude thinks:
    1. User wants to find a working state
    2. Look for checkpoints with "test", "pass", "green", "working"
    3. Or: actually run tests at each checkpoint (expensive)
    4. Suggest most likely candidate

  Pros: Handles ambiguity, very smart
  Cons: Needs API key, network, costs money
```

### 4. Auto-Describe Changes

```bash
$ undu save

  Analyzing changes...

  ┌─────────────────────────────────────────────────────────┐
  │  Suggested message:                                     │
  │                                                         │
  │  "Add JWT authentication to login endpoint"             │
  │                                                         │
  │  Based on:                                              │
  │  • New file: src/auth/jwt.ts                            │
  │  • Modified: src/routes/login.ts (+45 lines)            │
  │  • Modified: package.json (added jsonwebtoken)          │
  └─────────────────────────────────────────────────────────┘

  Accept? [Y/n/edit]:
```

**Implementation:**
- Collect changed files and diff summary
- Send to Claude API with prompt: "Summarize these changes in <10 words"
- Cache recent suggestions to reduce API calls

## Architecture

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │   User Input                                                            │
  │       │                                                                 │
  │       ▼                                                                 │
  │   ┌─────────────────────┐                                               │
  │   │   Intent Parser     │                                               │
  │   └─────────┬───────────┘                                               │
  │             │                                                           │
  │     ┌───────┴───────┬───────────────┬────────────────┐                  │
  │     ▼               ▼               ▼                ▼                  │
  │  ┌──────┐      ┌─────────┐    ┌──────────┐    ┌───────────┐            │
  │  │ Time │      │ Content │    │  Intent  │    │  Fallback │            │
  │  │ Parser│     │ Search  │    │   (AI)   │    │  (ask)    │            │
  │  └───┬──┘      └────┬────┘    └────┬─────┘    └─────┬─────┘            │
  │      │              │              │                │                   │
  │      │   "2h ago"   │  "refactor"  │  "tests pass"  │  unclear          │
  │      │              │              │                │                   │
  │      ▼              ▼              ▼                ▼                   │
  │   undu goto      undu goto     Claude API      "Did you mean...?"      │
  │   --time=2h      "refactor"    → suggestion                            │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
```

## Priority Implementation

```
  Phase 1 (No AI Required)
  ─────────────────────────────────────────────────────────────
  • Time parsing: "30 min ago", "yesterday", "this morning"
  • Content search: "before refactor", "login working"
  • Pattern matching: common phrases → commands

  Phase 2 (Simple AI)
  ─────────────────────────────────────────────────────────────
  • Auto-describe changes (on save)
  • Smart search with Claude when local search fails

  Phase 3 (Advanced AI)
  ─────────────────────────────────────────────────────────────
  • "When tests were passing" (requires test integration)
  • "What broke between now and yesterday?" (requires code analysis)
  • Conversational interface
```

### 5. AI-Powered Auto-Changelogs

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │  Instead of "Auto-save" messages, AI writes human-readable summaries:   │
  │                                                                         │
  │  BEFORE (boring):                                                       │
  │    ○ Auto-save ─────────────────────── 2 min ago                        │
  │    ○ Auto-save ─────────────────────── 5 min ago                        │
  │    ○ Auto-save ─────────────────────── 8 min ago                        │
  │                                                                         │
  │  AFTER (AI-powered):                                                    │
  │    ○ "Fixed login validation bug" ──── 2 min ago                        │
  │    ○ "Added JWT token handling" ────── 5 min ago                        │
  │    ○ "Refactored auth middleware" ──── 8 min ago                        │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
```

**How it works:**

```
  ┌───────────────┐     diff      ┌───────────────┐     prompt     ┌─────────┐
  │  File Change  │ ────────────▶ │  Collect Diff │ ─────────────▶ │  LLM    │
  └───────────────┘               └───────────────┘                │  API    │
                                                                   └────┬────┘
                                                                        │
                                    ┌───────────────────────────────────┘
                                    ▼
                          "Added error handling to login endpoint"
```

**Implementation Options:**

```
  Option A: Local LLM (Ollama)
  ───────────────────────────────────────────────────────────────────
  • No API key needed
  • Works offline
  • Needs ~8GB RAM for decent model
  • Slower but private

  Option B: Cloud API (Claude/OpenAI)
  ───────────────────────────────────────────────────────────────────
  • Fast and high quality
  • Requires API key
  • Small cost per save (~$0.001)
  • Best descriptions

  Option C: Hybrid
  ───────────────────────────────────────────────────────────────────
  • Try local first, fall back to cloud
  • Best of both worlds
  • User configures preference
```

**User Experience:**

```bash
# Enable AI changelogs
$ undu config set ai.enabled true
$ undu config set ai.provider claude  # or ollama, openai

# Now auto-saves get smart messages
$ undu history

  Your Timeline
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ◆ Now (2 files changed)
  │
  ○ "Added input validation to signup form" ───── 1 min ago
  │
  ○ "Fixed typo in error message" ─────────────── 3 min ago
  │
  ● "User auth complete" ──────────────────────── 10 min ago  ← manual
  │
  ○ "Started working on password reset" ───────── 15 min ago
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Complexity:** Medium
- Diff collection: Already have this
- API integration: Straightforward
- Caching: Avoid redundant calls
- Fallback: Graceful degradation if AI unavailable

---

# Feature 2.5: Interactive CLI

## The Philosophy

> "Show, don't tell."

The terminal can be more than text. Modern CLI tools use arrow keys, colors, and
real-time updates to create rich interactive experiences.

## The Ideal Experience

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │  Instead of typing commands, you navigate visually:                     │
  │                                                                         │
  │  $ undu                                                                 │
  │                                                                         │
  │  ┌─────────────────────────────────────────────────────────────────┐   │
  │  │  Your Timeline                              ↑↓ Navigate  Enter ↵  │   │
  │  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │   │
  │  │                                                                   │   │
  │  │  ◆ Now (2 files changed)                                          │   │
  │  │  │                                                                │   │
  │  │  ▸ ● "Login feature complete" ────────── 10 min ago   ← selected  │   │
  │  │  │                                                                │   │
  │  │  ○ Auto-save ────────────────────────── 15 min ago                │   │
  │  │  │                                                                │   │
  │  │  ● "Started auth work" ──────────────── 1 hour ago                │   │
  │  │                                                                   │   │
  │  │  [d] diff  [g] goto  [p] peek  [q] quit                           │   │
  │  └─────────────────────────────────────────────────────────────────┘   │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
```

## Features

```
  Interactive History Browser
  ───────────────────────────────────────────────────────────────────
  • Arrow keys to navigate timeline
  • Enter to select checkpoint
  • 'd' to see diff from selected point
  • 'g' to goto (restore) selected checkpoint
  • 'p' to peek at files in that checkpoint
  • 'q' to quit

  Interactive Diff Viewer
  ───────────────────────────────────────────────────────────────────
  • Side-by-side or unified view
  • Scroll through changes
  • Jump between files
  • Syntax highlighting

  Interactive Save
  ───────────────────────────────────────────────────────────────────
  • See what will be saved
  • Select/deselect files
  • Edit message inline
  • Confirm before saving
```

## Library Options

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │  Ink (React for CLIs) - RECOMMENDED                                     │
  │  ───────────────────────────────────────────────────────────────────    │
  │  • React-like components for terminal                                   │
  │  • Used by Gatsby, Prisma, Shopify CLI                                  │
  │  • Great for complex UIs                                                │
  │  • npm: ink                                                             │
  │                                                                         │
  │  Clack - LIGHTWEIGHT OPTION                                             │
  │  ───────────────────────────────────────────────────────────────────    │
  │  • Beautiful prompts and spinners                                       │
  │  • Very lightweight                                                     │
  │  • Good for simpler interactions                                        │
  │  • npm: @clack/prompts                                                  │
  │                                                                         │
  │  Blessed / Blessed-contrib - FULL TUI                                   │
  │  ───────────────────────────────────────────────────────────────────    │
  │  • Full terminal UI framework                                           │
  │  • Widgets, layouts, dashboards                                         │
  │  • More complex but very powerful                                       │
  │  • npm: blessed, blessed-contrib                                        │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
```

## Recommended Approach

Start with **Clack** for simple interactions (prompts, selections),
add **Ink** later for the full interactive history browser.

```typescript
// Example with Clack
import { select, confirm } from '@clack/prompts';

const checkpoint = await select({
  message: 'Select checkpoint to restore:',
  options: checkpoints.map(c => ({
    value: c.id,
    label: `${c.message} — ${timeAgo(c.timestamp)}`
  }))
});

const confirmed = await confirm({
  message: `Restore to "${checkpoint.message}"?`
});
```

**Complexity:** Medium
- Clack integration: Easy (few hours)
- Full Ink history browser: More involved (days)
- Cross-platform terminal support: Some quirks on Windows

---

# Feature 3: Parallel Timelines (Branching)

## The Philosophy

> "Zero concepts to start — works immediately, learn as needed."

Branching is an **advanced** feature. Most users don't need it. But when they do,
it should be intuitive, not terrifying.

## The Problem with Git Branches

```
  Git makes you think about branches BEFORE you need them:

    $ git checkout -b feature    ← "I might want to experiment"
    $ # ... work ...
    $ git checkout main          ← "Wait, did I commit?"
    $ git merge feature          ← "What if there are conflicts?"

  The mental overhead is BEFORE the work, not after.
```

## The undu Way: "Try Mode"

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │   You don't plan experiments. You just... try things.                   │
  │                                                                         │
  │   When you realize "this might break everything":                       │
  │                                                                         │
  │       undu try "risky optimization"                                     │
  │                                                                         │
  │   Now you're safe. Work freely.                                         │
  │                                                                         │
  │   If it works:    undu keep      ← merge back                           │
  │   If it fails:    undu abandon   ← like it never happened               │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
```

## Visual Model

```
  BEFORE "try"                 DURING "try"                  AFTER "keep"
  ────────────────────────────────────────────────────────────────────────

       Main                    Main         Try                   Main
        │                       │            │                     │
        ●                       ●───────────▶◆ (trying)            ●
        │                       │            │                     │
        │                       │            ○ auto-save           │
        │                       │            │                     │
        ◆ (now)                 │            ○ auto-save           ●◀─┐
                                │            │                     │  │
                                │            ●───────────────────────┘
                                │            (merged)


  AFTER "abandon"
  ────────────────────────────────────────────────────────────────────────

       Main
        │
        ● (back to save point)
        │
        ◆ (now)

        The experiment? Gone. Like it never happened.
```

## User Experience

```bash
# You're working and realize you want to try something risky
$ undu try "experiment with new auth"

  ┌─────────────────────────────────────────────────────────┐
  │  ✓ Created save point                                   │
  │  ✓ You're now in TRY MODE                               │
  │                                                         │
  │  Work freely! When you're done:                         │
  │    undu keep     — merge changes to main timeline       │
  │    undu abandon  — discard and go back                  │
  └─────────────────────────────────────────────────────────┘

# Your prompt/status now shows you're in try mode:
$ undu

  undu | my-project (trying: "experiment with new auth")
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  In try mode since 15 minutes ago
  12 files changed from save point

  Commands:
    undu keep      Merge these changes back
    undu abandon   Discard and return to save point
    undu diff      See what you've changed

# The experiment worked! Keep it.
$ undu keep

  ✓ Changes merged to main timeline
  ✓ Try mode ended

# Or it failed... abandon it.
$ undu abandon

  ⚠ Discard all changes since "experiment with new auth"?
  This cannot be undone. [y/N]: y

  ✓ Restored to save point
  ✓ Try mode ended
```

## Handling "Conflicts"

Git's merge conflicts are terrifying because they corrupt your files with
`<<<<<<< HEAD` markers. undu takes a different approach:

```bash
$ undu keep

  These files were changed in BOTH main and your experiment:

  ┌─────────────────────────────────────────────────────────────────────┐
  │ src/auth.ts                                                         │
  ├─────────────────────────────────────────────────────────────────────┤
  │                                                                     │
  │  MAIN (before try)          │  EXPERIMENT (your changes)            │
  │  ───────────────────────────│────────────────────────────────────── │
  │  function login(user) {     │  async function login(user) {         │
  │    return validate(user);   │    const token = await getJWT(user);  │
  │  }                          │    return { user, token };            │
  │                             │  }                                    │
  │                                                                     │
  └─────────────────────────────────────────────────────────────────────┘

  Keep which version?

  [e] Experiment (your changes)  ← usually what you want
  [m] Main (before try)
  [b] Both (save main as .backup)

  > e

  ✓ Kept experiment version of src/auth.ts
  ✓ All conflicts resolved
  ✓ Changes merged to main timeline
```

## Constraints (Simplicity)

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │   CONSTRAINT: Only ONE parallel timeline at a time.                     │
  │                                                                         │
  │   Why?                                                                  │
  │   • Keeps mental model simple                                           │
  │   • Prevents "branch spaghetti"                                         │
  │   • If you need multiple experiments, finish one first                  │
  │                                                                         │
  │   If you try to start another:                                          │
  │                                                                         │
  │       $ undu try "another experiment"                                   │
  │       ⚠ You're already in try mode ("risky optimization")               │
  │                                                                         │
  │       Finish this experiment first:                                     │
  │         undu keep      — merge and start new experiment                 │
  │         undu abandon   — discard and start new experiment               │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

# Feature 4: Cloud Sync

## The Philosophy

> "Nothing is ever lost." (even if your laptop dies)

## The Ideal Experience

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │   Your checkpoints are backed up. Automatically. Securely.              │
  │                                                                         │
  │   You don't think about it.                                             │
  │                                                                         │
  │   If your laptop catches fire, you just:                                │
  │                                                                         │
  │       undu clone my-project                                             │
  │                                                                         │
  │   And everything is back. All your history. All your checkpoints.       │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
```

## Sync Backends

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Backend Options                                                        │
  ├─────────────────────────────────────────────────────────────────────────┤
  │                                                                         │
  │  1. GitHub (Recommended)                                                │
  │     • Free (within storage limits)                                      │
  │     • Private repo as hidden backend                                    │
  │     • User already has account                                          │
  │     • Implementation: git push under the hood                           │
  │                                                                         │
  │  2. S3 / GCS / Azure                                                    │
  │     • Bring your own bucket                                             │
  │     • More storage, more control                                        │
  │     • For power users                                                   │
  │                                                                         │
  │  3. Local Folder                                                        │
  │     • Syncs to ~/Dropbox/.undu-backup/                                  │
  │     • Or Google Drive, OneDrive, etc.                                   │
  │     • Piggyback on existing sync                                        │
  │                                                                         │
  │  4. undu Cloud (Future)                                                 │
  │     • Hosted service                                                    │
  │     • Team features                                                     │
  │     • Monetization path                                                 │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
```

## User Experience

```bash
# One-time setup
$ undu sync setup

  Where should undu backup your checkpoints?

  [1] GitHub (recommended, free)
  [2] S3 bucket (bring your own)
  [3] Local folder (for Dropbox/Drive)

  > 1

  ┌─────────────────────────────────────────────────────────┐
  │  Opening browser for GitHub authorization...            │
  └─────────────────────────────────────────────────────────┘

  ✓ Connected to GitHub as @bdekraker
  ✓ Created private repo: bdekraker/undu-sync-my-project
  ✓ Auto-sync enabled

  Your checkpoints are now backed up automatically.

# Check sync status
$ undu sync

  ┌─────────────────────────────────────────────────────────┐
  │  Sync Status                                            │
  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
  │                                                         │
  │  ✓ Synced with GitHub                                   │
  │    Last backup: 2 minutes ago                           │
  │    Checkpoints: 47                                      │
  │    Total size: 23 MB (156 MB deduplicated)              │
  │                                                         │
  │    github.com/bdekraker/undu-sync-my-project            │
  └─────────────────────────────────────────────────────────┘

# Force sync now
$ undu sync now

  Syncing...
  ✓ 3 new checkpoints uploaded
  ✓ Sync complete

# Restore on new machine
$ undu clone my-project

  Cloning from GitHub...
  ✓ Downloaded 47 checkpoints (23 MB)
  ✓ Restored to latest checkpoint: "Deploy ready"

  Welcome back!
```

---

# Feature 5: Large File & Binary Handling

## The Problem

Currently undu tracks ALL files the same way — including large media files like
videos, images, and compiled binaries. This can cause:

1. **Storage bloat**: A 500MB video stored on every save
2. **Slow saves**: Reading/hashing large files takes time
3. **No delta compression**: Unlike git, we store full copies (deduped, but still)

## The Philosophy

> "Zero concepts to start — works immediately, learn as needed."

Users shouldn't have to configure anything for a reasonable experience. undu should
be smart about large files by default.

## Proposed Solution

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │  SMART FILE HANDLING                                                    │
  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
  │                                                                         │
  │  Small files (<1MB)        Track normally                               │
  │  ───────────────────────────────────────────────────────────────────    │
  │  • Full content stored                                                  │
  │  • SHA-256 deduplication                                                │
  │  • Instant restore                                                      │
  │                                                                         │
  │  Medium files (1-50MB)     Track with warning                           │
  │  ───────────────────────────────────────────────────────────────────    │
  │  • Still tracked by default                                             │
  │  • Show size in status output                                           │
  │  • Suggest adding to ignore if appropriate                              │
  │                                                                         │
  │  Large files (>50MB)       Skip by default                              │
  │  ───────────────────────────────────────────────────────────────────    │
  │  • Auto-add to ignore list                                              │
  │  • Warn user on first encounter                                         │
  │  • Can override with --include-large                                    │
  │                                                                         │
  │  Binary detection          Smart defaults                               │
  │  ───────────────────────────────────────────────────────────────────    │
  │  • Auto-ignore common binary extensions                                 │
  │  • .mp4, .mov, .avi, .mkv (video)                                       │
  │  • .zip, .tar, .gz, .rar (archives)                                     │
  │  • .exe, .dll, .so, .dylib (binaries)                                   │
  │  • .psd, .sketch, .fig (design files)                                   │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
```

## User Experience

```bash
# Status shows large file warnings
$ undu

  undu | my-project
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  3 files changed since "Login working"

    M  src/auth.py
    A  src/utils.py
    !  assets/demo.mp4 (skipped: 156 MB)

  Tip: Large files are auto-skipped. See 'undu config' to change.

# Explicit include if needed
$ undu save "with video" --include-large

# Configure thresholds
$ undu config set maxFileSize 100MB
```

## Config Options

```toml
# .undu/config.toml

[files]
maxFileSize = "50MB"           # Skip files larger than this
warnFileSize = "1MB"           # Warn about files larger than this
includeLarge = false           # Set true to track all files

# Auto-ignore these extensions (in addition to ignore list)
binaryExtensions = [
  ".mp4", ".mov", ".avi", ".mkv", ".webm",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".exe", ".dll", ".so", ".dylib",
  ".psd", ".sketch", ".fig", ".ai",
  ".pdf",  # Optional - some want to track these
]
```

## Implementation

```typescript
// In scanFiles() or save():

async function shouldTrackFile(path: string, stats: Stats): Promise<TrackDecision> {
  const ext = extname(path).toLowerCase();
  const size = stats.size;

  // Check binary extensions
  if (config.binaryExtensions.includes(ext)) {
    return { track: false, reason: 'binary-extension' };
  }

  // Check size limits
  if (size > config.maxFileSize) {
    return { track: false, reason: 'too-large', size };
  }

  if (size > config.warnFileSize) {
    return { track: true, warn: true, size };
  }

  return { track: true };
}
```

---

# Priority Order

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │  PRIORITY 1: Auto-Save Daemon  ✓ DONE                                   │
  │  ───────────────────────────────────────────────────────────────────    │
  │  This IS the core promise. "Nothing is ever lost."                      │
  │  Without this, undu is just git with nicer syntax.                      │
  │                                                                         │
  │                                                                         │
  │  PRIORITY 1.5: Large File & Binary Handling  ← NEXT                     │
  │  ───────────────────────────────────────────────────────────────────    │
  │  Smart defaults for media files and binaries.                           │
  │  Skip >50MB files, auto-ignore common binary extensions.                │
  │                                                                         │
  │                                                                         │
  │  PRIORITY 2: Natural Language (Phase 1)                                 │
  │  ───────────────────────────────────────────────────────────────────    │
  │  Time parsing and content search. No AI needed yet.                     │
  │  "30 min ago", "before refactor" — just works.                          │
  │                                                                         │
  │                                                                         │
  │  PRIORITY 3: Parallel Timelines                                         │
  │  ───────────────────────────────────────────────────────────────────    │
  │  "undu try" / "undu keep" / "undu abandon"                              │
  │  Simple branching for experiments.                                      │
  │                                                                         │
  │                                                                         │
  │  PRIORITY 4: Natural Language (Phase 2)                                 │
  │  ───────────────────────────────────────────────────────────────────    │
  │  AI integration: auto-describe, smart search.                           │
  │  Requires Claude API key.                                               │
  │                                                                         │
  │                                                                         │
  │  PRIORITY 5: Cloud Sync                                                 │
  │  ───────────────────────────────────────────────────────────────────    │
  │  GitHub as backend. Automatic backup.                                   │
  │  Nice to have, but local storage works fine.                            │
  │                                                                         │
  │                                                                         │
  │  PRIORITY 6: VS Code Extension                                          │
  │  ───────────────────────────────────────────────────────────────────    │
  │  Visual timeline. Click to restore.                                     │
  │  Lower priority — CLI works, MCP works.                                 │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

# Implementation Timeline

```
  Week 1-2: Auto-Save Daemon
  ─────────────────────────────────────────────────────────────────────────
  • File watcher with debouncing
  • Background process management
  • Pruning strategy
  • Integration with existing engine

  Week 3: Natural Language (Phase 1)
  ─────────────────────────────────────────────────────────────────────────
  • Time parsing ("30 min ago", "yesterday")
  • Content search (SQLite FTS on checkpoint messages)
  • Pattern matching for common phrases

  Week 4: Parallel Timelines
  ─────────────────────────────────────────────────────────────────────────
  • "try" / "keep" / "abandon" commands
  • Try mode state in database
  • Simple conflict resolution UI

  Week 5-6: Polish & Testing
  ─────────────────────────────────────────────────────────────────────────
  • Edge cases
  • Tests
  • Documentation
  • Dogfooding

  Future: AI Features & Cloud Sync
  ─────────────────────────────────────────────────────────────────────────
  • Claude API integration
  • GitHub sync backend
  • VS Code extension
```

---

*The best version control is the one you never think about.*
