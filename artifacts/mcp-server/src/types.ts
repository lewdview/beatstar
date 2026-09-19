export interface Env {
  PIM_PRIMARY_TARGET?: string;
  PIM_NETWORK?: string;
  ENVIRONMENT?: string;
  PIM_API_KEY?: string; // Optional Bearer token secret
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ResourceDefinition {
  uri: string;
  name: string;
  mimeType: string;
  description: string;
}

export interface PromptDefinition {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
}
