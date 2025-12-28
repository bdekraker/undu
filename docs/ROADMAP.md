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

# Priority Order

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │  PRIORITY 1: Auto-Save Daemon                                           │
  │  ───────────────────────────────────────────────────────────────────    │
  │  This IS the core promise. "Nothing is ever lost."                      │
  │  Without this, undu is just git with nicer syntax.                      │
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
