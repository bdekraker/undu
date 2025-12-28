/**
 * Undu Storage Engine
 * SQLite for metadata + content-addressed blob storage
 */

import { Database } from "bun:sqlite";
import { createHash } from "crypto";
import {
  readdir,
  readFile,
  writeFile,
  mkdir,
  stat,
  unlink,
  rm
} from "fs/promises";
import { join, relative, dirname } from "path";
import { existsSync } from "fs";
import type {
  Checkpoint,
  FileSnapshot,
  FileChange,
  Status,
  Diff,
  Timeline,
  Config,
  Result
} from "./types";

const UNDU_DIR = ".undu";
const DB_FILE = "undu.db";
const OBJECTS_DIR = "objects";
const CONFIG_FILE = "config.toml";

// Default patterns to ignore
const DEFAULT_IGNORE = [
  ".undu",
  ".git",
  "node_modules",
  ".DS_Store",
  "*.pyc",
  "__pycache__",
  ".env",
  ".env.local",
  "dist",
  "build",
  ".next",
  ".cache",
  "*.log"
];

export class UnduStore {
  private db: Database;
  private projectRoot: string;
  private undoDir: string;
  private objectsDir: string;
  private ignore: string[];

  private constructor(projectRoot: string, db: Database, ignore: string[]) {
    this.projectRoot = projectRoot;
    this.undoDir = join(projectRoot, UNDU_DIR);
    this.objectsDir = join(this.undoDir, OBJECTS_DIR);
    this.db = db;
    this.ignore = ignore;
  }

  /**
   * Initialize a new undu repository
   */
  static async init(projectRoot: string): Promise<Result<UnduStore>> {
    const undoDir = join(projectRoot, UNDU_DIR);

    if (existsSync(undoDir)) {
      return { ok: false, error: "Already initialized (found .undu directory)" };
    }

    try {
      // Create directories
      await mkdir(undoDir);
      await mkdir(join(undoDir, OBJECTS_DIR));

      // Create config file
      const config: Config = {
        autoSave: { enabled: true, intervalMs: 60000 },
        ignore: DEFAULT_IGNORE
      };
      await writeFile(
        join(undoDir, CONFIG_FILE),
        generateToml(config)
      );

      // Create database
      const db = new Database(join(undoDir, DB_FILE));
      initDatabase(db);

      const store = new UnduStore(projectRoot, db, config.ignore);

      // Create initial checkpoint
      await store.save("Initial", true);

      return { ok: true, value: store };
    } catch (e) {
      return { ok: false, error: `Failed to initialize: ${e}` };
    }
  }

  /**
   * Open an existing undu repository
   */
  static async open(projectRoot: string): Promise<Result<UnduStore>> {
    const undoDir = join(projectRoot, UNDU_DIR);

    if (!existsSync(undoDir)) {
      return { ok: false, error: "Not an undu repository (no .undu directory)" };
    }

    try {
      const db = new Database(join(undoDir, DB_FILE));

      // Load config
      const configPath = join(undoDir, CONFIG_FILE);
      let ignore = DEFAULT_IGNORE;
      if (existsSync(configPath)) {
        const configText = await readFile(configPath, "utf-8");
        const config = parseToml(configText);
        ignore = config.ignore || DEFAULT_IGNORE;
      }

      return { ok: true, value: new UnduStore(projectRoot, db, ignore) };
    } catch (e) {
      return { ok: false, error: `Failed to open: ${e}` };
    }
  }

  /**
   * Find undu repository by walking up the directory tree
   */
  static async find(startDir: string): Promise<Result<UnduStore>> {
    let current = startDir;

    while (current !== dirname(current)) {
      if (existsSync(join(current, UNDU_DIR))) {
        return UnduStore.open(current);
      }
      current = dirname(current);
    }

    return { ok: false, error: "Not in an undu repository (no .undu directory found)" };
  }

