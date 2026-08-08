/**
 * MEU HYPE Worker v11.7
 * - /health
 * - /proxy?url=...  -> API oficial Mercado Livre (GET)
 * - /page?url=...   -> página pública Mercado Livre (GET, fallback de concorrentes)
 */

const API_PATHS = [
  /^\/items(?:\/|$)/,
  /^\/products(?:\/|$)/,
  /^\/users(?:\/|$)/,
  /^\/categories(?:\/|$)/,
  /^\/orders\/search$/,
  /^\/sites\/MLB\/search$/,
  /^\/reviews(?:\/|$)/
];

function corsHeaders(){
  return {
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET, OPTIONS",
    "Access-Control-Allow-Headers":"Authorization, Content-Type, Accept",
    "Access-Control-Expose-Headers":"X-Hype-Final-URL, X-Hype-Upstream-Status",
    "Access-Control-Max-Age":"86400"
  };
}

function jsonResponse(obj,status=200){
  return new Response(JSON.stringify(obj),{
    status,
    headers:{
      ...corsHeaders(),
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store"
    }
  });
}

function allowedPublicMlHost(hostname){
  const h=hostname.toLowerCase();
  return h==="mercadolivre.com.br" ||
    h.endsWith(".mercadolivre.com.br") ||
    h==="mercadolivre.com" ||
    h.endsWith(".mercadolivre.com");
}

export default {
  async fetch(request){
    const u=new URL(request.url);

    if(request.method==="OPTIONS"){
      return new Response(null,{status:204,headers:corsHeaders()});
    }

    if(u.pathname==="/health"){
      return jsonResponse({ok:true,service:"MEU HYPE API bridge",version:"11.7",page_fallback:true});
    }

    if(request.method!=="GET"){
      return jsonResponse({error:"method_not_allowed"},405);
    }

    if(u.pathname==="/proxy"){
      const raw=u.searchParams.get("url");
      if(!raw) return jsonResponse({error:"missing_url"},400);

      let target;
      try{ target=new URL(raw); }
      catch{ return jsonResponse({error:"invalid_url"},400); }

      if(target.protocol!=="https:" || target.hostname!=="api.mercadolibre.com"){
        return jsonResponse({error:"host_not_allowed"},403);
      }
      if(!API_PATHS.some(rx=>rx.test(target.pathname))){
        return jsonResponse({error:"path_not_allowed",path:target.pathname},403);
      }

      const headers=new Headers();
      headers.set("Accept","application/json");
      const auth=request.headers.get("Authorization");
      if(auth) headers.set("Authorization",auth);

      try{
        const upstream=await fetch(target.toString(),{method:"GET",headers,redirect:"follow"});
        const body=await upstream.arrayBuffer();
        return new Response(body,{
          status:upstream.status,
          headers:{
            ...corsHeaders(),
            "Content-Type":upstream.headers.get("Content-Type")||"application/json; charset=utf-8",
            "Cache-Control":"no-store",
            "X-Hype-Upstream-Status":String(upstream.status),
            "X-Hype-Final-URL":upstream.url||target.toString()
          }
        });
      }catch(err){
        return jsonResponse({error:"upstream_fetch_failed",message:String(err?.message||err)},502);
      }
    }

    if(u.pathname==="/page"){
      const raw=u.searchParams.get("url");
      if(!raw) return jsonResponse({error:"missing_url"},400);

      let target;
      try{ target=new URL(raw); }
      catch{ return jsonResponse({error:"invalid_url"},400); }

      if(target.protocol!=="https:" || !allowedPublicMlHost(target.hostname)){
        return jsonResponse({error:"page_host_not_allowed"},403);
      }

      const headers=new Headers({
        "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language":"pt-BR,pt;q=0.9,en;q=0.7",
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
        "Cache-Control":"no-cache",
        "Pragma":"no-cache"
      });

      try{
        const upstream=await fetch(target.toString(),{
          method:"GET",
          headers,
          redirect:"follow"
        });

        const finalUrl=upstream.url||target.toString();
        let finalHost="";
        try{finalHost=new URL(finalUrl).hostname;}catch{}
        if(!allowedPublicMlHost(finalHost)){
          return jsonResponse({error:"redirect_host_not_allowed",final_url:finalUrl},403);
        }

        const body=await upstream.arrayBuffer();
        return new Response(body,{
          status:upstream.status,
          headers:{
            ...corsHeaders(),
            "Content-Type":upstream.headers.get("Content-Type")||"text/html; charset=utf-8",
            "Cache-Control":"no-store",
            "X-Hype-Upstream-Status":String(upstream.status),
            "X-Hype-Final-URL":finalUrl
          }
        });
      }catch(err){
        return jsonResponse({error:"page_fetch_failed",message:String(err?.message||err)},502);
      }
    }

    return jsonResponse({error:"route_not_allowed"},404);
  }
};
