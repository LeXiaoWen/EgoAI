import type { McpRegistryEntry } from '../types/mcp';

/**
 * App-managed MCP registry entries.
 *
 * The online MCP marketplace has been retired; servers are added by hand. This
 * file holds entries the built-in registry needs beyond the runtime-resolved
 * `weknora` server. Currently empty.
 */
export const mcpRegistry: McpRegistryEntry[] = [];
