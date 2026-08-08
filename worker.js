/**
 * MEU HYPE v11.3 — Cloudflare Worker
 * Ponte CORS restrita para a API oficial do Mercado Livre.
 *
 * Segurança:
 * - aceita somente GET;
 * - aceita somente https://api.mercadolibre.com;
 * - restringe os caminhos usados pelo MEU HYPE;
 * - não armazena tokens;
 * - não recebe Client Secret.
 */

const ALLOWED_PATHS = [
  /^\/items(?:\/|$)/,
  /^\/items$/,
  /^\/products(?:\/|$)/,
  /^\/users(?:\/|$)/,
  /^\/categories(?:\/|$)/,
  /^\/orders\/search$/,
  /^\/sites\/MLB\/search$/,
  /^\/reviews(?:\/|$)/
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Access-Control-Max-Age": "86400"
  };
}

function jsonResponse(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export default {
  async fetch(request) {
    const u = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (u.pathname === "/health") {
      return jsonResponse({ ok:true, service:"MEU HYPE API bridge", version:"11.3" });
    }

    if (request.method !== "GET" || u.pathname !== "/proxy") {
      return jsonResponse({ error:"route_not_allowed" }, 404);
    }

    const raw = u.searchParams.get("url");
    if (!raw) return jsonResponse({ error:"missing_url" }, 400);

    let target;
    try {
      target = new URL(raw);
    } catch {
      return jsonResponse({ error:"invalid_url" }, 400);
    }

    if (target.protocol !== "https:" || target.hostname !== "api.mercadolibre.com") {
      return jsonResponse({ error:"host_not_allowed" }, 403);
    }

    if (!ALLOWED_PATHS.some(rx => rx.test(target.pathname))) {
      return jsonResponse({ error:"path_not_allowed", path:target.pathname }, 403);
    }

    const headers = new Headers();
    headers.set("Accept", "application/json");

    const auth = request.headers.get("Authorization");
    if (auth) headers.set("Authorization", auth);

    try {
      const upstream = await fetch(target.toString(), {
        method:"GET",
        headers,
        redirect:"follow"
      });

      const body = await upstream.arrayBuffer();
      const responseHeaders = {
        ...corsHeaders(),
        "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Hype-Upstream-Status": String(upstream.status)
      };

      return new Response(body, {
        status: upstream.status,
        headers: responseHeaders
      });
    } catch (err) {
      return jsonResponse({
        error:"upstream_fetch_failed",
        message:String(err && err.message || err)
      }, 502);
    }
  }
};
