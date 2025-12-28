/**
 * Undu Auto-Save Daemon
 * Watches files and creates auto-saves on changes
 */

import { watch } from "fs";
import { UnduStore } from "../engine";
import type { Config } from "../engine";

export interface WatcherOptions {
  debounceMs?: number;      // Debounce interval (default: 30000ms)
  onAutoSave?: (filesChanged: number) => void;
  onError?: (error: Error) => void;
  verbose?: boolean;
}

export interface WatcherState {
  isWatching: boolean;
  lastAutoSave: number | null;
  pendingChanges: Set<string>;
  autoSaveCount: number;
}

export class UnduWatcher {
  private store: UnduStore;
  private projectRoot: string;
  private debounceMs: number;
  private debounceTimer: Timer | null = null;
  private watcher: ReturnType<typeof watch> | null = null;
  private state: WatcherState;
  private options: WatcherOptions;
  private ignorePatterns: string[];

  constructor(
    store: UnduStore,
    projectRoot: string,
    ignorePatterns: string[],
    options: WatcherOptions = {}
  ) {
    this.store = store;
    this.projectRoot = projectRoot;
    this.debounceMs = options.debounceMs ?? 30000;
    this.options = options;
    this.ignorePatterns = ignorePatterns;
    this.state = {
      isWatching: false,
      lastAutoSave: null,
      pendingChanges: new Set(),
      autoSaveCount: 0
    };
  }

  /**
   * Start watching for file changes
   */
  start(): void {
    if (this.state.isWatching) {
      return;
    }

    this.watcher = watch(
      this.projectRoot,
      { recursive: true },
      (event, filename) => {
        if (!filename) return;

        // Ignore patterns
        if (this.shouldIgnore(filename)) return;

        // Track change
        this.state.pendingChanges.add(filename);

        // Reset debounce timer
        this.resetDebounce();
      }
    );

    this.state.isWatching = true;

    if (this.options.verbose) {
      console.log(`[undu] Watching ${this.projectRoot}`);
      console.log(`[undu] Auto-save after ${this.debounceMs / 1000}s of inactivity`);
    }
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    this.state.isWatching = false;

    if (this.options.verbose) {
      console.log(`[undu] Stopped watching`);
    }
  }

  /**
   * Get current watcher state
   */
  getState(): WatcherState {
    return { ...this.state };
  }

  /**
   * Force an auto-save now
   */
  async saveNow(): Promise<void> {
    await this.performAutoSave();
  }

  private resetDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.performAutoSave();
    }, this.debounceMs);
  }

  private async performAutoSave(): Promise<void> {
    if (this.state.pendingChanges.size === 0) {
      return;
    }

    const changedCount = this.state.pendingChanges.size;
    const timestamp = new Date().toLocaleTimeString();

    try {
      const result = await this.store.save(`Auto-save`, true);

      if (result.ok) {
        this.state.autoSaveCount++;
        this.state.lastAutoSave = Date.now();
        this.state.pendingChanges.clear();

        if (this.options.onAutoSave) {
          this.options.onAutoSave(changedCount);
        }

        if (this.options.verbose) {
          console.log(`[undu] Auto-saved at ${timestamp} (${changedCount} files)`);
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      if (this.options.onError) {
        this.options.onError(error as Error);
      }
      if (this.options.verbose) {
        console.error(`[undu] Auto-save failed:`, error);
      }
    }
  }

  private shouldIgnore(path: string): boolean {
    // Normalize path separators
    const normalizedPath = path.replace(/\\/g, '/');

    for (const pattern of this.ignorePatterns) {
      if (pattern.startsWith('*')) {
        // Wildcard suffix match (e.g., *.pyc)
        if (normalizedPath.endsWith(pattern.slice(1))) return true;
      } else if (pattern.endsWith('*')) {
        // Wildcard prefix match
        if (normalizedPath.startsWith(pattern.slice(0, -1))) return true;
      } else {
        // Exact or directory match
        if (
          normalizedPath === pattern ||
          normalizedPath.startsWith(pattern + '/') ||
          normalizedPath.includes('/' + pattern + '/') ||
          normalizedPath.includes('/' + pattern)
        ) {
          return true;
        }
      }
    }
    return false;
  }
}

/**
 * Run the pruning strategy for auto-saves
 *
 * Strategy (from ROADMAP):
 * - Last 1 hour: keep ALL
 * - Last 24 hours: 1 per 10 minutes
 * - Last 7 days: 1 per hour
 * - Last 30 days: 1 per day
 * - Older than 30 days: 1 per week
 * - Named checkpoints: NEVER pruned
 */
export async function pruneAutoSaves(store: UnduStore): Promise<number> {
  const timeline = store.getTimeline();
  const now = Date.now();
  const toDelete: string[] = [];

  // Time buckets in ms
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;

  // Group auto-saves by time bucket
  const buckets = {
    lastHour: [] as { id: string; timestamp: number }[],
    last24Hours: [] as { id: string; timestamp: number }[],
    last7Days: [] as { id: string; timestamp: number }[],
    last30Days: [] as { id: string; timestamp: number }[],
    older: [] as { id: string; timestamp: number }[]
  };

  for (const cp of timeline.checkpoints) {
    // Never prune named checkpoints (user-created)
    if (!cp.isAutoSave) continue;

    // Don't prune current checkpoint
    if (cp.id === timeline.current) continue;

    const age = now - cp.timestamp;

    if (age < HOUR) {
      buckets.lastHour.push({ id: cp.id, timestamp: cp.timestamp });
    } else if (age < DAY) {
      buckets.last24Hours.push({ id: cp.id, timestamp: cp.timestamp });
    } else if (age < WEEK) {
      buckets.last7Days.push({ id: cp.id, timestamp: cp.timestamp });
    } else if (age < 30 * DAY) {
      buckets.last30Days.push({ id: cp.id, timestamp: cp.timestamp });
    } else {
      buckets.older.push({ id: cp.id, timestamp: cp.timestamp });
    }
  }

  // Last hour: keep all (no pruning)

  // Last 24 hours: keep 1 per 10 minutes
  toDelete.push(...pruneBucket(buckets.last24Hours, 10 * 60 * 1000));

  // Last 7 days: keep 1 per hour
  toDelete.push(...pruneBucket(buckets.last7Days, HOUR));

  // Last 30 days: keep 1 per day
  toDelete.push(...pruneBucket(buckets.last30Days, DAY));

  // Older: keep 1 per week
  toDelete.push(...pruneBucket(buckets.older, WEEK));

  // TODO: Actually delete the checkpoints from the database
  // For now, just return the count of what would be deleted
  return toDelete.length;
}

/**
 * Prune a bucket keeping only one entry per interval
 */
function pruneBucket(
  entries: { id: string; timestamp: number }[],
  intervalMs: number
): string[] {
  if (entries.length <= 1) return [];

  // Sort by timestamp (newest first)
  entries.sort((a, b) => b.timestamp - a.timestamp);

  const toDelete: string[] = [];
  let lastKept = 0;

  for (let i = 0; i < entries.length; i++) {
    if (i === 0) {
      // Always keep the newest
      lastKept = entries[i].timestamp;
      continue;
    }

    const timeSinceLastKept = lastKept - entries[i].timestamp;

    if (timeSinceLastKept < intervalMs) {
      // Too close to last kept entry, mark for deletion
      toDelete.push(entries[i].id);
    } else {
      // Far enough, keep this one
      lastKept = entries[i].timestamp;
    }
  }

  return toDelete;
}
