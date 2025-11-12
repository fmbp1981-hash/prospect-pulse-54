import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MCP_BASE_URL = "https://n8n.intellixai.com.br/mcp/xpag_banco_dados_wa";
    
    // Extrair método e dados do request
    const { method, body } = await req.json();
    
    console.log(`📡 MCP Proxy: Forwarding ${method} request to n8n`, body);
    
    // Montar URL completa (GET pode ter query params)
    const targetUrl = method === "GET" && body?.params 
      ? `${MCP_BASE_URL}?${new URLSearchParams(body.params).toString()}`
      : MCP_BASE_URL;
    
    // Fazer request ao n8n MCP Server
    const mcpResponse = await fetch(targetUrl, {
      method: method || "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: method !== "GET" ? JSON.stringify(body) : undefined,
    });

    if (!mcpResponse.ok) {
      const errorText = await mcpResponse.text();
      console.error(`❌ MCP Server error: ${mcpResponse.status}`, errorText);
      return new Response(
        JSON.stringify({ 
          error: `MCP Server error: ${mcpResponse.status}`,
          details: errorText 
        }),
        { 
          status: mcpResponse.status, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Retornar resposta do MCP Server
    const responseText = await mcpResponse.text();
    console.log(`✅ MCP Proxy: Response received from n8n`);
    
    return new Response(responseText, {
      headers: {
        ...corsHeaders,
        "Content-Type": mcpResponse.headers.get("Content-Type") || "application/json",
      },
    });

  } catch (error) {
    console.error("❌ MCP Proxy Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
