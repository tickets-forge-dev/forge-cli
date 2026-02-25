# @forge/cli

CLI for Forge — authenticate, browse tickets, and execute AI-assisted implementations via MCP.

## Installation

```bash
npm install -g @forge/cli
```

Requires Node.js 20+.

## Quick Start

```bash
forge login                  # Authenticate via browser
forge list                   # Browse your tickets
forge show <id>              # View ticket details
forge review <id>            # Review ticket with AI — asks clarifying questions
forge execute <id>           # Execute ticket implementation via MCP + Claude Code
```

## MCP Server (Claude Code Integration)

Forge ships an embedded MCP server that gives Claude Code direct access to your tickets.

### Setup

```bash
forge mcp install            # Writes .mcp.json and registers with Claude Code
```

Restart Claude Code after installing. The MCP server provides:

**Tools:** `get_ticket_context`, `get_file_changes`, `get_repository_context`, `update_ticket_status`, `submit_review_session`, `list_tickets`

**Prompts:** `list`, `forge-exec`, `forge-execute`, `review`

## Configuration

Auth tokens are stored in `~/.forge/config.json` (permissions 600).

The CLI points to `https://www.forge-ai.dev/api` by default. Override for local development:

```bash
cp .env.example .env.development
```

| Variable | Default | Description |
|----------|---------|-------------|
| `FORGE_API_URL` | `https://www.forge-ai.dev/api` | Backend API base URL |
| `FORGE_APP_URL` | `https://www.forge-ai.dev` | Web app URL (for device auth) |

## Development

```bash
cp .env.example .env.development
npm install
npm run dev          # Watch mode
npm run build        # Production build
npm run test         # Run tests
npm run typecheck    # Type checking
```

## License

MIT
