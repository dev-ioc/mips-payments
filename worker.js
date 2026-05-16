export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/api/load_payment_zone") {
      const body = await request.json();

      const res = await fetch("https://api.mips.mu/api/load_payment_zone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": request.headers.get("Authorization"),
        },
        body: JSON.stringify(body),
      });

      const text = await res.text();

      return new Response(text, {
        status: res.status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      });
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