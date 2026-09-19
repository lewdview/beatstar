import { Env, JsonRpcRequest, JsonRpcResponse } from './types';
import { TOOLS, RESOURCES, PROMPTS, executeToolCall, readResource } from './tools';
import { renderLandingHtml } from './landing';

// In-memory active SSE session map (isolate-local)
const sessions = new Map<string, WritableStreamDefaultWriter>();

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function errorResponse(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message }
  };
}

async function handleRpcRequest(req: JsonRpcRequest, env?: Env): Promise<JsonRpcResponse | null> {
  const { id = null, method, params } = req;

  // Notifications (no id) require no response
  if (id === undefined || id === null) {
    return null;
  }

  const response: JsonRpcResponse = { jsonrpc: '2.0', id };

  switch (method) {
    case 'initialize': {
      response.result = {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'pim-mcp-server',
          version: '1.0.0'
        },
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      };
      break;
    }

    case 'ping': {
      response.result = {};
      break;
    }

    case 'tools/list': {
      response.result = { tools: TOOLS };
      break;
    }

    case 'tools/call': {
      const { name, arguments: args } = params || {};
      const result = await executeToolCall(name, args, env);
      response.result = {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
      break;
    }

    case 'resources/list': {
      response.result = { resources: RESOURCES };
      break;
    }

    case 'resources/read': {
      const { uri } = params || {};
      response.result = await readResource(uri, env);
      break;
    }

    case 'prompts/list': {
      response.result = { prompts: PROMPTS };
      break;
    }

    case 'prompts/get': {
      const { name } = params || {};
      const found = PROMPTS.find(p => p.name === name);
      if (found) {
        response.result = {
          description: found.description,
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Execute task with prompt: ${name}`
              }
            }
          ]
        };
      } else {
        return errorResponse(id, -32602, `Prompt not found: ${name}`);
      }
      break;
    }

    default:
      return errorResponse(id, -32601, `Method not found: ${method}`);
  }

  return response;
}

function validateAuth(request: Request, env: Env): boolean {
  if (!env.PIM_API_KEY) {
    return true; // Public read mode
  }

  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1] : new URL(request.url).searchParams.get('token');

  return token === env.PIM_API_KEY;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // Auth verification for API endpoints
    if (pathname === '/sse' || pathname === '/message' || pathname === '/mcp') {
      if (!validateAuth(request, env)) {
        return new Response(JSON.stringify({ error: 'Unauthorized. Invalid or missing PIM_API_KEY.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 1. Landing Page (Human Browser UI)
    if (pathname === '/' && request.method === 'GET') {
      const origin = url.origin;
      const html = renderLandingHtml(origin);
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    // 2. Health & Telemetry Check
    if (pathname === '/health' && request.method === 'GET') {
      return new Response(JSON.stringify({
        status: 'healthy',
        service: 'pim-mcp-server',
        version: '1.0.0',
        protocol: '2024-11-05',
        toolsCount: TOOLS.length,
        canonicalDomain: 'pim.th3scr1b3.art',
        network: env.PIM_NETWORK || 'Base Mainnet (8453)',
        timestamp: new Date().toISOString()
      }, null, 2), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // 3. MCP SSE Stream Endpoint: GET /sse
    if (pathname === '/sse' && request.method === 'GET') {
      const sessionId = crypto.randomUUID();
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      sessions.set(sessionId, writer);

      // Construct client post endpoint URL
      const postEndpoint = `${url.origin}/message?sessionId=${sessionId}`;

      // Emit initial endpoint event (MCP 2024-11-05 SSE specification)
      writer.write(encoder.encode(`event: endpoint\ndata: ${postEndpoint}\n\n`));

      // Keepalive heartbeat every 25 seconds
      const intervalId = setInterval(() => {
        try {
          writer.write(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(intervalId);
          sessions.delete(sessionId);
        }
      }, 25000);

      // Clean up when stream closes
      request.signal.addEventListener('abort', () => {
        clearInterval(intervalId);
        sessions.delete(sessionId);
        try {
          writer.close();
        } catch {}
      });

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });
    }

    // 4. MCP JSON-RPC Message Receiver: POST /message?sessionId=...
    if (pathname === '/message' && request.method === 'POST') {
      const sessionId = url.searchParams.get('sessionId') || '';
      const writer = sessions.get(sessionId);

      try {
        const bodyText = await request.text();
        const jsonRpcReq = JSON.parse(bodyText) as JsonRpcRequest;
        const jsonRpcRes = await handleRpcRequest(jsonRpcReq, env);

        if (jsonRpcRes) {
          // If SSE stream is active in this isolate, send event through SSE
          if (writer) {
            const encoder = new TextEncoder();
            await writer.write(encoder.encode(`event: message\ndata: ${JSON.stringify(jsonRpcRes)}\n\n`));
          }

          // Return 200/202 with JSON-RPC body as standard fallback
          return new Response(JSON.stringify(jsonRpcRes), {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }

        // Notification acknowledged
        return new Response(JSON.stringify({ status: 'acknowledged' }), {
          status: 202,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify(errorResponse(null, -32700, `Parse error: ${err.message}`)), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 5. Direct Streamable HTTP POST support: POST / or POST /mcp
    if ((pathname === '/' || pathname === '/mcp') && request.method === 'POST') {
      try {
        const bodyText = await request.text();
        const jsonRpcReq = JSON.parse(bodyText) as JsonRpcRequest;
        const jsonRpcRes = await handleRpcRequest(jsonRpcReq, env);

        return new Response(JSON.stringify(jsonRpcRes || { status: 'acknowledged' }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (err: any) {
        return new Response(JSON.stringify(errorResponse(null, -32700, `Parse error: ${err.message}`)), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // 404 Fallback
    return new Response(JSON.stringify({ error: 'Not Found', path: pathname }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
