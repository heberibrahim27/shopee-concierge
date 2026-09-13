/**
 * Teste standalone (sem Supabase real) da lógica PURA de saúde da
 * comparação visual (visualHealth.ts) — sugestão do debate técnico com o
 * ChatGPT (13/09/2026): "no_match legítimo != erro técnico", detectar
 * quando a comparação visual está sistemicamente degradada (não só uma
 * falha isolada) pra decidir modo seguro.
 *
 * Roda com: npx tsx scripts/test-visual-health.ts
 */
import {
  nextHealthWindow,
  isDegraded,
  isCountableAttempt,
  VisualHealthWindow,
  VISUAL_HEALTH_MIN_SAMPLE,
} from "../src/lib/concierge/visualHealth";
import { VisualCompareOutcome } from "../src/lib/concierge/compare";

let failed = false;
function check(desc: string, ok: boolean) {
  console.log(`${ok ? "OK  " : "FAIL"} ${desc}`);
  if (!ok) failed = true;
}

const OK: VisualCompareOutcome = { status: "ok" };
const FALHOU: VisualCompareOutcome = { status: "falhou", reason: "erro_api", retryable: true, detail: "boom" };
const SEM_CANDIDATOS: VisualCompareOutcome = { status: "sem_candidatos" };
const SEM_CHAVE: VisualCompareOutcome = { status: "sem_chave" };

check("'sem_candidatos' não conta como tentativa", !isCountableAttempt(SEM_CANDIDATOS));
check("'ok' conta como tentativa", isCountableAttempt(OK));
check("'falhou' conta como tentativa", isCountableAttempt(FALHOU));
check("'sem_chave' conta como tentativa (é uma falha de infra real)", isCountableAttempt(SEM_CHAVE));

const now = 1_000_000;

// janela nova (null) + resultado ok -> attempts=1, failures=0
const w1 = nextHealthWindow(null, OK, now);
check("janela nova + sucesso -> 1 tentativa, 0 falha", w1.attempts === 1 && w1.failures === 0);

// janela nova + sem_candidatos -> não conta (continua zerada)
const w2 = nextHealthWindow(null, SEM_CANDIDATOS, now);
check("janela nova + sem_candidatos -> não conta (0 tentativas)", w2.attempts === 0 && w2.failures === 0);

// acumula falhas na mesma janela
let w: VisualHealthWindow = { windowStart: now, attempts: 0, failures: 0 };
for (let i = 0; i < VISUAL_HEALTH_MIN_SAMPLE; i++) {
  w = nextHealthWindow(w, FALHOU, now + i * 1000);
}
check(`${VISUAL_HEALTH_MIN_SAMPLE} falhas seguidas acumuladas na mesma janela`, w.attempts === VISUAL_HEALTH_MIN_SAMPLE && w.failures === VISUAL_HEALTH_MIN_SAMPLE);
check("com 100% de falha e amostra suficiente -> degradado", isDegraded(w, now + VISUAL_HEALTH_MIN_SAMPLE * 1000));

// poucas amostras (abaixo do mínimo) mesmo com 100% de falha -> não decide
let wPoucasAmostras: VisualHealthWindow = { windowStart: now, attempts: 0, failures: 0 };
for (let i = 0; i < VISUAL_HEALTH_MIN_SAMPLE - 1; i++) {
  wPoucasAmostras = nextHealthWindow(wPoucasAmostras, FALHOU, now);
}
check("amostra abaixo do mínimo -> NÃO degradado, mesmo com 100% de falha", !isDegraded(wPoucasAmostras, now));

// taxa de falha baixa (maioria sucesso) -> não degradado
let wSaudavel: VisualHealthWindow = { windowStart: now, attempts: 0, failures: 0 };
for (let i = 0; i < 10; i++) {
  wSaudavel = nextHealthWindow(wSaudavel, i === 0 ? FALHOU : OK, now);
}
check("1 falha em 10 tentativas -> NÃO degradado", !isDegraded(wSaudavel, now));

// janela expirada (passou da janela de tempo) -> reseta sozinha
const wExpirada: VisualHealthWindow = { windowStart: now, attempts: 20, failures: 20 };
const depoisDeExpirar = nextHealthWindow(wExpirada, OK, now + 60 * 60 * 1000); // 1h depois
check("janela expirada por tempo reseta (não acumula com o histórico velho)", depoisDeExpirar.attempts === 1 && depoisDeExpirar.failures === 0);
check("janela velha demais não decide degradação (dado velho)", !isDegraded(wExpirada, now + 60 * 60 * 1000));

check("sem janela nenhuma (null) -> nunca degradado", !isDegraded(null, now));

if (failed) {
  console.error("\nAlgum caso falhou.");
  process.exit(1);
} else {
  console.log("\nTodos os casos passaram.");
}
