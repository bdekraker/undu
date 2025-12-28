# Undu: The Vision

> A truly intuitive version control system built from first principles for the 2025 vibe-coding era.

## The Core Problem with Git

Git was designed by Linus Torvalds for coordinating thousands of Linux kernel developers. Its mental model assumes you understand directed acyclic graphs, three-way merges, and distributed systems theory. That's insane for someone who just wants to save their work and maybe undo a mistake.

## Design Principles

| Principle | Meaning |
|-----------|---------|
| **Zero concepts to start** | Works immediately, learn as needed |
| **Nothing is ever lost** | Safety as a core guarantee |
| **Human language** | No jargon, no cryptic commands |
| **Show, don't tell** | Visual feedback for everything |
| **AI-native** | Built assuming Claude (or similar) is your coding partner |

---

## The Mental Model: A Timeline, Not a Graph

Forget branches, staging areas, and HEAD pointers. There's just:

```
Your Project Timeline
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
◆ Now (unsaved changes)
│
● "Login working!" — 10 min ago        ←── you named this one
│
○ Auto-save — 15 min ago
│
○ Auto-save — 22 min ago
│
● "Before refactor" — 1 hour ago
│
○ Auto-save — 1.5 hours ago
│
● "First working version" — yesterday
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- **Auto-saves (○)** happen constantly in the background—like Google Docs
- **Checkpoints (●)** are moments YOU chose to name
- That's it. That's the whole model.

---

## CLI Commands

### Basic Commands

```bash
undu                          # Show status (most common need)
undu save "login working"     # Create a named checkpoint
undu undo                     # Go back one step
undu undo 5                   # Go back 5 steps
undu goto "before refactor"   # Jump to a named checkpoint
undu goto 2h                  # Go back 2 hours
undu history                  # See the timeline
undu diff                     # What changed since last save?
undu sync                     # Backup to cloud (or auto)
```

### Compare to Git

| Task | Git | Undu |
|------|-----|------|
| Save my work | `git add -A && git commit -m "..."` | `undu save "..."` |
| Go back | `git checkout HEAD~3` (scary) | `undu undo 3` |
| See history | `git log --oneline` | `undu history` |
| Undo one file | `git checkout -- file.py` (which checkout?) | `undu undo --file file.py` |
| Backup to cloud | `git push origin main` | happens automatically |
| What changed? | `git diff HEAD~1` | `undu diff` |
| Experiment safely | `git checkout -b feature; ...; git merge` | `undu try "experiment"` |

### Power User Aliases

```bash
undu s "message"    # save
undu u              # undo
undu u 3            # undo 3
undu h              # history
undu d              # diff
undu g "name"       # goto
```

---

## Magic Features

### 1. Time-Travel Preview

Before jumping to an old version, preview it:

```bash
undu peek "before refactor"
# Opens a read-only view of your project at that point
# See it without committing to it
```

### 2. Smart Undo with Scope

```bash
undu undo --file auth.py      # Undo changes to just this file
undu undo --last-hour         # Undo everything from the last hour
undu undo --keep login.py     # Undo everything EXCEPT this file
```

### 3. Natural Language Interface

Since we're in the AI era:

```bash
undu "go back to when the tests were passing"
undu "show me what I changed in the last 30 minutes"
undu "save this as my working backup"
undu "what broke between now and yesterday?"
```

### 4. Auto-Describe Changes

When you save, AI suggests a description:

```bash
$ undu save

Suggested: "Add user authentication with JWT tokens"
Accept? [Y/n/edit]:
```

### 5. Parallel Timelines (Advanced)

For users who want branch-like behavior, but intuitive:

```bash
undu try "experimental-feature"   # Start a parallel timeline
# ... make changes ...
undu keep                         # Merge back to main timeline
# OR
undu abandon                      # Discard this experiment
```

Visually:

```
Main Timeline          Experiment
     │
     ●────────────────→ ◆ trying something
     │                  │
     │                  ○ it's working...
     │                  │
     ●←─────────────────● keep it! (merged)
     │
