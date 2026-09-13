/**
 * MCP management tabs.
 *
 * The online MCP marketplace has been retired: servers are added by hand.
 * Custom servers are not a separate place — a hand-configured server is
 * installed directly into Installed, and "add" is a toolbar action.
 */
export const McpTab = {
  Installed: 'installed',
} as const;
export type McpTab = typeof McpTab[keyof typeof McpTab];

export const MCP_TAB_ORDER: readonly McpTab[] = [McpTab.Installed];

export const MCP_TAB_LABEL_KEYS: Record<McpTab, string> = {
  [McpTab.Installed]: 'mcpInstalled',
};
