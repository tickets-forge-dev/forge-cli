// Shared MCP protocol types used by all Forge MCP tool handlers.
// These match the MCP CallToolResult content shape without depending on the
// SDK's internal Zod schemas (which use Zod v4, incompatible with project's Zod v3).

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: TextContent[];
  isError?: boolean;
}
