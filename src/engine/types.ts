/**
 * Undu Engine Types
 * Core type definitions for the version control system
 */

// A checkpoint is a named moment in time (user-created)
export interface Checkpoint {
  id: string;              // SHA-256 hash (first 16 chars)
  message: string;         // User-provided description
  timestamp: number;       // Unix timestamp (ms)
  files: FileSnapshot[];   // All files at this point
  isAutoSave: boolean;     // true = auto-save, false = user checkpoint
  parentId: string | null; // Previous checkpoint
}

// A snapshot of a single file at a point in time
export interface FileSnapshot {
  path: string;            // Relative path from project root
  hash: string;            // SHA-256 of content
  size: number;            // File size in bytes
  mode: number;            // File permissions
}

// Current project status
export interface Status {
  projectName: string;
  currentCheckpoint: Checkpoint | null;
  unsavedChanges: FileChange[];
  totalCheckpoints: number;
  totalAutoSaves: number;
}

// A change between two points
export interface FileChange {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  oldHash?: string;
  newHash?: string;
  additions?: number;
  deletions?: number;
}

// Diff between two checkpoints
export interface Diff {
  from: Checkpoint | null;
  to: Checkpoint | null;
  changes: FileChange[];
  summary: {
    filesChanged: number;
    additions: number;
    deletions: number;
  };
}

// Timeline view
export interface Timeline {
  checkpoints: Checkpoint[];
  current: string | null;  // Current checkpoint ID
}

// Config stored in .undu/config.toml
export interface Config {
  autoSave: {
    enabled: boolean;
    intervalMs: number;
  };
  ignore: string[];        // Patterns to ignore (like .gitignore)
  sync?: {
    enabled: boolean;
    remote: string;
  };
}

// Result type for operations
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
