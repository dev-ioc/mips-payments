export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS preflight (OBLIGATOIRE)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    // Route API
    if (url.pathname === "/api/load_payment_zone") {
      try {
        const body = await request.json();

        const mipsRes = await fetch(
          "https://api.mips.mu/api/load_payment_zone",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": request.headers.get("Authorization") || "",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            body: JSON.stringify(body),
          }
        );

        const text = await mipsRes.text();

        // IMPORTANT: MIPS peut renvoyer JSON OU HTML
        const contentType = mipsRes.headers.get("content-type") || "";

        return new Response(text, {
          status: mipsRes.status,
          headers: {
            "Content-Type": contentType.includes("json")
              ? "application/json"
              : "text/html",
            ...corsHeaders(),
          },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: "Worker error",
            message: err.message,
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders(),
            },
          }
        );
      }
    }

    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders(),
    });
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}