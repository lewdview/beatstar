import { TOOLS } from './tools';

export function renderLandingHtml(origin: string): string {
  const sseUrl = `${origin}/sse`;

  const claudeConfig = JSON.stringify({
    mcpServers: {
      "pim-ecosystem": {
        serverUrl: sseUrl
      }
    }
  }, null, 2);

  const cursorConfig = JSON.stringify({
    mcpServers: {
      "pim-ecosystem": {
        url: sseUrl
      }
    }
  }, null, 2);

  const antigravityConfig = JSON.stringify({
    mcpServers: {
      "pim-ecosystem": {
        serverUrl: sseUrl
      }
    }
  }, null, 2);

  const toolsHtml = TOOLS.map(t => `
    <div class="tool-card">
      <div class="tool-header">
        <span class="tool-badge">TOOL</span>
        <code class="tool-name">${t.name}</code>
      </div>
      <p class="tool-desc">${t.description}</p>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PIM Ecosystem MCP Server — mcp.th3scr1b3.art</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800;900&family=Roboto+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #000000;
      --card-bg: rgba(16, 16, 24, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --orange: #FF5500;
      --cyan: #00E5FF;
      --green: #39FF14;
      --gold: #E5B800;
      --text: #F3F4F6;
      --text-muted: #9CA3AF;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Outfit', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background-image: 
        radial-gradient(circle at 15% 15%, rgba(255, 85, 0, 0.08) 0%, transparent 40%),
        radial-gradient(circle at 85% 85%, rgba(0, 229, 255, 0.05) 0%, transparent 40%);
      line-height: 1.5;
    }

    header {
      padding: 2.5rem 1.5rem 1.5rem;
      max-width: 1100px;
      width: 100%;
      margin: 0 auto;
      border-bottom: 1px solid var(--card-border);
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.85rem;
      background: rgba(57, 255, 20, 0.1);
      border: 1px solid rgba(57, 255, 20, 0.3);
      border-radius: 9999px;
      font-family: 'Roboto Mono', monospace;
      font-size: 0.75rem;
      color: var(--green);
      letter-spacing: 0.05em;
      margin-bottom: 1rem;
    }

    .pulse {
      width: 8px;
      height: 8px;
      background-color: var(--green);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--green);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    h1 {
      font-size: 2.5rem;
      font-weight: 900;
      letter-spacing: -0.02em;
      line-height: 1.1;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #FFF 0%, #FF5500 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 1.1rem;
      max-width: 680px;
    }

    main {
      max-width: 1100px;
      width: 100%;
      margin: 0 auto;
      padding: 2.5rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 3rem;
    }

    .section-title {
      font-size: 1.3rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      color: #FFF;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .section-title::before {
      content: '';
      display: block;
      width: 4px;
      height: 1.2rem;
      background: var(--orange);
    }

    /* Tabs & Code Blocks */
    .config-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      backdrop-filter: blur(20px);
      overflow: hidden;
    }

    .tabs {
      display: flex;
      border-bottom: 1px solid var(--card-border);
      background: rgba(0, 0, 0, 0.4);
    }

    .tab-btn {
      padding: 0.85rem 1.5rem;
      background: none;
      border: none;
      color: var(--text-muted);
      font-family: 'Outfit', sans-serif;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }

    .tab-btn:hover {
      color: #FFF;
    }

    .tab-btn.active {
      color: var(--orange);
      border-bottom-color: var(--orange);
      background: rgba(255, 85, 0, 0.05);
    }

    .tab-content {
      display: none;
      padding: 1.5rem;
      position: relative;
    }

    .tab-content.active {
      display: block;
    }

    pre {
      font-family: 'Roboto Mono', monospace;
      font-size: 0.85rem;
      color: #E2E8F0;
      overflow-x: auto;
      background: rgba(0, 0, 0, 0.6);
      padding: 1rem;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .copy-btn {
      position: absolute;
      top: 2rem;
      right: 2rem;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #FFF;
      font-family: 'Outfit', sans-serif;
      font-size: 0.8rem;
      padding: 0.4rem 0.8rem;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .copy-btn:hover {
      background: var(--orange);
      border-color: var(--orange);
    }

    /* Tools Grid */
    .tools-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1rem;
    }

    .tool-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      transition: transform 0.2s, border-color 0.2s;
    }

    .tool-card:hover {
      border-color: rgba(255, 85, 0, 0.4);
      transform: translateY(-2px);
    }

    .tool-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .tool-badge {
      background: rgba(0, 229, 255, 0.1);
      color: var(--cyan);
      font-family: 'Roboto Mono', monospace;
      font-size: 0.65rem;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      border: 1px solid rgba(0, 229, 255, 0.25);
    }

    .tool-name {
      font-family: 'Roboto Mono', monospace;
      font-size: 0.95rem;
      font-weight: 700;
      color: #FFF;
    }

    .tool-desc {
      font-size: 0.85rem;
      color: var(--text-muted);
      line-height: 1.4;
    }

    /* Endpoints */
    .endpoint-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.85rem 1rem;
      background: rgba(0,0,0,0.4);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      margin-bottom: 0.5rem;
      font-family: 'Roboto Mono', monospace;
      font-size: 0.85rem;
    }

    .method {
      color: var(--orange);
      font-weight: 700;
      margin-right: 0.75rem;
    }

    footer {
      margin-top: auto;
      padding: 2rem 1.5rem;
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-muted);
      border-top: 1px solid var(--card-border);
    }

    footer a {
      color: var(--orange);
      text-decoration: none;
    }
  </style>
</head>
<body>
  <header>
    <div class="status-pill">
      <span class="pulse"></span>
      MCP 2024-11-05 SSE ENDPOINT ACTIVE
    </div>
    <h1>PIM Ecosystem MCP Server</h1>
    <p class="subtitle">
      Authoritative live-service Model Context Protocol gateway for <strong>PIM : th3v4ult — poetry in motion</strong>.
      Query 365-day track metadata, Economy v2.1 Forge math, 3-lane DSP crossover specs, and rhythm beatmaps from any AI assistant.
    </p>
  </header>

  <main>
    <section>
      <h2 class="section-title">Connect Your AI Assistant</h2>
      <div class="config-box">
        <div class="tabs">
          <button class="tab-btn active" onclick="openTab(event, 'antigravity')">Antigravity / Gemini</button>
          <button class="tab-btn" onclick="openTab(event, 'claude')">Claude Desktop</button>
          <button class="tab-btn" onclick="openTab(event, 'cursor')">Cursor / Windsurf</button>
        </div>

        <div id="antigravity" class="tab-content active">
          <button class="copy-btn" onclick="copySnippet('code-antigravity')">Copy</button>
          <p style="margin-bottom: 0.75rem; font-size: 0.85rem; color: var(--text-muted);">
            Add to <code>~/.gemini/config/mcp_config.json</code> or <code>.agents/mcp_config.json</code>:
          </p>
          <pre id="code-antigravity">${antigravityConfig}</pre>
        </div>

        <div id="claude" class="tab-content">
          <button class="copy-btn" onclick="copySnippet('code-claude')">Copy</button>
          <p style="margin-bottom: 0.75rem; font-size: 0.85rem; color: var(--text-muted);">
            Add to <code>claude_desktop_config.json</code>:
          </p>
          <pre id="code-claude">${claudeConfig}</pre>
        </div>

        <div id="cursor" class="tab-content">
          <button class="copy-btn" onclick="copySnippet('code-cursor')">Copy</button>
          <p style="margin-bottom: 0.75rem; font-size: 0.85rem; color: var(--text-muted);">
            Add to <code>.cursor/mcp.json</code>:
          </p>
          <pre id="code-cursor">${cursorConfig}</pre>
        </div>
      </div>
    </section>

    <section>
      <h2 class="section-title">Live Server Endpoints</h2>
      <div class="endpoint-row">
        <div><span class="method">GET</span> <span>/sse</span></div>
        <span style="color: var(--text-muted); font-size: 0.8rem;">SSE Stream Connection</span>
      </div>
      <div class="endpoint-row">
        <div><span class="method">POST</span> <span>/message?sessionId={id}</span></div>
        <span style="color: var(--text-muted); font-size: 0.8rem;">JSON-RPC 2.0 Dispatcher</span>
      </div>
      <div class="endpoint-row">
        <div><span class="method">GET</span> <span>/health</span></div>
        <span style="color: var(--text-muted); font-size: 0.8rem;">Catalog Telemetry & Health</span>
      </div>
    </section>

    <section>
      <h2 class="section-title">Authoritative Tools (${TOOLS.length})</h2>
      <div class="tools-grid">
        ${toolsHtml}
      </div>
    </section>
  </main>

  <footer>
    <p>
      Created by <strong>TH3SCR1B3</strong> (<a href="https://th3scr1b3.art" target="_blank">th3scr1b3.art</a>) •
      Live Client: <a href="https://pim.th3scr1b3.art" target="_blank">pim.th3scr1b3.art</a>
    </p>
  </footer>

  <script>
    function openTab(evt, tabName) {
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(tabName).classList.add('active');
      evt.currentTarget.classList.add('active');
    }

    function copySnippet(id) {
      const text = document.getElementById(id).innerText;
      navigator.clipboard.writeText(text).then(() => {
        alert('Copied MCP configuration to clipboard!');
      });
    }
  </script>
</body>
</html>`;
}
