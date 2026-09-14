# Spike: can a subagent drive a browser? (2026-09-14)

**Verdict: viable.** `kit:ui-checker` ships.

A throwaway `general-purpose` subagent (haiku) was asked to list its browser tools and open https://example.com. It reported:

- Tools available directly, not deferred: `mcp__Claude_Browser__navigate`, `read_page`, `computer`, `read_console_messages`, `tabs_*`, `form_input`, `find`, `get_page_text`, `javascript_tool`, `read_network_requests`, `resize_window`, `preview_*`, `browser_batch`.
- Navigation worked. Title and heading were "Example Domain", with no console errors.
- The screenshot came back **inline**, not as a file, so the agent reports what it saw instead of file paths.

Caveats:
- This was a built-in subagent in the Claude desktop app, where the Browser pane exists. In the terminal CLI, the agent needs a browser MCP server (Playwright/Puppeteer). If it has none, it reports BLOCKED.
- Plugin agents inherit the session's tools when `tools` is omitted, which `ui-checker` does. They can't declare their own `mcpServers` (ignored for plugin agents).
