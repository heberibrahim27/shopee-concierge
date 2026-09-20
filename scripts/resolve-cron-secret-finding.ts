/**
 * Script único: confirma SEC-025-CRON-PRODUCTION-AUTH como RESOLVED —
 * o Heber confirmou via screenshot do painel da Vercel que CRON_SECRET
 * está configurado em Produção (adicionado 16/09/2026).
 *
 * Uso: npx tsx scripts/resolve-cron-secret-finding.ts
 */
import "dotenv/config";
import { getDbFresh } from "../src/lib/db/client";
import { transitionFinding, recordControlEvidence } from "../src/modules/video-machine/skills/25-seguranca-auditoria/securityRegistry";

const db = getDbFresh();

async function main() {
  await recordControlEvidence(db, {
    controlKey: "ingress.cron.authentication",
    environment: "PRODUCTION",
    status: "VERIFIED",
    evidenceBasis: "MANUAL_VERIFICATION",
    evidenceRefs: ["heber-confirmou-screenshot-vercel-env-vars-2026-09-20"],
  });
  const result = await transitionFinding(db, "SEC-025-CRON-PRODUCTION-AUTH", "RESOLVED", "CONTROL_VERIFIED_FIXED", ["heber-confirmou-screenshot-vercel-env-vars-2026-09-20"]);
  console.log("transitionFinding result:", JSON.stringify(result));
}

main().catch((err) => {
  console.error("FALHA:", err);
  process.exitCode = 1;
});