```

---

## Storage Design

```
your-project/
├── .undu/
│   ├── undu.db          # SQLite: metadata, timeline, file index
│   ├── objects/         # Content-addressed blob storage
│   │   ├── a1/
│   │   │   └── b2c3d4...  # First 2 chars = folder, rest = filename
│   │   └── f7/
│   │       └── 89abcd...
│   └── config.toml      # Project settings
├── src/
├── index.html
└── ... your files
```

**Why SQLite + blob files?**

- SQLite handles metadata, queries, timeline beautifully
- Blob files for actual content (scales better, easy to sync)
- Content-addressed = automatic deduplication

---

## Smart CLI UX Design

### No Args = Status

```bash
$ undu

  undu | my-project
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  3 files changed since "Login working"

    M  src/auth.py      (+12, -3)
    A  src/utils.py     (new)
    D  old-file.js      (deleted)

  Quick actions:
    undu save "..."   Save these changes
    undu undo         Discard changes
    undu diff         See what changed
```

### AI-First Design

Every command supports:

```bash
undu status --json        # Structured output for AI parsing
undu history --json       # Timeline as JSON array
undu diff --json          # Machine-readable diff
```

**Exit Codes:**
- `0` — Success
- `1` — Error (with message)
- `2` — Nothing to do (e.g., `undu undo` with no changes)

**Non-TTY Detection:**
- Colors disabled automatically when piped
- Progress bars become simple logs
- Prompts fail gracefully or use defaults

---

## MCP Server Integration

The killer feature: Claude Code can interact with undu directly.

### Available Tools

```typescript
const tools = {
  undu_status:  "Get current project state and unsaved changes",
  undu_history: "List timeline with checkpoints and auto-saves",
  undu_diff:    "Show what changed between two points",
  undu_save:    "Create a named checkpoint",
  undu_undo:    "Revert to previous state",
  undu_goto:    "Jump to specific checkpoint by name or time",
  undu_peek:    "Preview a checkpoint without switching",
  undu_search:  "Find checkpoint where specific code existed"
}
```

### Example Interaction

```
You: "claude, something broke in the last hour"

Claude: *queries undu timeline via MCP*

Claude: "Found it. At 3:42pm you changed auth.py line 23,
        removing token validation. Want me to restore just that?"
```

---

## Technical Decisions

### Language: Bun/TypeScript

| Factor | Bun | Python | Rust |
|--------|-----|--------|------|
| Startup time | ~10ms | ~200ms | ~5ms |
| Single binary | `bun compile` | needs runtime | native |
| Dev speed | Fast | Fast | Slow |
| npm distribution | native | no | no |
| TypeScript | native | no | no |
| 2025 vibe | modern | dated | overkill |

### Distribution Channels

| Method | Command | Audience |
|--------|---------|----------|
| npm | `npm i -g undu` | Node developers |
| bun | `bun i -g undu` | Bun users |
| curl | `curl -fsSL .../install.sh \| sh` | Everyone |
| Homebrew | `brew install undu` | macOS/Linux |
| Binary | GitHub Releases | No runtime needed |

---

## Build Phases

### Phase 1: Core + MCP (Build Together)

```
src/
├── engine/          # The actual VCS logic
│   ├── store.ts     # SQLite + blob storage
│   ├── timeline.ts  # Checkpoint management
│   └── diff.ts      # Change detection
├── cli/             # Command-line interface
│   └── index.ts     # undu save, undo, history, etc.
└── mcp/             # MCP server
    └── server.ts    # Expose engine as MCP tools
```

### Phase 2: Distribution

- npm package
- PyPI wrapper (calls the binary)
- Homebrew formula
- Standalone binaries for all platforms

### Phase 3: VS Code Extension

- Visual timeline sidebar
- Click to preview any checkpoint
- One-click save with AI-suggested message
- Inline diff highlighting

### Phase 4: Advanced Features

- Cloud sync (S3, or GitHub as hidden backend)
- Team collaboration
- Natural language commands via Claude API
- Auto-save daemon with file watching

---

## The Philosophy

**Git asks:** "What is the state of the repository?"

**Undu asks:** "What do you want to do?"

---

## Links

- npm: https://www.npmjs.com/package/undu
- PyPI: https://pypi.org/project/undu/
- GitHub: https://github.com/bdekraker/undu

---

*Built for humans who just want to code.*
