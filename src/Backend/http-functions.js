export function options_mips_payment(request) {
  const headers = {
    "Access-Control-Allow-Origin": "*",  // En développement, en production mettez votre domaine exact
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Access-Control-Max-Age": "86400"
  };
  
  return ok({
    status: 204,  // No Content
    headers: headers,
    body: null
  });
}

// ⭐ L'endpoint POST principal
export async function post_mips_payment(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  
  try {
    // Lire le corps de la requête
    const body = await request.body.json();
    
    console.log("[HTTP Function] Appel MiPS pour commande:", body.id_order);
    
    // Appel à l'API MiPS
    const mipsResponse = await fetch("https://api.mips.mu/api/load_payment_zone", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/html',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify(body)
    });
    
    // Lire la réponse (peut être HTML ou JSON)
    const responseText = await mipsResponse.text();
    
    // Essayer de parser en JSON, sinon renvoyer comme texte
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      // Si c'est du HTML (le payment_zone_data), on garde la structure
      responseData = {
        answer: {
          operation_status: "success",
          payment_zone_data: responseText
        }
      };
    }
    
    console.log("[HTTP Function] Réponse MiPS reçue, status:", mipsResponse.status);
    
    return ok({
      status: 200,
      headers: corsHeaders,
      body: responseData
    });
    
  } catch (error) {
    console.error("[HTTP Function] Erreur:", error);
    
    return serverError({
      status: 500,
      headers: corsHeaders,
      body: {
        error: error.message || "Erreur interne du serveur"
      }
    });
  }
}

// Route par défaut si l'endpoint n'existe pas
export function get_mips_payment(request) {
  return notFound({
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: { error: "Endpoint not found. Use POST method." }
  });
}