  /**
   * Save a checkpoint
   */
  async save(message: string, isAutoSave = false): Promise<Result<Checkpoint>> {
    try {
      const files = await this.scanFiles();
      const fileSnapshots: FileSnapshot[] = [];

      for (const filePath of files) {
        const fullPath = join(this.projectRoot, filePath);
        const content = await readFile(fullPath);
        const hash = this.hashContent(content);
        const stats = await stat(fullPath);

        // Store blob if not exists
        await this.storeBlob(hash, content);

        fileSnapshots.push({
          path: filePath,
          hash,
          size: stats.size,
          mode: stats.mode
        });
      }

      const parentId = this.getLatestCheckpointId();
      const id = this.generateCheckpointId(message, Date.now());

      const checkpoint: Checkpoint = {
        id,
        message,
        timestamp: Date.now(),
        files: fileSnapshots,
        isAutoSave,
        parentId
      };

      // Store in database
      this.db.run(
        `INSERT INTO checkpoints (id, message, timestamp, is_auto_save, parent_id)
         VALUES (?, ?, ?, ?, ?)`,
        [checkpoint.id, checkpoint.message, checkpoint.timestamp, isAutoSave ? 1 : 0, parentId]
      );

      for (const file of fileSnapshots) {
        this.db.run(
          `INSERT INTO files (checkpoint_id, path, hash, size, mode)
           VALUES (?, ?, ?, ?, ?)`,
          [checkpoint.id, file.path, file.hash, file.size, file.mode]
        );
      }

      // Update current pointer
      this.db.run(`UPDATE state SET value = ? WHERE key = 'current'`, [id]);

      return { ok: true, value: checkpoint };
    } catch (e) {
      return { ok: false, error: `Failed to save: ${e}` };
    }
  }

  /**
   * Undo to a previous checkpoint
   */
  async undo(steps = 1): Promise<Result<Checkpoint>> {
    const timeline = this.getTimeline();
    if (timeline.checkpoints.length === 0) {
      return { ok: false, error: "No checkpoints to undo to" };
    }

    // Find current position
    const currentIdx = timeline.checkpoints.findIndex(c => c.id === timeline.current);
    const targetIdx = currentIdx + steps;

    if (targetIdx >= timeline.checkpoints.length) {
      return { ok: false, error: `Can only go back ${timeline.checkpoints.length - currentIdx - 1} steps` };
    }

    const target = timeline.checkpoints[targetIdx];
    return this.goto(target.id);
  }

  /**
   * Go to a specific checkpoint by ID or message
   */
  async goto(idOrMessage: string): Promise<Result<Checkpoint>> {
    const checkpoint = this.findCheckpoint(idOrMessage);
    if (!checkpoint) {
      return { ok: false, error: `Checkpoint not found: ${idOrMessage}` };
    }

    try {
      // Get files for this checkpoint
      const files = this.db.query<{ path: string; hash: string; size: number; mode: number }, [string]>(
        `SELECT path, hash, size, mode FROM files WHERE checkpoint_id = ?`
      ).all(checkpoint.id);

      // Clear current files (except .undu and ignored)
      const currentFiles = await this.scanFiles();
      for (const filePath of currentFiles) {
        const fullPath = join(this.projectRoot, filePath);
        await unlink(fullPath);
      }

      // Restore files from checkpoint
      for (const file of files) {
        const content = await this.loadBlob(file.hash);
        if (content) {
          const fullPath = join(this.projectRoot, file.path);
          await mkdir(dirname(fullPath), { recursive: true });
          await writeFile(fullPath, content);
        }
      }

      // Update current pointer
      this.db.run(`UPDATE state SET value = ? WHERE key = 'current'`, [checkpoint.id]);

      return { ok: true, value: checkpoint };
    } catch (e) {
      return { ok: false, error: `Failed to restore: ${e}` };
    }
  }

