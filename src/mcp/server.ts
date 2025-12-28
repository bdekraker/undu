#!/usr/bin/env bun
/**
 * Undu MCP Server
 * Exposes undu functionality to Claude and other AI assistants
 *
 * Protocol: JSON-RPC 2.0 over stdio
 * Spec: https://modelcontextprotocol.io
 */

import { UnduStore } from "../engine";
import type { Checkpoint, FileChange, Status } from "../engine";

// MCP Protocol Types
interface MCPRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface MCPNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

// Tool definitions
const TOOLS = [
  {
    name: "undu_status",
    description: "Get the current status of the undu repository, including unsaved changes and current checkpoint",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the project (optional, defaults to current directory)"
        }
      }
    }
  },
  {
    name: "undu_history",
    description: "Get the timeline of all checkpoints and auto-saves",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the project"
        },
        limit: {
          type: "number",
          description: "Maximum number of checkpoints to return (default: 20)"
        }
      }
    }
  },
  {
    name: "undu_diff",
    description: "Get the diff showing what changed since the last checkpoint, or between two checkpoints",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the project"
        },
        from: {
          type: "string",
          description: "Starting checkpoint ID or name (optional)"
        },
        to: {
          type: "string",
          description: "Ending checkpoint ID or name (optional, defaults to current state)"
        }
      }
    }
  },
  {
    name: "undu_save",
    description: "Create a new checkpoint with the current state of all files",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the project"
        },
        message: {
          type: "string",
          description: "Description of this checkpoint (required)"
        }
      },
      required: ["message"]
    }
  },
  {
    name: "undu_back",
    description: "Go back to a previous checkpoint. WARNING: This will discard current unsaved changes!",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the project"
        },
        steps: {
          type: "number",
          description: "Number of checkpoints to go back (default: 1)"
        }
      }
    }
  },
  {
    name: "undu_goto",
    description: "Jump to a specific checkpoint by name or ID. WARNING: This will discard current unsaved changes!",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the project"
        },
        target: {
          type: "string",
          description: "Checkpoint name or ID to jump to (required)"
        }
      },
      required: ["target"]
    }
  },
  {
    name: "undu_peek",
    description: "Preview a checkpoint without switching to it. Shows files and metadata.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the project"
        },
        target: {
          type: "string",
          description: "Checkpoint name or ID to preview (required)"
        }
      },
      required: ["target"]
    }
  },
  {
    name: "undu_file_at",
    description: "Get the content of a specific file at a specific checkpoint. Useful for comparing old versions.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the project"
        },
        file: {
          type: "string",
          description: "Path to the file within the project (required)"
        },
        checkpoint: {
          type: "string",
          description: "Checkpoint name or ID (required)"
        }
      },
      required: ["file", "checkpoint"]
    }
  },
  {
    name: "undu_init",
    description: "Initialize a new undu repository in the specified directory",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to initialize (required)"
        }
      },
      required: ["path"]
    }
  }
];

// Server state
let projectPath = process.cwd();

