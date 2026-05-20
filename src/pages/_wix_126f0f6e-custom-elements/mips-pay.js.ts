/**
 * FICHIER : src/pages/_wix_126f0f6e-custom-elements/mips-pay.js.ts
 *
 * Route stable sans hash → l'URL configurée dans Wix ne change jamais.
 * URL à configurer dans Wix Studio :
 *   https://features-mips-payments.dev-mdg.workers.dev/_wix_126f0f6e-custom-elements/mips-pay.js
 */
import type { APIRoute } from "astro";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

export const GET: APIRoute = async () => {
  try {
    // Cherche le fichier mips-pay-*.js dans le répertoire de build
    const dir = join(process.cwd(), "dist/_wix_126f0f6e-custom-elements");
    const files = readdirSync(dir);
    const mipsFile = files.find(
      (f) => f.startsWith("mips-pay-") && f.endsWith(".js"),
    );

    if (!mipsFile) {
      return new Response("// mips-pay bundle not found", {
        status: 404,
        headers: { "Content-Type": "application/javascript" },
      });
    }

    const content = readFileSync(join(dir, mipsFile), "utf-8");

    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(`// Error: ${err}`, {
      status: 500,
      headers: { "Content-Type": "application/javascript" },
    });
  }
};