  /**
   * Get current status
   */
  async getStatus(): Promise<Status> {
    const current = this.getCurrentCheckpoint();
    const changes = await this.getUnsavedChanges();

    const stats = this.db.query<{ total: number; auto: number }, []>(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_auto_save = 1 THEN 1 ELSE 0 END) as auto
       FROM checkpoints`
    ).get();

    return {
      projectName: this.projectRoot.split(/[/\\]/).pop() || "unknown",
      currentCheckpoint: current,
      unsavedChanges: changes,
      totalCheckpoints: (stats?.total || 0) - (stats?.auto || 0),
      totalAutoSaves: stats?.auto || 0
    };
  }

  /**
   * Get unsaved changes since last checkpoint
   */
  async getUnsavedChanges(): Promise<FileChange[]> {
    const current = this.getCurrentCheckpoint();
    if (!current) return [];

    const currentFiles = await this.scanFiles();
    const savedFiles = new Map<string, FileSnapshot>();

    for (const file of current.files) {
      savedFiles.set(file.path, file);
    }

    const changes: FileChange[] = [];

    // Check for added/modified files
    for (const filePath of currentFiles) {
      const fullPath = join(this.projectRoot, filePath);
      const content = await readFile(fullPath);
      const hash = this.hashContent(content);

      const saved = savedFiles.get(filePath);
      if (!saved) {
        changes.push({ path: filePath, type: 'added', newHash: hash });
      } else if (saved.hash !== hash) {
        changes.push({
          path: filePath,
          type: 'modified',
          oldHash: saved.hash,
          newHash: hash
        });
      }
      savedFiles.delete(filePath);
    }

    // Check for deleted files
    for (const [path, file] of savedFiles) {
      changes.push({ path, type: 'deleted', oldHash: file.hash });
    }

    return changes;
  }

  /**
   * Get diff between two checkpoints (or current state)
   */
  async getDiff(fromId?: string, toId?: string): Promise<Diff> {
    const from = fromId ? this.findCheckpoint(fromId) : this.getCurrentCheckpoint();
    const to = toId ? this.findCheckpoint(toId) : null;

    const fromFiles = new Map<string, FileSnapshot>();
    const toFiles = new Map<string, FileSnapshot>();

    if (from) {
      for (const file of from.files) {
        fromFiles.set(file.path, file);
      }
    }

    if (to) {
      for (const file of to.files) {
        toFiles.set(file.path, file);
      }
    } else {
      // Compare to current working directory
      const currentFiles = await this.scanFiles();
      for (const filePath of currentFiles) {
        const fullPath = join(this.projectRoot, filePath);
        const content = await readFile(fullPath);
        const stats = await stat(fullPath);
        toFiles.set(filePath, {
          path: filePath,
          hash: this.hashContent(content),
          size: stats.size,
          mode: stats.mode
        });
      }
    }

    const changes: FileChange[] = [];
    const allPaths = new Set([...fromFiles.keys(), ...toFiles.keys()]);

    for (const path of allPaths) {
      const fromFile = fromFiles.get(path);
      const toFile = toFiles.get(path);

      if (!fromFile && toFile) {
        changes.push({ path, type: 'added', newHash: toFile.hash });
      } else if (fromFile && !toFile) {
        changes.push({ path, type: 'deleted', oldHash: fromFile.hash });
      } else if (fromFile && toFile && fromFile.hash !== toFile.hash) {
        changes.push({
          path,
          type: 'modified',
          oldHash: fromFile.hash,
          newHash: toFile.hash
        });
      }
    }

    return {
      from,
      to: to || null,
      changes,
      summary: {
        filesChanged: changes.length,
        additions: changes.filter(c => c.type === 'added').length,
        deletions: changes.filter(c => c.type === 'deleted').length
      }
    };
  }

  /**
   * Get the timeline
   */
  getTimeline(): Timeline {
    const rows = this.db.query<{
      id: string;
      message: string;
      timestamp: number;
      is_auto_save: number;
      parent_id: string | null;
    }, []>(
      `SELECT id, message, timestamp, is_auto_save, parent_id
       FROM checkpoints
       ORDER BY timestamp DESC`
    ).all();

    const currentId = this.db.query<{ value: string }, []>(
      `SELECT value FROM state WHERE key = 'current'`
    ).get()?.value || null;

    const checkpoints: Checkpoint[] = rows.map(row => ({
      id: row.id,
      message: row.message,
      timestamp: row.timestamp,
      isAutoSave: row.is_auto_save === 1,
      parentId: row.parent_id,
      files: this.getFilesForCheckpoint(row.id)
    }));

    return { checkpoints, current: currentId };
  }

  /**
   * Peek at a checkpoint without restoring
   */
  peek(idOrMessage: string): Result<{ checkpoint: Checkpoint; files: FileSnapshot[] }> {
    const checkpoint = this.findCheckpoint(idOrMessage);
    if (!checkpoint) {
      return { ok: false, error: `Checkpoint not found: ${idOrMessage}` };
    }

    return {
      ok: true,
      value: { checkpoint, files: checkpoint.files }
    };
  }

  /**
   * Get file content at a specific checkpoint
   */
  async getFileAt(filePath: string, checkpointId: string): Promise<Result<Buffer>> {
    const file = this.db.query<{ hash: string }, [string, string]>(
      `SELECT hash FROM files WHERE checkpoint_id = ? AND path = ?`
    ).get(checkpointId, filePath);

    if (!file) {
      return { ok: false, error: `File not found: ${filePath}` };
    }

    const content = await this.loadBlob(file.hash);
    if (!content) {
      return { ok: false, error: `Blob not found: ${file.hash}` };
    }

    return { ok: true, value: content };
  }

  // Private helpers

  private getCurrentCheckpoint(): Checkpoint | null {
    const currentId = this.db.query<{ value: string }, []>(
      `SELECT value FROM state WHERE key = 'current'`
    ).get()?.value;

    if (!currentId) return null;
    return this.findCheckpoint(currentId);
  }

  private getLatestCheckpointId(): string | null {
    const row = this.db.query<{ id: string }, []>(
      `SELECT id FROM checkpoints ORDER BY timestamp DESC LIMIT 1`
    ).get();
    return row?.id || null;
  }

  private findCheckpoint(idOrMessage: string): Checkpoint | null {
    // Try exact ID match first
    let row = this.db.query<{
      id: string;
      message: string;
      timestamp: number;
      is_auto_save: number;
      parent_id: string | null;
    }, [string]>(
      `SELECT id, message, timestamp, is_auto_save, parent_id
       FROM checkpoints WHERE id = ?`
    ).get(idOrMessage);

    // Try message match (case-insensitive)
    if (!row) {
      row = this.db.query<{
        id: string;
        message: string;
        timestamp: number;
        is_auto_save: number;
        parent_id: string | null;
      }, [string]>(
        `SELECT id, message, timestamp, is_auto_save, parent_id
         FROM checkpoints WHERE LOWER(message) = LOWER(?)`
      ).get(idOrMessage);
    }

    // Try partial message match
    if (!row) {
      row = this.db.query<{
        id: string;
        message: string;
        timestamp: number;
        is_auto_save: number;
        parent_id: string | null;
      }, [string]>(
        `SELECT id, message, timestamp, is_auto_save, parent_id
         FROM checkpoints WHERE LOWER(message) LIKE LOWER(?)
         ORDER BY timestamp DESC LIMIT 1`
      ).get(`%${idOrMessage}%`);
    }

    if (!row) return null;

    return {
      id: row.id,
      message: row.message,
      timestamp: row.timestamp,
      isAutoSave: row.is_auto_save === 1,
      parentId: row.parent_id,
      files: this.getFilesForCheckpoint(row.id)
    };
  }

  private getFilesForCheckpoint(checkpointId: string): FileSnapshot[] {
    return this.db.query<FileSnapshot, [string]>(
      `SELECT path, hash, size, mode FROM files WHERE checkpoint_id = ?`
    ).all(checkpointId);
  }

  private async scanFiles(): Promise<string[]> {
    const files: string[] = [];

    async function scan(dir: string, root: string, ignore: string[]): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        const relativePath = relative(root, fullPath);

        // Check ignore patterns
        if (shouldIgnore(relativePath, ignore)) continue;

        if (entry.isDirectory()) {
          await scan(fullPath, root, ignore);
        } else if (entry.isFile()) {
          files.push(relativePath.replace(/\\/g, '/'));
        }
      }
    }

    await scan(this.projectRoot, this.projectRoot, this.ignore);
    return files;
  }

  private hashContent(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private generateCheckpointId(message: string, timestamp: number): string {
    const hash = createHash('sha256')
      .update(`${message}-${timestamp}-${Math.random()}`)
      .digest('hex');
    return hash.slice(0, 16);
  }

  private async storeBlob(hash: string, content: Buffer): Promise<void> {
    const dir = join(this.objectsDir, hash.slice(0, 2));
    const file = join(dir, hash.slice(2));

    if (existsSync(file)) return; // Already stored

    await mkdir(dir, { recursive: true });
    await writeFile(file, content);
  }

  private async loadBlob(hash: string): Promise<Buffer | null> {
    const file = join(this.objectsDir, hash.slice(0, 2), hash.slice(2));

    if (!existsSync(file)) return null;

    return readFile(file);
  }

  close(): void {
    this.db.close();
  }
}

// Database initialization
function initDatabase(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      is_auto_save INTEGER NOT NULL DEFAULT 0,
      parent_id TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checkpoint_id TEXT NOT NULL,
      path TEXT NOT NULL,
      hash TEXT NOT NULL,
      size INTEGER NOT NULL,
      mode INTEGER NOT NULL,
      FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id)
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_files_checkpoint ON files(checkpoint_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS state (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.run(`INSERT OR IGNORE INTO state (key, value) VALUES ('current', NULL)`);
}

// Ignore pattern matching
function shouldIgnore(path: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.startsWith('*')) {
      // Wildcard suffix match (e.g., *.pyc)
      if (path.endsWith(pattern.slice(1))) return true;
    } else if (pattern.endsWith('*')) {
      // Wildcard prefix match
      if (path.startsWith(pattern.slice(0, -1))) return true;
    } else {
      // Exact or directory match
      if (path === pattern || path.startsWith(pattern + '/') || path.startsWith(pattern + '\\')) {
        return true;
      }
      // Also match if pattern appears as directory component
      if (path.includes('/' + pattern + '/') || path.includes('\\' + pattern + '\\')) {
        return true;
      }
      if (path.includes('/' + pattern) || path.includes('\\' + pattern)) {
        return true;
      }
    }
  }
  return false;
}

// Simple TOML generation (just what we need)
function generateToml(config: Config): string {
  let toml = `# Undu Configuration\n\n`;

  toml += `[autoSave]\n`;
  toml += `enabled = ${config.autoSave.enabled}\n`;
  toml += `intervalMs = ${config.autoSave.intervalMs}\n\n`;

  toml += `ignore = [\n`;
  for (const pattern of config.ignore) {
    toml += `  "${pattern}",\n`;
  }
  toml += `]\n`;

  return toml;
}

// Simple TOML parsing (just what we need)
function parseToml(text: string): Config {
  const config: Config = {
    autoSave: { enabled: true, intervalMs: 60000 },
    ignore: DEFAULT_IGNORE
  };

  const lines = text.split('\n');
  let currentSection = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed === '') continue;

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1);
      continue;
    }

    if (currentSection === 'autoSave') {
      const [key, value] = trimmed.split('=').map(s => s.trim());
      if (key === 'enabled') config.autoSave.enabled = value === 'true';
      if (key === 'intervalMs') config.autoSave.intervalMs = parseInt(value);
    }

    if (trimmed.startsWith('ignore = [')) {
      config.ignore = [];
      // Parse multi-line array
      const arrayMatch = text.match(/ignore\s*=\s*\[([\s\S]*?)\]/);
      if (arrayMatch) {
        const items = arrayMatch[1].match(/"([^"]+)"/g);
        if (items) {
          config.ignore = items.map(s => s.slice(1, -1));
        }
      }
    }
  }

  return config;
}
