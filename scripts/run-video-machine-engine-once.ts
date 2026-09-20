/**
 * Roda o motor da Máquina de Vídeos uma vez, direto pelo terminal —
 * mesmo caminho que o botão "Iniciar Máquina de Vídeos" do /admin usa
 * (src/app/api/admin/video-machine-run/route.ts). Útil pra debugar sem
 * precisar logar no admin. Cria dados REAIS (produção), não é teste —
 * não limpa nada depois de rodar.
 *
 * Uso: npx tsx scripts/run-video-machine-engine-once.ts
 * Debug: SCRIPT_DEBUG=1 npx tsx scripts/run-video-machine-engine-once.ts
 */
import "dotenv/config";
import { getDbFresh } from "../src/lib/db/client";
import { runVideoMachineOnce } from "../src/modules/video-machine/orchestrator/runOnce";

const db = getDbFresh();

runVideoMachineOnce(db).then((result) => {
  console.log(JSON.stringify(result, null, 2));
}).catch((err) => {
  console.error("FALHA:", err);
  process.exitCode = 1;
});
