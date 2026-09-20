/**
 * Seed ÚNICO (não é teste, não limpa depois de si) dos 5 achados de
 * segurança reais já rastreados em CONTINUIDADE.md, seção "Security
 * findings rastreados (Skill 25)" — agora como dado de primeira classe
 * na Skill 25, em vez de só prosa em markdown. Rodar uma única vez;
 * rodar de novo é seguro (registerFinding é idempotente por findingKey).
 *
 * Uso: npx tsx scripts/seed-video-machine-security-findings.ts
 */
import "dotenv/config";
import { getDbFresh } from "../src/lib/db/client";
import { registerFinding, transitionFinding, recordControlEvidence } from "../src/modules/video-machine/skills/25-seguranca-auditoria/securityRegistry";

const db = getDbFresh();

async function main() {
  // 1. SEC-025-ZAPI-WEBHOOK-AUTH — CONTAINED (fix aplicado 2026-09-18, commit 60ae515)
  await registerFinding(db, {
    findingKey: "SEC-025-ZAPI-WEBHOOK-AUTH",
    severity: "HIGH",
    controlKey: "ingress.webhook.zapi.authentication",
    affectedSubjectRefs: ["route:src/app/api/webhook/zapi/route.ts"],
    evidenceRefs: ["commit:60ae515"],
  });
  await transitionFinding(db, "SEC-025-ZAPI-WEBHOOK-AUTH", "CONTAINED", "IMMEDIATE_CONTAINMENT_APPLIED", ["commit:60ae515"]);
  await recordControlEvidence(db, { controlKey: "ingress.webhook.zapi.authentication", environment: "PRODUCTION", status: "VERIFIED", evidenceBasis: "REPOSITORY_INSPECTION", evidenceRefs: ["commit:60ae515"] });

  // 2. SEC-025-PRODUCT-GROUPS-ANON-RLS — RESOLVED (2026-09-20, migration 20260920130000)
  await registerFinding(db, {
    findingKey: "SEC-025-PRODUCT-GROUPS-ANON-RLS",
    severity: "MEDIUM",
    controlKey: "data.rls.product_groups",
    affectedSubjectRefs: ["table:public.product_groups"],
    evidenceRefs: ["migration:20260920130000_enable_rls_product_groups"],
  });
  await transitionFinding(db, "SEC-025-PRODUCT-GROUPS-ANON-RLS", "RESOLVED", "CONTROL_VERIFIED_FIXED", ["migration:20260920130000_enable_rls_product_groups"]);
  await recordControlEvidence(db, { controlKey: "data.rls.product_groups", environment: "PRODUCTION", status: "VERIFIED", evidenceBasis: "PRODUCTION_TEST", evidenceRefs: ["migration:20260920130000_enable_rls_product_groups"] });

  // 3. SEC-025-CRON-PRODUCTION-AUTH — CONTAINED (codigo corrigido pra fail-closed 2026-09-20, aguardando confirmacao de CRON_SECRET no Vercel)
  await registerFinding(db, {
    findingKey: "SEC-025-CRON-PRODUCTION-AUTH",
    severity: "HIGH",
    controlKey: "ingress.cron.authentication",
    affectedSubjectRefs: ["route:src/app/api/cron/publish-product/route.ts", "route:src/app/api/cron/source-deals/route.ts", "route:src/app/api/cron/video-machine-worker/route.ts"],
    evidenceRefs: ["commit:3203ca4"],
  });
  await transitionFinding(db, "SEC-025-CRON-PRODUCTION-AUTH", "CONTAINED", "IMMEDIATE_CONTAINMENT_APPLIED", ["commit:3203ca4"]);
  // status UNVERIFIED de propósito — o código está correto, mas a env var em produção (Vercel) ainda não foi confirmada.
  await recordControlEvidence(db, { controlKey: "ingress.cron.authentication", environment: "PRODUCTION", status: "UNVERIFIED", evidenceBasis: "REPOSITORY_INSPECTION", evidenceRefs: ["commit:3203ca4"] });

  // 4. SEC-025-ML-SECRET-ROTATION — OPEN, rotação não confirmada
  await registerFinding(db, {
    findingKey: "SEC-025-ML-SECRET-ROTATION",
    severity: "MEDIUM",
    controlKey: "credential.rotation.mercadolivre",
    affectedSubjectRefs: ["env:MERCADOLIVRE_APP_SECRET"],
    evidenceRefs: ["CONTINUIDADE.md:5. Mercado Livre"],
  });

  // 5. SEC-025-RETENTION-NOT-CONFIGURED — OPEN/NOT_CONFIGURED
  await registerFinding(db, {
    findingKey: "SEC-025-RETENTION-NOT-CONFIGURED",
    severity: "LOW",
    controlKey: "retention.sensitive_data",
    affectedSubjectRefs: ["table:concierge_sessions", "table:search_events"],
    evidenceRefs: [],
  });
  await recordControlEvidence(db, { controlKey: "retention.sensitive_data", environment: "PRODUCTION", status: "NOT_CONFIGURED", evidenceBasis: "REPOSITORY_INSPECTION" });

  const { data: findings } = await db.from("video_machine_security_finding").select("finding_key, severity");
  const { data: lifecycles } = await db.from("video_machine_security_finding_lifecycle").select("security_finding_id, status");
  console.log("Findings registrados:");
  for (const f of findings ?? []) console.log(`  - ${f.finding_key} (${f.severity})`);
  console.log(`\n${findings?.length ?? 0} findings, ${lifecycles?.length ?? 0} lifecycles.`);
}

main().catch((err) => {
  console.error("FALHA:", err);
  process.exitCode = 1;
});
