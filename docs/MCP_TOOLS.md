# Undu MCP Tools Reference

This document describes the MCP tools available for AI assistants (like Claude) to interact with undu repositories.

## Setup

Add to your Claude Code MCP settings (`~/.config/claude-code/settings.json` or similar):

```json
{
  "mcpServers": {
    "undu": {
      "command": "bun",
      "args": ["run", "/path/to/undu/src/mcp/server.ts"]
    }
  }
}
```

## Available Tools

### undu_status

Get the current status of the undu repository.

**Parameters:**
- `path` (optional): Path to the project directory

**Returns:**
```json
{
  "projectName": "my-project",
  "currentCheckpoint": {
    "id": "abc123",
    "message": "Login working",
    "timestamp": "2025-01-15T10:30:00Z",
    "filesCount": 15
  },
  "unsavedChanges": [
    { "path": "src/auth.py", "type": "modified" },
    { "path": "src/utils.py", "type": "added" }
  ],
  "hasUnsavedChanges": true,
  "totalCheckpoints": 5,
  "totalAutoSaves": 12
}
```

### undu_history

Get the timeline of checkpoints.

**Parameters:**
- `path` (optional): Path to the project directory
- `limit` (optional): Maximum checkpoints to return (default: 20)

**Returns:**
```json
{
  "checkpoints": [
    {
      "id": "abc123",
      "message": "Login working",
      "timestamp": "2025-01-15T10:30:00Z",
      "isAutoSave": false,
      "isCurrent": true,
      "filesCount": 15
    }
  ],
  "currentId": "abc123",
  "totalCount": 17
}
```

### undu_diff

Show what changed between checkpoints or since last save.

**Parameters:**
- `path` (optional): Path to the project directory
- `from` (optional): Starting checkpoint ID or name
- `to` (optional): Ending checkpoint ID or name (defaults to current working directory)

**Returns:**
```json
{
  "from": { "id": "abc123", "message": "Login working", "timestamp": "..." },
  "to": "current working directory",
  "changes": [
    { "path": "src/auth.py", "type": "modified" },
    { "path": "src/new.py", "type": "added" }
  ],
  "summary": {
    "filesChanged": 2,
    "additions": 1,
    "deletions": 0
  }
}
```

### undu_save

Create a new checkpoint.

**Parameters:**
- `path` (optional): Path to the project directory
- `message` (required): Description for the checkpoint

**Returns:**
```json
{
  "success": true,
  "checkpoint": {
    "id": "def456",
    "message": "Added authentication",
    "timestamp": "2025-01-15T10:35:00Z",
    "filesCount": 16
  }
}
```

### undu_back

Go back to a previous checkpoint. **Warning: Discards unsaved changes!**

**Parameters:**
- `path` (optional): Path to the project directory
- `steps` (optional): Number of steps to go back (default: 1)

**Returns:**
```json
{
  "success": true,
  "restoredTo": {
    "id": "abc123",
    "message": "Login working",
    "timestamp": "2025-01-15T10:30:00Z"
  }
}
```

### undu_goto

Jump to a specific checkpoint by name or ID. **Warning: Discards unsaved changes!**

**Parameters:**
- `path` (optional): Path to the project directory
- `target` (required): Checkpoint name or ID

**Returns:**
```json
{
  "success": true,
  "restoredTo": {
    "id": "abc123",
    "message": "Login working",
    "timestamp": "2025-01-15T10:30:00Z"
  }
}
```

### undu_peek

Preview a checkpoint without switching to it.

**Parameters:**
- `path` (optional): Path to the project directory
- `target` (required): Checkpoint name or ID

**Returns:**
```json
{
  "checkpoint": {
    "id": "abc123",
    "message": "Login working",
    "timestamp": "2025-01-15T10:30:00Z",
    "isAutoSave": false
  },
  "files": [
    { "path": "src/auth.py", "size": 1234 },
    { "path": "src/main.py", "size": 567 }
  ],
  "totalSize": 1801
}
```

### undu_file_at

Get the content of a file at a specific checkpoint. Useful for comparing versions.

**Parameters:**
- `path` (optional): Path to the project directory
- `file` (required): Path to the file within the project
- `checkpoint` (required): Checkpoint name or ID

**Returns:**
```json
{
  "file": "src/auth.py",
  "checkpoint": {
    "id": "abc123",
    "message": "Login working"
  },
  "content": "def login(user, password):\n    ...",
  "size": 1234
}
```

### undu_init

Initialize a new undu repository.

**Parameters:**
- `path` (required): Path to initialize

**Returns:**
```json
{
  "success": true,
  "message": "Initialized undu repository at /path/to/project"
}
```

## Example Conversations

### Finding When Something Broke

```
User: "The login is broken, it was working earlier today"

Claude: Let me check your undu timeline to find when it was last working.

[Uses undu_history]

Claude: I found 3 checkpoints today:
- "Added OAuth" at 3:45pm (current)
- "Login working" at 2:30pm
- "Started auth work" at 1:15pm

Let me check what changed between "Login working" and now.

[Uses undu_diff with from="Login working"]

Claude: Found it! In the "Added OAuth" checkpoint, you modified src/auth.py.
Let me see the old version.

[Uses undu_file_at with file="src/auth.py" checkpoint="Login working"]

Claude: I see the issue - line 23 had token validation that was removed.
Would you like me to restore just that file, or go back to the full "Login working" checkpoint?
```

### Safe Experimentation

```
User: "I want to try refactoring the database module but I'm not sure it will work"

Claude: Good idea to save first. Let me create a checkpoint.

[Uses undu_save with message="Before database refactor"]

Claude: Done! I've created a checkpoint called "Before database refactor".
Now you can safely experiment. If anything goes wrong, just say
"go back to before the refactor" and I'll restore it.
```