// Tool handlers
async function handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const path = (args.path as string) || projectPath;

  switch (name) {
    case "undu_init": {
      const initPath = args.path as string;
      if (!initPath) {
        throw new Error("Path is required for init");
      }
      const result = await UnduStore.init(initPath);
      if (!result.ok) throw new Error(result.error);
      result.value.close();
      return { success: true, message: `Initialized undu repository at ${initPath}` };
    }

    case "undu_status": {
      const result = await UnduStore.find(path);
      if (!result.ok) throw new Error(result.error);
      const store = result.value;
      const status = await store.getStatus();
      store.close();
      return {
        projectName: status.projectName,
        currentCheckpoint: status.currentCheckpoint ? {
          id: status.currentCheckpoint.id,
          message: status.currentCheckpoint.message,
          timestamp: new Date(status.currentCheckpoint.timestamp).toISOString(),
          filesCount: status.currentCheckpoint.files.length
        } : null,
        unsavedChanges: status.unsavedChanges.map(c => ({
          path: c.path,
          type: c.type
        })),
        hasUnsavedChanges: status.unsavedChanges.length > 0,
        totalCheckpoints: status.totalCheckpoints,
        totalAutoSaves: status.totalAutoSaves
      };
    }

    case "undu_history": {
      const result = await UnduStore.find(path);
      if (!result.ok) throw new Error(result.error);
      const store = result.value;
      const timeline = store.getTimeline();
      store.close();

      const limit = (args.limit as number) || 20;
      const checkpoints = timeline.checkpoints.slice(0, limit).map(cp => ({
        id: cp.id,
        message: cp.message,
        timestamp: new Date(cp.timestamp).toISOString(),
        isAutoSave: cp.isAutoSave,
        isCurrent: cp.id === timeline.current,
        filesCount: cp.files.length
      }));

      return {
        checkpoints,
        currentId: timeline.current,
        totalCount: timeline.checkpoints.length
      };
    }

    case "undu_diff": {
      const result = await UnduStore.find(path);
      if (!result.ok) throw new Error(result.error);
      const store = result.value;
      const diff = await store.getDiff(args.from as string, args.to as string);
      store.close();

      return {
        from: diff.from ? {
          id: diff.from.id,
          message: diff.from.message,
          timestamp: new Date(diff.from.timestamp).toISOString()
        } : null,
        to: diff.to ? {
          id: diff.to.id,
          message: diff.to.message,
          timestamp: new Date(diff.to.timestamp).toISOString()
        } : "current working directory",
        changes: diff.changes.map(c => ({
          path: c.path,
          type: c.type
        })),
        summary: diff.summary
      };
    }

    case "undu_save": {
      const message = args.message as string;
      if (!message) throw new Error("Message is required");

      const result = await UnduStore.find(path);
      if (!result.ok) throw new Error(result.error);
      const store = result.value;
      const saveResult = await store.save(message, false);
      store.close();

      if (!saveResult.ok) throw new Error(saveResult.error);

      return {
        success: true,
        checkpoint: {
          id: saveResult.value.id,
          message: saveResult.value.message,
          timestamp: new Date(saveResult.value.timestamp).toISOString(),
          filesCount: saveResult.value.files.length
        }
      };
    }

    case "undu_back": {
      const steps = (args.steps as number) || 1;

      const result = await UnduStore.find(path);
      if (!result.ok) throw new Error(result.error);
      const store = result.value;
      const backResult = await store.undo(steps);  // Engine still uses 'undo' internally
      store.close();

      if (!backResult.ok) throw new Error(backResult.error);

      return {
        success: true,
        restoredTo: {
          id: backResult.value.id,
          message: backResult.value.message,
          timestamp: new Date(backResult.value.timestamp).toISOString()
        }
      };
    }

    case "undu_goto": {
      const target = args.target as string;
      if (!target) throw new Error("Target is required");

      const result = await UnduStore.find(path);
      if (!result.ok) throw new Error(result.error);
      const store = result.value;
      const gotoResult = await store.goto(target);
      store.close();

      if (!gotoResult.ok) throw new Error(gotoResult.error);

      return {
        success: true,
        restoredTo: {
          id: gotoResult.value.id,
          message: gotoResult.value.message,
          timestamp: new Date(gotoResult.value.timestamp).toISOString()
        }
      };
    }

    case "undu_peek": {
      const target = args.target as string;
      if (!target) throw new Error("Target is required");

      const result = await UnduStore.find(path);
      if (!result.ok) throw new Error(result.error);
      const store = result.value;
      const peekResult = store.peek(target);
      store.close();

      if (!peekResult.ok) throw new Error(peekResult.error);

      const { checkpoint, files } = peekResult.value;

      return {
        checkpoint: {
          id: checkpoint.id,
          message: checkpoint.message,
          timestamp: new Date(checkpoint.timestamp).toISOString(),
          isAutoSave: checkpoint.isAutoSave
        },
        files: files.map(f => ({
          path: f.path,
          size: f.size
        })),
        totalSize: files.reduce((sum, f) => sum + f.size, 0)
      };
    }

    case "undu_file_at": {
      const file = args.file as string;
      const checkpoint = args.checkpoint as string;
      if (!file || !checkpoint) throw new Error("File and checkpoint are required");

      const result = await UnduStore.find(path);
      if (!result.ok) throw new Error(result.error);
      const store = result.value;

      // Find the checkpoint first
      const peekResult = store.peek(checkpoint);
      if (!peekResult.ok) {
        store.close();
        throw new Error(peekResult.error);
      }

      const fileResult = await store.getFileAt(file, peekResult.value.checkpoint.id);
      store.close();

      if (!fileResult.ok) throw new Error(fileResult.error);

      return {
        file,
        checkpoint: {
          id: peekResult.value.checkpoint.id,
          message: peekResult.value.checkpoint.message
        },
        content: fileResult.value.toString('utf-8'),
        size: fileResult.value.length
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// MCP message handlers
async function handleMessage(request: MCPRequest): Promise<MCPResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: {
              name: "undu-mcp",
              version: "0.0.1"
            },
            capabilities: {
              tools: {}
            }
          }
        };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: TOOLS
          }
        };

      case "tools/call": {
        const toolName = params?.name as string;
        const toolArgs = (params?.arguments as Record<string, unknown>) || {};

        const result = await handleTool(toolName, toolArgs);

        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2)
              }
            ]
          }
        };
      }

      case "notifications/initialized":
        // Client is ready, no response needed
        return { jsonrpc: "2.0", id, result: {} };

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        };
    }
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32000,
        message: err instanceof Error ? err.message : String(err)
      }
    };
  }
}

// Stdio transport
async function main(): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  // Read from stdin
  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk);

    // Process complete JSON-RPC messages
    while (true) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) break;

      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (!line) continue;

      try {
        const request = JSON.parse(line) as MCPRequest;
        const response = await handleMessage(request);

        // Write response
        process.stdout.write(JSON.stringify(response) + '\n');
      } catch (err) {
        // Parse error
        const errorResponse: MCPResponse = {
          jsonrpc: "2.0",
          id: 0,
          error: {
            code: -32700,
            message: "Parse error"
          }
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      }
    }
  }
}

// Start server
main().catch(err => {
  console.error("MCP Server error:", err);
  process.exit(1);
});
