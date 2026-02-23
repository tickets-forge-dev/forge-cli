# Plan: Add MCP Prompts as Claude Code Slash Commands

## Context
The forge MCP server already exposes 2 prompts (`forge_execute`, `forge_review`) that appear as slash commands in Claude Code. The user wants additional prompts so that common forge workflows are accessible directly from Claude Code without switching to the terminal.

**Current UX:** terminal → `forge list` → copy ticket ID → Claude Code → `/forge:forge_execute`
**Target UX:** Claude Code → `/forge:forge_list` → pick ticket → `/forge:forge_exec ticketId`

## Changes

### 1. New MCP prompt: `forge_list`
**File:** `src/mcp/prompts/forge-list.ts` (new)

- No required arguments. Optional `filter` arg (`all` | `mine`, default `mine`).
- Fetches tickets via `GET /tickets` with `teamId` + `assignedToMe=true` (same as CLI list command)
- Fetches team members via `GET /teams/:teamId/members` in parallel to resolve assignee display names
- Returns a `user` message with a formatted **markdown table**:

  | ID | Title | Status | Assignee | Priority |
  |----|-------|--------|----------|----------|
  | `aec_57f...` | Add logout feature | :rocket: ready | John Doe | low |

- Falls back to raw user ID if member lookup fails (same pattern as CLI list)
- Includes hint text: *"To execute a ticket, use `/forge:forge_exec` with the ticket ID"*

### 2. New MCP prompt: `forge_exec` (alias)
**File:** `src/mcp/prompts/forge-exec.ts` (new)

- Thin wrapper — delegates to `handleForgeExecute()` from `forge-execute.ts`
- Provides a shorter, friendlier name (`forge_exec` vs `forge_execute`)
- Same single required arg: `ticketId`

### 3. Register new prompts in MCP server
**File:** `src/mcp/server.ts` (modify)

- Import the 2 new prompt definitions + handlers
- Add to `ListPromptsRequestSchema` handler array
- Add 2 new cases to `GetPromptRequestSchema` switch

## Existing code reused
| What | Where |
|------|-------|
| `ApiService.get()` | `src/services/api.service.ts` |
| `TicketListItem` type | `src/types/ticket.ts` |
| `PromptResult`, `PromptMessage` | `src/mcp/types.ts` |
| `handleForgeExecute()` | `src/mcp/prompts/forge-execute.ts` |
| Status emoji map | `src/ui/formatters.ts` → `STATUS_ICONS` |
| Member fetch pattern | `src/commands/list.ts` → `fetchMemberNames()` |

## Slash command UX in Claude Code
After these changes:
- `/forge:forge_list` → see all tickets with friendly assignee names
- `/forge:forge_exec ticketId` → start implementation (short alias)
- `/forge:forge_execute ticketId` → still works (backward compat)
- `/forge:forge_review ticketId` → still works

## Verification
1. `npx tsc --noEmit` — clean compile
2. Run `forge mcp` → verify new prompts appear in `ListPrompts` response
3. In Claude Code: `/forge:forge_list` → returns formatted ticket table
4. In Claude Code: `/forge:forge_exec <id>` → loads executor agent + ticket context
