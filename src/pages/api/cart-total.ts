/**
 * FICHIER : src/pages/api/cart-total.ts
 *
 * Endpoint serveur qui récupère le total du panier Wix en transmettant
 * les cookies de session du visiteur. Appelé par le widget mips-pay.
 *
 * URL : https://features-mips-payments.dev-mdg.workers.dev/api/cart-total
 */
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request }) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Cookie",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Récupère le cookie de session Wix depuis la requête du visiteur
  const cookie = request.headers.get("cookie") || "";
  const referer = request.headers.get("referer") || "";

  // Extrait le domaine du site Wix depuis le referer
  let wixSiteOrigin = "";
  try {
    const ref = new URL(referer);
    wixSiteOrigin = ref.origin; // ex: https://www.monsite.com
  } catch {
    // Si pas de referer, impossible de déterminer le site
  }

  if (!wixSiteOrigin) {
    return new Response(
      JSON.stringify({ error: "Cannot determine site origin", amount: 0 }),
      { status: 400, headers: corsHeaders },
    );
  }

  // Tente les différentes APIs Wix Stores
  const endpoints = [
    `${wixSiteOrigin}/_api/wix-ecommerce-storefront-web/api/v1/cart`,
    `${wixSiteOrigin}/_api/stores/v1/cart`,
    `${wixSiteOrigin}/_api/wix-ecommerce-storefront-web/api/cart`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          Referer: referer,
          "User-Agent": request.headers.get("user-agent") || "",
        },
      });

      if (res.ok) {
        const data = await res.json();
        const amount =
          data?.cart?.priceSummary?.total?.amount ||
          data?.cart?.totals?.total ||
          data?.totals?.total ||
          data?.cart?.total ||
          0;

        const parsed = parseFloat(String(amount));
        if (!isNaN(parsed) && parsed > 0) {
          return new Response(JSON.stringify({ amount: parsed, source: url }), {
            status: 200,
            headers: corsHeaders,
          });
        }
      }
    } catch {
      // Tente le suivant
    }
  }

  return new Response(
    JSON.stringify({ amount: 0, error: "Cart total not found" }),
    { status: 200, headers: corsHeaders },
  );
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Cookie",
    },
  });
};
