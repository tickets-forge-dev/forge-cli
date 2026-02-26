# @anthropic-forge/cli

CLI for Forge — authenticate, browse tickets, and execute AI-assisted implementations via MCP.

## Installation

```bash
npm install -g @anthropic-forge/cli
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

## Security

**Authentication** — Tokens are stored in `~/.forge/config.json` with file permissions locked to owner-only (600). Tokens refresh automatically and never appear in logs or command output.

**HTTPS only** — All API calls go over HTTPS by default. The CLI warns if you override the URL to a non-HTTPS endpoint or if TLS certificate validation is disabled in your environment.

**Filesystem isolation** — The `get_repository_context` MCP tool only reads git metadata from the current working directory and its children. It cannot be used to scan other directories on your machine.

**Prompt injection** — Ticket content (titles, descriptions, acceptance criteria) is user-authored and flows into Claude's context. We protect against this in layers:

1. All ticket content is XML-escaped and wrapped in `<ticket_context>` tags, separate from system instructions in `<agent_guide>` tags. This prevents content from breaking out of its designated boundary.
2. Only authenticated members of your team can create or modify tickets. There is no anonymous or public input.
3. Claude Code prompts you before running commands or writing files. Even if ticket content tried to manipulate Claude, you approve every action.

**Device auth flow** — Login uses the OAuth device code flow. Codes are short-lived and single-use.

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
