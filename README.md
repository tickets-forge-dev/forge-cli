# forge-cli

CLI for Forge — authenticate, browse tickets, and execute AI-assisted implementations via MCP.

## Installation

```bash
npm install -g @forge/cli
```

## Usage

```bash
forge login          # Authenticate
forge list           # Browse your tickets
forge show <id>      # View ticket details
forge execute <id>   # Execute ticket via MCP + Claude Code
forge review <id>    # Generate clarification questions
```

## Development

```bash
cp .env.example .env.development
npm install
npm run dev
```

## License

MIT
