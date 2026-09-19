#!/usr/bin/env node
// Contract Lint V1 — Ponto G do reparo transversal pós-revisão Fable (2026-09-18).
// Escopo desta V1 (decisão técnica registrada em CONTRACT-LINT.md):
//   G001 — símbolo (type/interface) duplicado dentro do MESMO SPEC.md, via AST real
//          do TypeScript compiler (não regex) — exatamente a classe de bug que a
//          revisão Fable/Claude Fable 5 Max encontrou (CreativeCtaIntent na Skill 07,
//          IntegrationHealthStatus na Skill 24, OwnedAffiliateClickEvent na Skill 18).
//   G012 — código FATAL_ERROR duplicado dentro do mesmo bloco ```text de erros do
//          mesmo SPEC.md.
//   G016/G017 — corpus tem que ser exatamente as 25 SPEC.md esperadas, nem uma a menos
//          nem uma inesperada.
//   G_S10  — extensão barata sugerida pelo ChatGPT (S10 → seção 42 de
//          CANONICAL-SERIALIZATION.md): cada um dos 25 SPEC.md precisa conter
//          referência normativa a CANONICAL_SERIALIZATION_V1. Checagem textual
//          simples, não precisa parsear hash projections.
//   G_S11  — extensão barata sugerida pelo ChatGPT (S11 → seção 57 de
//          AUDIT-EVENT.md): todo SPEC.md que menciona o token "AuditEvent"
//          precisa referenciar normativamente AUDIT_EVENT_V1, e nenhum SPEC.md
//          pode declarar "type AuditEvent"/"interface AuditEvent" localmente
//          (a declaração real mora só em contracts/AUDIT-EVENT.md).
//   G_S12  — extensão barata sugerida pelo ChatGPT (S12 → seção 18 de
//          ERROR-TAXONOMY.md): nenhuma declaração canônica pode ter os campos
//          legacy "errorClass"/"retryableErrorClasses" fora de uma seção
//          explicitamente marcada LEGACY/SUPERSEDED.
//   G_S13  — extensão barata sugerida pelo ChatGPT (S13 → seções 39-40 do
//          debate): "consumedAt" como PropertySignature só é permitido nos
//          tipos legados já existentes (allowlist explícita), sempre marcado
//          LEGACY/NON-AUTHORITATIVE por perto. Qualquer type NOVO com
//          consumedAt fora da allowlist é erro — impede o legado se espalhar.
//   G_S14  — extensão barata sugerida pelo ChatGPT (S14 → seção 40 do debate):
//          checagem textual simples contra as frases contraditórias antigas
//          ("resultado logicamente incompatível", "reexecução que
//          produziria", "recalcula e compara") nas Skills04-08 — sem tentar
//          criar parser semântico de prosa.
//   G_S15  — extensão sugerida pelo ChatGPT (S15 → seções 48-49 do debate):
//          via AST real, Skills 11/16/17 (VideoGenerationExecution/
//          OutboundSendCheckpoint/PublicationExecution) precisam ter
//          PropertySignature "credentialHandleRef"; Skill 10
//          (VideoProviderTarget) NUNCA pode ter esse campo (separação
//          planning/execution). Também varre por PropertySignature nomeada
//          apiKey/accessToken/refreshToken/password/cookie/token bruto nos
//          artifacts de domínio — segredo nunca é campo de contrato.
//   G_S16  — extensão sugerida pelo ChatGPT (S16 → seção 41-42 do debate):
//          via AST real, "ResponseGuard" (Skill 16) precisa ter
//          PropertySignature "suppressionPolicy"; nenhum type PODE ter
//          "suppressionWindowMs" como optional solto fora da variante
//          WINDOWED de ResponseSuppressionPolicy (allowlist, mesmo padrão
//          do G_S13) — impede a ambiguidade original de voltar.
//   G_S1   — extensão via AST real (S1 → Resource-scoped Authorization +
//          Provider Account Ingress Resolution): Skill 22
//          (TenantAuthorizationRequirement/TenantAuthorizationDecision)
//          precisa ter PropertySignature "authorizationScope"; Skill 24
//          (ProviderAccountIngressResolutionRequest) NUNCA pode ter
//          "tenantId"/"trustedTenantContextHash" (é bootstrap anterior a
//          qualquer tenant confiável); Skill 24
//          (ProviderAccountIngressResolution) precisa ter "tenantId"/
//          "integrationBindingRef"/"providerKey"/
//          "providerAccountIdentityHash"; e
//          IntegrationBindingResolutionRequest.trustedTenantContextHash
//          nunca pode virar opcional (guarda contra alguém "resolver" o
//          S1 enfraquecendo o mecanismo já existente em vez de adicionar
//          o novo bootstrap).
//   G_S2   — extensão via AST real (S2 → ProductVisualReferenceSet como
//          artifact tenant-scoped obrigatório): Skill 09
//          (ProductVisualReferenceSet) precisa ter
//          "productVisualReferenceSetId"/"tenantId"/"subjectRef"/
//          "content"/"productVisualReferenceSetHash"; as 3 branches de
//          FrameGenerationResult (Success/NoFrameRequired/
//          ReferenceUnavailable) precisam todas ter
//          "productVisualReferenceSetRef" (nenhuma branch materializa
//          ausência de set); consumers (VideoGenerationIntent/
//          VideoPromptArtifact na Skill10, VideoGenerationExecution na
//          Skill11, VideoAuditInput na Skill12, CorrectionInput na
//          Skill13) precisam ter "productVisualReferenceSetRef";
//          corpus-wide, nenhum type fora de ProductVisualReferenceSet/
//          ProductVisualReferenceSetRef pode ter "productVisualReferenceSetId"
//          solto (FK naked), e nenhum type pode mais ter os nomes
//          pré-S2 "referenceSetId"/"referenceSetHash".
//   G_S3   — extensão via AST real (S3 → CreativeCtaIntent como
//          sub-artifact imutável da Skill 07, sem creativeCtaIntentId
//          fictício): corpus-wide, nenhum type pode ter
//          "creativeCtaIntentId" (identidade que nunca existiu — achado
//          real do Fable). Skill 07: "CreativeCtaIntentRef" precisa ter
//          "creativeDirectionResultId"/"creativeDirectionHash"/
//          "creativeCtaIntentHash"; "CreativeDirectionSuccess" precisa
//          ter "creativeCtaIntentHash". Consumers (Skill16
//          "CreativeCtaMatch"/"SocialPublicationBindingRef", Skill17
//          "PublicationInput"/"PublicationPlan"/
//          "LogicalPublicationIdentity") precisam ter
//          "creativeCtaIntentRef".
//   G_S4   — extensão via AST/textual (S4 → ApprovalEvidenceBundle
//          encerra o "depende da Skill12" mútuo entre Skill03/Skill12):
//          Skill03 "ApprovalGateKey" precisa conter 'VIDEO_COMPLIANCE'
//          e 'FIRST_REAL_PUBLISH'; "ApprovalEvidenceBundle" precisa ter
//          os 10 campos do contrato; "ApprovalDecision" precisa ter
//          "approvalEvidenceBundleRef". Textual, nas duas Skills: bane
//          as frases de defer mútuo ("depende de como a Skill 12"/
//          "consumidor possível: Skill 03"). Skill12 precisa referenciar
//          o mapeamento normativo verdict->ApprovalEvidenceOutcome
//          (SATISFIES_REQUIREMENT/VIOLATES_REQUIREMENT/
//          INSUFFICIENT_EVIDENCE).
//   G_S9   — extensão via AST/textual (S9 → ProductUsageEvidence como
//          ledger canônico de uso de produto): Skill 04
//          "ProductUsageEvidence" precisa ter os 8 campos do contrato.
//          Skills 11/14/17 (writers autorizados) precisam referenciar
//          textualmente "PRODUCT_USAGE_EVIDENCE_V1". Checagem de matriz
//          de writers (Skill11/14 só MATERIALIZED, Skill17 só
//          PRIMARY_PUBLISHED) deliberadamente NÃO implementada via
//          regex — o próprio debate do S9 avisou que um regex ingênuo
//          citando os literais bane a própria prosa explicando a regra
//          (mesmo problema do S4/S14); AST semântico pra isso
//          exigiria rastrear qual PropertySignature/string-literal
//          corresponde a uma EMISSÃO real vs. uma proibição em prosa,
//          fora do escopo desta V1.
//   G_S5   — extensão via AST/textual (S5 → variantKey deixa de ser
//          coordenada de execução do kernel): Skills 01/02 (kernel)
//          nunca podem ter "variantKey" como PropertySignature em
//          nenhum type — usar "stageWorkUnitIdentityHash". Skill 01:
//          "StageWorkUnitAxis" precisa conter 'CREATIVE_VARIANT'/
//          'BEAT'/'PUBLICATION_TARGET'; "StageExpansionManifest"
//          precisa ter os 9 campos do contrato;
//          "StageSubjectBinding"/"StageExecution" precisam ter
//          "stageWorkUnitIdentityHash".
//   G_S6   — extensão textual (S6 → VIDEO_COMPOSITION_V1, sem stage
//          de assembly no V1): Skills 08/10/11/12/13/14/17/20
//          precisam referenciar "VIDEO_COMPOSITION_V1"
//          (contracts/VIDEO-COMPOSITION.md). Skill 08 precisa
//          formalizar "beats.length === 1". Skill 14 precisa ter a
//          proibição explícita de concatenação multi-source.
//   G_S7   — extensão textual (S7 → EXECUTION_RUNTIME_V1, Vercel =
//          CONTROL_PLANE, todo SkillJobHandler executa em
//          VIDEO_MACHINE_WORKER_V1/DURABLE_WORKER):
//          Skills 01/02/11/12/14/16/17 precisam referenciar
//          textualmente "EXECUTION_RUNTIME_V1"
//          (contracts/EXECUTION-RUNTIME.md). Skill 02 precisa afirmar
//          "DURABLE_WORKER" e "VIDEO_MACHINE_WORKER_V1". Skill 11
//          precisa referenciar "CONTINUE" liberando o worker (mesma
//          Attempt / handler tick discreto). Skills 12/14 precisam
//          referenciar "DURABLE_WORKER" perto de FFmpeg/media
//          processing. Checagem de "handler execution atribuída a
//          Vercel function/API route/cron/webhook" (item #151 do
//          debate do S7) deliberadamente NÃO implementada via regex —
//          o próprio ChatGPT avisou que um regex ingênuo banindo
//          "executa na Vercel" bane a própria prosa que PROÍBE isso
//          (mesmo problema self-triggering do S4/S14, evitado de novo
//          aqui como já tinha sido no S9); da mesma forma, o check
//          contra Redis/BullMQ/broker (item #155) também foi
//          deliberadamente descartado — o termo aparece legitimamente
//          em seção "not used in V1" e geraria falso positivo.
//   G_M1   — extensão via AST/textual (M1, primeiro dos 8 achados
//          MINOR — CONTRACT_CONVENTIONS_V1, vocabulário/nomenclatura
//          duplicada entre contratos): Skills 01/02 não podem ter
//          PropertySignature "stage" nos tipos kernel/scheduling
//          conhecidos (StageDefinition/LogicalJobIntent/Job) — usar
//          "stageKey". Skill 09 (framePolicySnapshot) não pode ter
//          "policyVersion" tipado como number — só string. Skill 03
//          (ApprovalPolicy) não pode ter "onInsufficientEvidence" como
//          property. Checagem de TrendEvidenceRef/EvidenceMatchJudgement
//          deliberadamente NÃO implementada via AST amplo nesta rodada —
//          são achados pontuais de 1 ocorrência cada, já corrigidos
//          diretamente; um lint genérico pra esses dois exigiria
//          distinguir "fato canônico validado" de "proposta bruta de
//          provider" (CreativeProviderProposal), que é julgamento
//          semântico fora do alcance de um AST estrutural — mesmo tipo
//          de limite já documentado no G_S9.
//   G_M2   — extensão via AST (M2, segundo dos 8 achados MINOR —
//          OPTIONAL_REFERENCE_RULE_V1, refs opcionais defensivas sem
//          efeito real): achado real de corpus (grep confirmou o
//          mesmo padrão "OPCIONAL, defensivo" nas 3 Skills antes de
//          aplicar) — Skill05 (OfferAnalysisInput.candidateRefs),
//          Skill06 (TrendResearchInput.candidateRefs), Skill07
//          (CreativeDirectionInput.subjectRef) removidos por serem
//          REDUNDANT_DEFENSIVE_REFERENCE: a própria spec já dizia "se
//          ausente, a Skill reabre o upstream normalmente" — nenhuma
//          mudança de comportamento na ausência, logo não eram
//          controle de segurança real. Guarda de regressão: nenhum
//          desses 3 tipos pode voltar a ter essas properties.
//   G_M3   — extensão via AST (M3, terceiro dos 8 achados MINOR —
//          poolSnapshotHash removido de Skill04: campo existia mas não
//          tinha consumer real, e a própria spec já admitia "NÃO é
//          lock otimista nem garante que o catálogo não mudou depois".
//          Ban seguro via AST porque o campo inteiro está aposentado —
//          nenhum type de nenhuma Skill pode ter essa property.
//   G_M5   — extensão textual + global (M5, quinto dos 8 achados MINOR
//          — VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1, Skills 06/20/21
//          deferidas pra V2, contenção de over-engineering): Skills
//          06/20/21 precisam conter o marker "DEFERRED_V2_CONTRACT".
//          Skill25 precisa conter "V1_REQUIRED" (nunca virar
//          DEFERRED_V2_CONTRACT inteira — só o rate-limit ledger é
//          DEFERRED_V2_MECHANISM). Check global:
//          IMPLEMENTATION-SCOPE.md precisa existir e referenciar as 3
//          Skills. Deliberadamente NÃO construído um grafo automático
//          de dependências entre as 25 Skills — isso seria o próprio
//          over-engineering que este ponto elimina; a investigação de
//          dependências reais (achou 1 dependência hard real: Skill07
//          exigia TrendResearchResult da Skill06, corrigida tornando
//          trendResearchResultId opcional) foi feita manualmente antes
//          de aplicar, documentada em IMPLEMENTATION-SCOPE.md.
//   G_M7   — extensão via AST (M7, sétimo dos 8 achados MINOR —
//          Trusted Run Identity Allocation): achado real —
//          RunControlCommand.runId era obrigatório em TODOS os tipos
//          de comando, inclusive START, e a prosa confirmava "START é
//          sempre associado a um runId pré-gerado antes da criação" —
//          exatamente o anti-padrão que o Fable apontou (commandId só
//          protege contra duplicação do MESMO comando, nunca prova que
//          um runId externo não pertence a outra operação). Corrigido:
//          RunControlCommand.runId precisa ser opcional (obrigatório
//          só pra PAUSE/RESUME/CANCEL/STATUS, proibido pra START —
//          Skill01 aloca internamente). ProductionRunStartRequest
//          nunca teve runId (já correto) — guarda de regressão mesmo
//          assim.
//   G_M8   — extensão via AST + textual (M8, oitavo e último dos 8
//          achados MINOR — identidade determinística de
//          scheduleSlotKey): achado real — Skill18
//          MetricCollectionTrigger.SCHEDULED só tinha
//          schedulePolicyKey/scheduleSlotKey, sem nenhum campo
//          representando a ocorrência nominal, e o exemplo real de
//          collectionRequestKey mostrava literalmente um bucket de
//          hora truncada ("2026-09-18T12") — arredondamento
//          indefinido, exatamente o achado do Fable. Corrigido:
//          adicionado scheduledOccurrenceAt (instante nominal RFC3339
//          UTC, nunca now()/horário de execução observado) ao
//          MetricCollectionTrigger; scheduleSlotKey deriva de
//          (schedulePolicyKey, scheduledOccurrenceAt). Skill18 precisa
//          conter a regra normativa "MUST NOT be derived by rounding"
//          (textual — não banir round/floor/UTC corpus-wide, só exigir
//          a presença da regra).
// O restante do ruleset G002-G090 desenhado pelo ChatGPT (registry de ownership
// cross-skill, hash binding, declaration digest, superseded contracts, baseline/CI)
// está documentado em CONTRACT-LINT.md como especificação para expansão futura, não
// implementado nesta rodada — ver a nota de escopo lá pra justificativa.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "..", "src", "modules", "video-machine", "skills");

const EXPECTED_SKILL_IDS = Array.from({ length: 25 }, (_, i) => String(i + 1).padStart(2, "0"));

function findSkillDirs() {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function extractFencedBlocks(markdown, langs) {
  const blocks = [];
  const re = /```([a-zA-Z]*)\n([\s\S]*?)```/g;
  let m;
  let line = 1;
  let lastIndex = 0;
  while ((m = re.exec(markdown))) {
    const before = markdown.slice(lastIndex, m.index);
    line += (before.match(/\n/g) || []).length;
    lastIndex = m.index;
    const lang = m[1].toLowerCase();
    if (langs.includes(lang)) {
      blocks.push({ lang, code: m[2], startLine: line + 1 });
    }
    line += (m[0].match(/\n/g) || []).length;
    lastIndex = re.lastIndex;
  }
  return blocks;
}

function extractTopLevelDeclarations(code, sourceLabel) {
  const declarations = [];
  const parseErrors = [];
  const propertyNames = [];
  const sourceFile = ts.createSourceFile(
    sourceLabel,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  // @ts-ignore — parseDiagnostics is internal but stable enough for a lint tool
  const diags = sourceFile.parseDiagnostics || [];
  for (const d of diags) {
    parseErrors.push(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
  }
  sourceFile.forEachChild((node) => {
    if (ts.isTypeAliasDeclaration(node)) {
      declarations.push({ kind: "TYPE", name: node.name.text });
    } else if (ts.isInterfaceDeclaration(node)) {
      declarations.push({ kind: "INTERFACE", name: node.name.text });
    }
  });
  const visit = (node, enclosingTypeName) => {
    if (ts.isTypeAliasDeclaration(node)) enclosingTypeName = node.name.text;
    else if (ts.isInterfaceDeclaration(node)) enclosingTypeName = node.name.text;
    if (ts.isPropertySignature(node) && node.name && ts.isIdentifier(node.name)) {
      // fullStart inclui leading trivia (comentários/whitespace) — pos
      // (getStart) pula comentários, o que faria qualquer checagem de
      // "comentário LEGACY logo acima do campo" nunca encontrar nada.
      propertyNames.push({
        name: node.name.text,
        pos: node.getStart(sourceFile),
        fullStart: node.getFullStart(),
        enclosingTypeName,
        optional: Boolean(node.questionToken),
        typeText: node.type ? node.type.getText(sourceFile) : undefined,
      });
    }
    ts.forEachChild(node, (child) => visit(child, enclosingTypeName));
  };
  visit(sourceFile, undefined);
  return { declarations, parseErrors, propertyNames };
}

function extractFatalErrorCodes(markdown) {
  // FATAL_ERROR blocks are ```text fences that appear after a "FATAL_ERROR" heading
  // or inline marker within ~200 chars before the fence.
  const codes = [];
  const re = /```text\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(markdown))) {
    const precedingContext = markdown.slice(Math.max(0, m.index - 200), m.index);
    if (!/FATAL_ERROR/i.test(precedingContext)) continue;
    const lines = m[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[A-Z][A-Z0-9_]*$/.test(l));
    codes.push(...lines);
  }
  return codes;
}

function lintSkillSpec(skillDirName) {
  const specPath = join(SKILLS_DIR, skillDirName, "SPEC.md");
  const findings = [];
  const warnings = [];
  if (!existsSync(specPath)) {
    return { skillDirName, specPath, findings: [{ rule: "G016_SKILL_SPEC_MISSING", detail: "SPEC.md ausente" }], declCount: 0 };
  }
  // PATCH (achado N7 da re-review GPT-6 Astra, 2026-09-19): normaliza
  // CRLF->LF no ponto de leitura. Sem isso, extractFencedBlocks/
  // extractFatalErrorCodes (regex `\n` literal logo após a linguagem
  // do fence) não reconhecem NENHUM fence em texto CRLF — a extração
  // silenciosamente retorna vazio, nenhuma regra dispara, e o script
  // reporta PASS mesmo com corpus real (confirmado: uma duplicata
  // deliberada de type passou despercebida em CRLF, mas disparou
  // G001_DUPLICATE_SYMBOL_WITHIN_SPEC corretamente após normalizar pra
  // LF). Normalizar aqui, uma única vez, é mais seguro que tornar cada
  // regex tolerante a `\r?\n` individualmente.
  const markdown = readFileSync(specPath, "utf-8").replace(/\r\n/g, "\n");

  const tsBlocks = extractFencedBlocks(markdown, ["ts", "typescript"]);
  const seenSymbols = new Map(); // name -> count
  let totalDecls = 0;
  const allPropertyNamesByType = new Map(); // enclosingTypeName -> Set(propertyName)
  const allPropertyDetailsByType = new Map(); // enclosingTypeName -> Map(propertyName -> {optional})
  // R2 (kernel repair pós re-review GPT-6 Astra, 2026-09-19): union
  // discriminada real (Job) tem o MESMO nome de propriedade aparecendo
  // em branches diferentes com typeText diferente ("string" numa branch,
  // "never" noutra) — allPropertyDetailsByType guarda só a última
  // ocorrência (sobrescreve), então não basta pra provar que as DUAS
  // formas existem. Coleta dedicada de todos os typeTexts vistos por
  // nome de propriedade, só pro type Job (mesmo bug que pegamos em N3
  // com StageTransitionResolution.sources).
  const jobPropertyTypeTextsByName = new Map(); // propertyName -> Set(typeText)

  const LEGACY_PROPERTY_NAMES = new Set(["errorClass", "retryableErrorClasses"]);
  // Ponto S13: allowlist explícita dos únicos tipos legados que podem
  // ter consumedAt — qualquer type NOVO com esse campo é erro (impede
  // o padrão single-consumer legado de se espalhar de novo).
  const LEGACY_CONSUMED_AT_ALLOWLIST = new Set([
    "LogicalJobIntent",
    "JobBlockedEvent",
    "JobResultEvent",
    "ApprovalResolvedEvent", // achado real do lint durante o S13, não previsto pelo Fable/ChatGPT originalmente
  ]);

  for (const block of tsBlocks) {
    const { declarations, parseErrors, propertyNames } = extractTopLevelDeclarations(
      block.code,
      `${skillDirName}:${block.startLine}.ts`
    );
    for (const prop of propertyNames) {
      if (!prop.enclosingTypeName) continue;
      if (!allPropertyNamesByType.has(prop.enclosingTypeName)) {
        allPropertyNamesByType.set(prop.enclosingTypeName, new Set());
      }
      allPropertyNamesByType.get(prop.enclosingTypeName).add(prop.name);
      if (!allPropertyDetailsByType.has(prop.enclosingTypeName)) {
        allPropertyDetailsByType.set(prop.enclosingTypeName, new Map());
      }
      allPropertyDetailsByType.get(prop.enclosingTypeName).set(prop.name, { optional: prop.optional, typeText: prop.typeText });
      if (prop.enclosingTypeName === "Job") {
        if (!jobPropertyTypeTextsByName.has(prop.name)) {
          jobPropertyTypeTextsByName.set(prop.name, new Set());
        }
        jobPropertyTypeTextsByName.get(prop.name).add(prop.typeText);
      }
    }
    for (const prop of propertyNames) {
      if (!LEGACY_PROPERTY_NAMES.has(prop.name)) continue;
      const blockTextBefore = block.code.slice(Math.max(0, prop.fullStart - 400), prop.pos);
      const markdownContextBefore = markdown.slice(0, markdown.indexOf(block.code));
      const nearbyMarkdown = markdownContextBefore.slice(-400);
      const isMarkedLegacy = /LEGACY|SUPERSEDED|NON-AUTHORITATIVE/i.test(blockTextBefore) ||
        /LEGACY|SUPERSEDED|NON-AUTHORITATIVE/i.test(nearbyMarkdown) ||
        /LEGACY|SUPERSEDED|NON-AUTHORITATIVE/i.test(block.code.slice(prop.pos, prop.pos + 200));
      if (!isMarkedLegacy) {
        findings.push({
          rule: "G_S12_LEGACY_ERROR_FIELD_UNMARKED",
          detail: `campo legacy '${prop.name}' encontrado sem marcação LEGACY/SUPERSEDED (linha ~${block.startLine})`,
        });
      }
    }
    for (const prop of propertyNames) {
      if (prop.name !== "consumedAt") continue;
      if (LEGACY_CONSUMED_AT_ALLOWLIST.has(prop.enclosingTypeName)) {
        const blockTextBefore = block.code.slice(Math.max(0, prop.fullStart - 400), prop.pos);
        const isMarkedLegacy = /LEGACY|SUPERSEDED|NON-AUTHORITATIVE/i.test(blockTextBefore) ||
          /LEGACY|SUPERSEDED|NON-AUTHORITATIVE/i.test(block.code.slice(prop.pos, prop.pos + 250));
        if (!isMarkedLegacy) {
          findings.push({
            rule: "G_S13_CONSUMED_AT_UNMARKED",
            detail: `'${prop.enclosingTypeName}.consumedAt' na allowlist mas sem marcação LEGACY/NON-AUTHORITATIVE por perto (linha ~${block.startLine})`,
          });
        }
      } else {
        findings.push({
          rule: "G_S13_CONSUMED_AT_OUTSIDE_ALLOWLIST",
          detail: `'${prop.enclosingTypeName || "(desconhecido)"}.consumedAt' fora da allowlist legada — OutboxConsumerDelivery é a única autoridade de entrega (linha ~${block.startLine})`,
        });
      }
    }
    // G021 rebaixado a WARNING (não bloqueia PASS): vários blocos ```ts
    // no corpus são exemplos de VALOR (object literals ilustrativos),
    // não declarações de tipo — o parser do TS ainda extrai
    // corretamente as declarações reais do mesmo bloco (parser
    // error-tolerant), então isso não mascara G001. Bloquear nisso
    // custaria reescrever dezenas de snippets ilustrativos por zero
    // ganho arquitetural.
    for (const err of parseErrors) {
      warnings.push({
        rule: "GW_SPEC_TYPESCRIPT_PARSE_WARNING",
        detail: `linha ~${block.startLine}: ${err}`,
      });
    }
    for (const decl of declarations) {
      totalDecls++;
      const prevCount = seenSymbols.get(decl.name) || 0;
      seenSymbols.set(decl.name, prevCount + 1);
      if (prevCount >= 1) {
        findings.push({
          rule: "G001_DUPLICATE_SYMBOL_WITHIN_SPEC",
          detail: `${decl.kind} ${decl.name} declarado mais de uma vez (linha ~${block.startLine})`,
        });
      }
    }
  }

  const fatalCodes = extractFatalErrorCodes(markdown);
  const seenFatal = new Map();
  for (const code of fatalCodes) {
    const prevCount = seenFatal.get(code) || 0;
    seenFatal.set(code, prevCount + 1);
    if (prevCount >= 1) {
      findings.push({
        rule: "G012_FATAL_ERROR_DUPLICATE_WITHIN_SKILL",
        detail: `FATAL_ERROR ${code} listado mais de uma vez`,
      });
    }
  }

  if (!markdown.includes("CANONICAL_SERIALIZATION_V1")) {
    findings.push({
      rule: "G_S10_CANONICAL_SERIALIZATION_REFERENCE_MISSING",
      detail: "SPEC não referencia CANONICAL_SERIALIZATION_V1 (ver contracts/CANONICAL-SERIALIZATION.md)",
    });
  }

  if (markdown.includes("AuditEvent")) {
    if (!markdown.includes("AUDIT_EVENT_V1")) {
      findings.push({
        rule: "G_S11_AUDIT_EVENT_REFERENCE_MISSING",
        detail: "SPEC menciona AuditEvent mas não referencia AUDIT_EVENT_V1 (ver contracts/AUDIT-EVENT.md)",
      });
    }
    if (seenSymbols.has("AuditEvent")) {
      findings.push({
        rule: "G_S11_AUDIT_EVENT_LOCAL_REDECLARATION",
        detail: "SPEC declara localmente type/interface AuditEvent — dono canônico é contracts/AUDIT-EVENT.md",
      });
    }
  }

  const S14_TARGET_SKILLS = ["04-", "05-", "06-", "07-", "08-"];
  if (S14_TARGET_SKILLS.some((p) => skillDirName.startsWith(p))) {
    if (!markdown.includes("RESULT_MATERIALIZATION_V1")) {
      findings.push({
        rule: "G_S14_RESULT_MATERIALIZATION_REFERENCE_MISSING",
        detail: "SPEC não referencia RESULT_MATERIALIZATION_V1 (ver contracts/RESULT-MATERIALIZATION.md)",
      });
    }
    const CONTRADICTORY_PHRASES = [
      /resultado logicamente incompat[ií]vel/i,
      /reexecu[çc][ãa]o que produziria/i,
      /recalcula e compara/i,
    ];
    for (const phrase of CONTRADICTORY_PHRASES) {
      if (phrase.test(markdown)) {
        findings.push({
          rule: "G_S14_CONTRADICTORY_REPLAY_LANGUAGE",
          detail: `frase contraditória pré-S14 encontrada (padrão: ${phrase})`,
        });
      }
    }
  }

  const S15_EXECUTION_TYPES = {
    "10-": { type: "VideoProviderTarget", mustHave: false },
    "11-": { type: "VideoGenerationExecution", mustHave: true },
    "16-": { type: "OutboundSendCheckpoint", mustHave: true },
    "17-": { type: "PublicationExecution", mustHave: true },
  };
  for (const [prefix, { type, mustHave }] of Object.entries(S15_EXECUTION_TYPES)) {
    if (!skillDirName.startsWith(prefix)) continue;
    const props = allPropertyNamesByType.get(type);
    if (!props) continue; // type not found in this file — not this rule's concern
    const hasHandle = props.has("credentialHandleRef");
    if (mustHave && !hasHandle) {
      findings.push({
        rule: "G_S15_CREDENTIAL_HANDLE_MISSING",
        detail: `${type} não tem credentialHandleRef — execução autenticada exige handle da Skill 24 (ver contracts/... e Skill24 "Credential-handle consumption boundary")`,
      });
    }
    if (!mustHave && hasHandle) {
      findings.push({
        rule: "G_S15_PLANNING_TYPE_HAS_CREDENTIAL_HANDLE",
        detail: `${type} é planejamento e NUNCA deve conter credentialHandleRef (separação planning/execution do Ponto S15)`,
      });
    }
  }

  // Ponto S2 (ProductVisualReferenceSet como artifact tenant-scoped
  // obrigatório) — checagens corpus-wide, rodam em todo arquivo:
  for (const [typeName, props] of allPropertyNamesByType.entries()) {
    if (typeName !== "ProductVisualReferenceSet" && typeName !== "ProductVisualReferenceSetRef" && props.has("productVisualReferenceSetId")) {
      findings.push({
        rule: "G_S2_NAKED_PRODUCT_VISUAL_REFERENCE_SET_FK",
        detail: `${typeName}.productVisualReferenceSetId é FK solta — use productVisualReferenceSetRef: ProductVisualReferenceSetRef (Ponto S2)`,
      });
    }
    for (const oldName of ["referenceSetHash", "referenceSetId"]) {
      if (props.has(oldName)) {
        findings.push({
          rule: "G_S2_LEGACY_REFERENCE_SET_FIELD_NAME",
          detail: `${typeName}.${oldName} é nome pré-S2 — renomeado pra productVisualReferenceSetRef/productVisualReferenceSetHash`,
        });
      }
    }
  }

  if (skillDirName.startsWith("09-")) {
    const setProps = allPropertyNamesByType.get("ProductVisualReferenceSet");
    if (setProps) {
      for (const required of ["productVisualReferenceSetId", "tenantId", "subjectRef", "content", "productVisualReferenceSetHash"]) {
        if (!setProps.has(required)) {
          findings.push({
            rule: "G_S2_PRODUCT_VISUAL_REFERENCE_SET_MISSING_FIELD",
            detail: `ProductVisualReferenceSet não tem '${required}' (Ponto S2)`,
          });
        }
      }
    }
    for (const type of ["FrameGenerationSuccess", "FrameGenerationNoFrameRequired", "FrameGenerationReferenceUnavailable"]) {
      const props = allPropertyNamesByType.get(type);
      if (props && !props.has("productVisualReferenceSetRef")) {
        findings.push({
          rule: "G_S2_FRAME_RESULT_BRANCH_MISSING_SET_REF",
          detail: `${type} não tem productVisualReferenceSetRef — toda branch de FrameGenerationResult precisa materializar o set, mesmo sem frame (Ponto S2)`,
        });
      }
    }
  }

  const S2_CONSUMER_TYPES = {
    "10-": ["VideoGenerationIntent", "VideoPromptArtifact"],
    "11-": ["VideoGenerationExecution"],
    "12-": ["VideoAuditInput"],
    "13-": ["CorrectionInput"],
  };
  for (const [prefix, types] of Object.entries(S2_CONSUMER_TYPES)) {
    if (!skillDirName.startsWith(prefix)) continue;
    for (const type of types) {
      const props = allPropertyNamesByType.get(type);
      if (props && !props.has("productVisualReferenceSetRef")) {
        findings.push({
          rule: "G_S2_CONSUMER_MISSING_SET_REF",
          detail: `${type} não tem productVisualReferenceSetRef (Ponto S2 — consumer da Skill 09)`,
        });
      }
    }
  }

  // Ponto S3 (CreativeCtaIntent como sub-artifact imutável da Skill07,
  // sem creativeCtaIntentId fictício) — corpus-wide:
  for (const [typeName, props] of allPropertyNamesByType.entries()) {
    if (props.has("creativeCtaIntentId")) {
      findings.push({
        rule: "G_S3_BANNED_CREATIVE_CTA_INTENT_ID",
        detail: `${typeName}.creativeCtaIntentId proibido — CreativeCtaIntent não tem identidade independente, use creativeCtaIntentRef: CreativeCtaIntentRef (Ponto S3)`,
      });
    }
  }
  if (skillDirName.startsWith("07-")) {
    const refProps = allPropertyNamesByType.get("CreativeCtaIntentRef");
    if (refProps) {
      for (const required of ["creativeDirectionResultId", "creativeDirectionHash", "creativeCtaIntentHash"]) {
        if (!refProps.has(required)) {
          findings.push({
            rule: "G_S3_CREATIVE_CTA_INTENT_REF_MISSING_FIELD",
            detail: `CreativeCtaIntentRef não tem '${required}' (Ponto S3)`,
          });
        }
      }
    }
    const successProps = allPropertyNamesByType.get("CreativeDirectionSuccess");
    if (successProps && !successProps.has("creativeCtaIntentHash")) {
      findings.push({
        rule: "G_S3_CREATIVE_DIRECTION_SUCCESS_MISSING_CTA_HASH",
        detail: "CreativeDirectionSuccess não tem creativeCtaIntentHash (Ponto S3)",
      });
    }

    // R5 — Skill20 é DEFERRED_V2_CONTRACT; nenhum type V1 real da Skill07
    // pode adquirir referência a VariationDirective (nem opcional — evita
    // pré-wiring morto/campo fantasma) antes da ativação V2. Checagem via
    // AST real nos owners V1 conhecidos, não banimento textual da palavra
    // (comentário explicativo futuro é permitido).
    for (const typeName of ["CreativeDirectionInput", "CreativeDirectionSuccess", "CreativeDirectionUnavailable"]) {
      const props = allPropertyNamesByType.get(typeName);
      if (!props) continue;
      for (const propName of props) {
        if (/variationDirective/i.test(propName)) {
          findings.push({
            rule: "G_R5_SKILL07_V1_VARIATION_DIRECTIVE_DEPENDENCY_BANNED",
            detail: `${typeName}.${propName} referencia VariationDirective — Skill20 é DEFERRED_V2_CONTRACT, nenhum type V1 real da Skill07 pode depender disso, nem opcionalmente (achado R5)`,
          });
        }
      }
    }
  }
  // R5 — protege a regra já existente (Ponto S5/M5): nenhum pipeline
  // adapter V1 pode emitir CREATIVE_VARIANT derivado da Skill20. A frase
  // normativa vive em blockquote (linhas prefixadas "> "), então
  // normaliza antes de comparar.
  if (skillDirName.startsWith("20-")) {
    const flattened = markdown.replace(/\r?\n>\s*/g, " ");
    if (!flattened.includes("No V1 pipeline adapter may emit CREATIVE_VARIANT work units derived from Skill20")) {
      findings.push({
        rule: "G_R5_V1_CREATIVE_VARIANT_WORK_UNIT_BANNED",
        detail: "Não encontrei a frase normativa 'No V1 pipeline adapter may emit CREATIVE_VARIANT work units derived from Skill20' — essa proibição precisa continuar explícita (achado R5, reforça Ponto S5/M5)",
      });
    }
  }

  const S3_CONSUMER_TYPES = {
    "16-": ["CreativeCtaMatch", "SocialPublicationBindingRef"],
    "17-": ["PublicationInput", "PublicationPlan", "LogicalPublicationIdentity"],
  };
  for (const [prefix, types] of Object.entries(S3_CONSUMER_TYPES)) {
    if (!skillDirName.startsWith(prefix)) continue;
    for (const type of types) {
      const props = allPropertyNamesByType.get(type);
      if (props && !props.has("creativeCtaIntentRef")) {
        findings.push({
          rule: "G_S3_CONSUMER_MISSING_CTA_REF",
          detail: `${type} não tem creativeCtaIntentRef (Ponto S3 — consumer do CTA da Skill 07)`,
        });
      }
    }
  }

  // Ponto S4 (ApprovalEvidenceBundle encerra o "depende da Skill12" —
  // Skill03 dona do contrato de evidência, Skill12 só fornece a fonte):
  if (skillDirName.startsWith("03-")) {
    const gateKeyDecl = seenSymbols.has("ApprovalGateKey");
    if (gateKeyDecl && !markdown.includes("'VIDEO_COMPLIANCE'")) {
      findings.push({
        rule: "G_S4_APPROVAL_GATE_KEY_INCOMPLETE",
        detail: "ApprovalGateKey não contém VIDEO_COMPLIANCE (Ponto S4)",
      });
    }
    if (gateKeyDecl && !markdown.includes("'FIRST_REAL_PUBLISH'")) {
      findings.push({
        rule: "G_S4_APPROVAL_GATE_KEY_INCOMPLETE",
        detail: "ApprovalGateKey não contém FIRST_REAL_PUBLISH (Ponto S4)",
      });
    }
    const bundleProps = allPropertyNamesByType.get("ApprovalEvidenceBundle");
    if (bundleProps) {
      for (const required of ["approvalEvidenceBundleId", "tenantId", "approvalRequestRef", "gateKey", "subjectRef", "approvalPolicySnapshotRef", "evidenceItems", "missingRequirementKeys", "coverage", "approvalEvidenceBundleHash"]) {
        if (!bundleProps.has(required)) {
          findings.push({
            rule: "G_S4_APPROVAL_EVIDENCE_BUNDLE_MISSING_FIELD",
            detail: `ApprovalEvidenceBundle não tem '${required}' (Ponto S4)`,
          });
        }
      }
    }
    const decisionProps = allPropertyNamesByType.get("ApprovalDecision");
    if (decisionProps && !decisionProps.has("approvalEvidenceBundleRef")) {
      findings.push({
        rule: "G_S4_APPROVAL_DECISION_MISSING_BUNDLE_REF",
        detail: "ApprovalDecision não tem approvalEvidenceBundleRef (Ponto S4)",
      });
    }
    if (/depende de como a Skill\s*12/i.test(markdown) || /consumidor possível: Skill\s*03/i.test(markdown)) {
      findings.push({
        rule: "G_S4_MUTUAL_DEFER_LANGUAGE",
        detail: "frase de defer mútuo Skill03↔Skill12 ainda presente (Ponto S4)",
      });
    }
  }
  if (skillDirName.startsWith("12-")) {
    if (/consumidor possível: Skill\s*03/i.test(markdown)) {
      findings.push({
        rule: "G_S4_MUTUAL_DEFER_LANGUAGE",
        detail: "frase de defer mútuo Skill03↔Skill12 ainda presente (Ponto S4)",
      });
    }
    if (!markdown.includes("SATISFIES_REQUIREMENT") || !markdown.includes("VIOLATES_REQUIREMENT") || !markdown.includes("INSUFFICIENT_EVIDENCE")) {
      findings.push({
        rule: "G_S4_SKILL12_MAPPING_MISSING",
        detail: "SPEC não referencia o mapeamento normativo verdict->ApprovalEvidenceOutcome (Ponto S4)",
      });
    }
  }

  // Ponto S9 (ProductUsageEvidence como ledger canônico — Skill04 owner,
  // Skills 11/14/17 writers autorizados, sem "adivinhar" uso por
  // artifacts espalhados):
  if (skillDirName.startsWith("04-")) {
    const evidenceProps = allPropertyNamesByType.get("ProductUsageEvidence");
    if (evidenceProps) {
      for (const required of ["productUsageEvidenceId", "tenantId", "productId", "usageKind", "usedAt", "evidenceRef", "recordedAt", "productUsageEvidenceHash"]) {
        if (!evidenceProps.has(required)) {
          findings.push({
            rule: "G_S9_PRODUCT_USAGE_EVIDENCE_MISSING_FIELD",
            detail: `ProductUsageEvidence não tem '${required}' (Ponto S9)`,
          });
        }
      }
    }
  }
  const S9_WRITER_SKILLS = ["11-", "14-", "17-"];
  if (S9_WRITER_SKILLS.some((p) => skillDirName.startsWith(p))) {
    if (!markdown.includes("PRODUCT_USAGE_EVIDENCE_V1")) {
      findings.push({
        rule: "G_S9_WRITER_MISSING_REFERENCE",
        detail: "SPEC não referencia PRODUCT_USAGE_EVIDENCE_V1 como writer autorizado (Ponto S9)",
      });
    }
  }

  // Ponto S5 (variantKey deixa de ser coordenada de execução do
  // kernel — StageWorkUnitIdentity/StageExpansionManifest estruturados
  // no lugar da string livre):
  const S5_KERNEL_SKILLS = ["01-", "02-"];
  if (S5_KERNEL_SKILLS.some((p) => skillDirName.startsWith(p))) {
    for (const [typeName, props] of allPropertyNamesByType.entries()) {
      if (props.has("variantKey")) {
        findings.push({
          rule: "G_S5_BANNED_VARIANT_KEY_IN_KERNEL",
          detail: `${typeName}.variantKey proibido no kernel — use stageWorkUnitIdentityHash: string (Ponto S5)`,
        });
      }
    }
  }
  if (skillDirName.startsWith("01-")) {
    const axisDecl = seenSymbols.has("StageWorkUnitAxis");
    if (axisDecl) {
      for (const axisLiteral of ["'CREATIVE_VARIANT'", "'BEAT'", "'PUBLICATION_TARGET'"]) {
        if (!markdown.includes(axisLiteral)) {
          findings.push({
            rule: "G_S5_STAGE_WORK_UNIT_AXIS_INCOMPLETE",
            detail: `StageWorkUnitAxis não contém ${axisLiteral} (Ponto S5)`,
          });
        }
      }
    }
    const manifestProps = allPropertyNamesByType.get("StageExpansionManifest");
    if (manifestProps) {
      for (const required of ["stageExpansionManifestId", "tenantId", "runId", "stageIterationId", "stageKey", "expansionSourceRefs", "workUnits", "materializedAt", "stageExpansionManifestHash"]) {
        if (!manifestProps.has(required)) {
          findings.push({
            rule: "G_S5_STAGE_EXPANSION_MANIFEST_MISSING_FIELD",
            detail: `StageExpansionManifest não tem '${required}' (Ponto S5)`,
          });
        }
      }
    }
    const subjectBindingProps = allPropertyNamesByType.get("StageSubjectBinding");
    if (subjectBindingProps && !subjectBindingProps.has("stageWorkUnitIdentityHash")) {
      findings.push({
        rule: "G_S5_STAGE_SUBJECT_BINDING_MISSING_WORK_UNIT_HASH",
        detail: "StageSubjectBinding não tem stageWorkUnitIdentityHash (Ponto S5)",
      });
    }
    const stageExecutionProps = allPropertyNamesByType.get("StageExecution");
    if (stageExecutionProps && !stageExecutionProps.has("stageWorkUnitIdentityHash")) {
      findings.push({
        rule: "G_S5_STAGE_EXECUTION_MISSING_WORK_UNIT_HASH",
        detail: "StageExecution não tem stageWorkUnitIdentityHash (Ponto S5)",
      });
    }

    // Kernel repair N1+N2+N3 (2026-09-18, re-review GPT-6 Astra) — via AST
    // real. Achado comum aos três: campo/branch descrito só em comentário
    // "PATCH (patch in-place)", nunca aplicado ao type de verdade — mesma
    // classe de bug que G_S5_* já vigiava, agora pro desenho de identidade
    // do kernel (Stage → StageIteration → StageWorkUnitIdentity →
    // StageSubjectBinding → StageExecution → Job).
    const kernelContractProps = allPropertyNamesByType.get("StageKernelContract");
    if (kernelContractProps && !kernelContractProps.has("workUnitContract")) {
      findings.push({
        rule: "G_N123_STAGE_KERNEL_WORK_UNIT_CONTRACT_MISSING",
        detail: "StageKernelContract não tem workUnitContract — sem isso SINGLE/EXPANDABLE nunca vira contrato executável, só comentário (achado N3)",
      });
    }

    const bindingProps = allPropertyNamesByType.get("StageSubjectBinding");
    if (bindingProps && !bindingProps.has("stageIterationId")) {
      findings.push({
        rule: "G_N123_BINDING_ITERATION_IDENTITY_MISSING",
        detail: "StageSubjectBinding não tem stageIterationId — o binding colidiria entre StageIteration diferentes pra mesma work unit coordinate (achado N2)",
      });
    }

    const transitionProps = allPropertyNamesByType.get("StageTransitionResolution");
    if (transitionProps) {
      if (!transitionProps.has("workUnitContract") || !transitionProps.has("source")) {
        findings.push({
          rule: "G_N123_EXPANDABLE_TRANSITION_BRANCH_MISSING",
          detail: "StageTransitionResolution não tem workUnitContract/source — o fan-out EXPANDABLE precisa existir no type real como discriminated union, nunca só em comentário \"PATCH\" (achado N3)",
        });
      }
      // Checagem dirigida via tipo real do AST (não texto/regex): "members"
      // sozinho não basta — a branch SINGLE também declara "members?: never"
      // como marcador de exclusão mútua, então só checar presença do nome
      // de propriedade não detecta a branch EXPANDABLE real sendo removida
      // (nem markdown.includes(...) basta — a prosa deste próprio SPEC.md
      // cita o mesmo texto ao descrever o campo). Precisa do typeText real
      // da AST apontando pro array, não pra "never".
      // PATCH (N9, kernel repair pós re-review GPT-6 Astra, 2026-09-19):
      // o campo real virou "members: StageTransitionMember[]" (era
      // "sources: StageTransitionSource[]") — StageTransitionMember cobre
      // EXECUTED e SKIPPED_SHORT_CIRCUIT, resolvendo a contradição N9
      // entre "sources precisa ser exatamente esse conjunto [de execuções]"
      // e o short-circuit que nunca executa work units seladas.
      const membersType = allPropertyDetailsByType.get("StageTransitionResolution")?.get("members")?.typeText;
      if (!membersType || !membersType.includes("StageTransitionMember[]")) {
        findings.push({
          rule: "G_N123_EXPANDABLE_TRANSITION_BRANCH_MISSING",
          detail: `StageTransitionResolution.members não é 'StageTransitionMember[]' (encontrado: ${membersType || "ausente"}) — a branch EXPANDABLE precisa carregar o conjunto real de members (EXECUTED/SKIPPED_SHORT_CIRCUIT), não só o marcador 'members?: never' da branch SINGLE (achados N3+N9)`,
        });
      }

      // PATCH (N9): StageTransitionMember precisa existir como
      // discriminated union real com as duas branches — sem isso, o
      // fix N9 vira só comentário/prosa, exatamente a classe de bug que
      // N3 já ensinou (fan-out em comentário nunca chega no type real).
      if (!seenSymbols.has("StageTransitionMember")) {
        findings.push({
          rule: "G_N9_STAGE_TRANSITION_MEMBER_MISSING",
          detail: "type StageTransitionMember não está declarado — sem ele, EXECUTED/SKIPPED_SHORT_CIRCUIT não existem como discriminated union real (achado N9)",
        });
      } else {
        const memberProps = allPropertyNamesByType.get("StageTransitionMember");
        if (!memberProps || !memberProps.has("memberStatus") || !memberProps.has("shortCircuitDecisionId")) {
          findings.push({
            rule: "G_N9_STAGE_TRANSITION_MEMBER_SHAPE_INVALID",
            detail: "StageTransitionMember não tem memberStatus/shortCircuitDecisionId — a branch SKIPPED_SHORT_CIRCUIT precisa referenciar o seal real, nunca ser um skip solto (achado N9)",
          });
        }
        // PATCH (N9, fechamento com o ChatGPT, 2026-09-19): a primeira
        // versão não carregava identidade do Wi em NENHUMA branch — dois
        // members SKIPPED_SHORT_CIRCUIT do mesmo seal eram
        // indistinguíveis entre si. allPropertyNamesByType agrega
        // propriedades de TODAS as branches num Set só (mesma limitação
        // já documentada acima pra "members"), então só checar
        // memberProps.has("stageWorkUnitIdentityHash") passaria mesmo se
        // o campo existisse em só uma das duas branches. Precisa contar
        // ocorrências dentro do span de texto da própria declaração —
        // union de 2 branches, campo obrigatório nas duas → >= 2
        // ocorrências de "stageWorkUnitIdentityHash: string" ali dentro.
        if (memberProps && memberProps.has("stageWorkUnitIdentityHash")) {
          const declStart = markdown.indexOf("type StageTransitionMember =");
          const declEnd = markdown.indexOf("// hash: STAGE_TRANSITION_MEMBER_V1", declStart);
          const declSpan = declStart !== -1
            ? markdown.slice(declStart, declEnd !== -1 ? declEnd : declStart + 2000)
            : "";
          const idOccurrences = (declSpan.match(/stageWorkUnitIdentityHash\s*:\s*string/g) || []).length;
          if (idOccurrences < 2) {
            findings.push({
              rule: "G_N9_TRANSITION_MEMBER_WORK_UNIT_IDENTITY_MISSING",
              detail: `StageTransitionMember.stageWorkUnitIdentityHash aparece em menos de 2 branches (encontrado: ${idOccurrences}) — sem identidade do Wi em AMBAS EXECUTED e SKIPPED_SHORT_CIRCUIT, dois members não são distinguíveis entre si, quebrando "exact manifest coverage" (achado N9)`,
            });
          }
        } else {
          findings.push({
            rule: "G_N9_TRANSITION_MEMBER_WORK_UNIT_IDENTITY_MISSING",
            detail: "StageTransitionMember não tem stageWorkUnitIdentityHash — sem identidade do Wi, dois members SKIPPED_SHORT_CIRCUIT do mesmo seal são indistinguíveis entre si (achado N9)",
          });
        }
      }

      // PATCH (N9, fechamento com o ChatGPT, 2026-09-19): a regra
      // normativa de serialização claim×seal é prosa (não um shape de
      // type), então a checagem é textual/dirigida — igual ao padrão já
      // usado pros achados R1 nesta mesma família de regras.
      if (
        !markdown.includes("Serialização claim × seal") &&
        !markdown.includes("Serialização claim x seal")
      ) {
        findings.push({
          rule: "G_N9_SHORT_CIRCUIT_CLAIM_SEAL_SERIALIZATION_MISSING",
          detail: "Não encontrei a seção normativa 'Serialização claim × seal' — sem ela, claim de Wi e criação do seal podem correr em paralelo e ambos vencerem pro mesmo Wi, quebrando a cobertura exata do manifest (achado N9)",
        });
      }

      // PATCH (N9, achado real do re-review GPT-6 Astra sobre o ZIP
      // d487eec, 2026-09-19): sem a condição de conjunto vazio, a regra
      // de presença de shortCircuitDecisionRef ("presente sse >=1 member
      // é SKIPPED_SHORT_CIRCUIT") contradiz a regra "se existe qualquer
      // seal pra M, shortCircuitDecisionRef aponta pra ele" no caso de
      // uma work unit única/última disparando START_NEXT_ITERATION sem
      // nenhuma Wi NOT_STARTED sobrando. Checagem textual/dirigida —
      // mesma família das outras checagens N9 acima.
      if (!markdown.includes("nenhum `StageExpansionShortCircuitDecision` é materializado")) {
        findings.push({
          rule: "G_N9_EMPTY_SEAL_NOT_MATERIALIZED_RULE_MISSING",
          detail: "Não encontrei a regra normativa que proíbe materializar StageExpansionShortCircuitDecision quando o conjunto NOT_STARTED está vazio — sem ela, um seal vazio contradiz 'shortCircuitDecisionRef presente sse >=1 member SKIPPED_SHORT_CIRCUIT' (achado real do re-review sobre d487eec)",
        });
      }
      if (!seenSymbols.has("StageExpansionShortCircuitDecision")) {
        findings.push({
          rule: "G_N9_SHORT_CIRCUIT_DECISION_MISSING",
          detail: "type StageExpansionShortCircuitDecision não está declarado — sem ele, SKIPPED_SHORT_CIRCUIT não tem seal atômico correspondente, e work units poderiam ser 'puladas' sem congelamento real do conjunto NOT_STARTED (achado N9)",
        });
      } else {
        const sealProps = allPropertyNamesByType.get("StageExpansionShortCircuitDecision");
        if (!sealProps || !sealProps.has("sealedWorkUnitIdentityHashes") || !sealProps.has("triggeringSource")) {
          findings.push({
            rule: "G_N9_SHORT_CIRCUIT_DECISION_SHAPE_INVALID",
            detail: "StageExpansionShortCircuitDecision não tem sealedWorkUnitIdentityHashes/triggeringSource — o seal precisa congelar o conjunto exato de work units NOT_STARTED e registrar qual source disparou o short-circuit (achado N9)",
          });
        }
      }
    }

    const intentProps = allPropertyNamesByType.get("LogicalJobIntent");
    if (intentProps) {
      for (const required of ["stageExecutionId", "preparedInvocationHash"]) {
        if (!intentProps.has(required)) {
          findings.push({
            rule: "G_N123_LEGACY_LOGICAL_JOB_KEY_TEMPLATE_CONFLICT",
            detail: `LogicalJobIntent não tem '${required}' — sem esse campo logicalJobKey só pode derivar da coordenada da work unit (template pré-N1, Ponto S5), que colide entre StageIteration diferentes (achado N1)`,
          });
        }
      }
    }
  }

  // Ponto S6 (VIDEO_COMPOSITION_V1 — sem stage de VIDEO_ASSEMBLY no
  // V1, ScriptResult exige exatamente 1 beat, nenhuma Skill do
  // caminho audiovisual promete N->1 implicitamente):
  const S6_COMPOSITION_SKILLS = ["08-", "10-", "11-", "12-", "13-", "14-", "17-", "20-"];
  if (S6_COMPOSITION_SKILLS.some((p) => skillDirName.startsWith(p))) {
    if (!markdown.includes("VIDEO_COMPOSITION_V1")) {
      findings.push({
        rule: "G_S6_VIDEO_COMPOSITION_REFERENCE_MISSING",
        detail: "SPEC não referencia VIDEO_COMPOSITION_V1 (ver contracts/VIDEO-COMPOSITION.md, Ponto S6)",
      });
    }
  }
  if (skillDirName.startsWith("08-") && markdown.includes("VIDEO_COMPOSITION_V1")) {
    if (!/beats\.length\s*===\s*1/.test(markdown)) {
      findings.push({
        rule: "G_S6_SCRIPT_RESULT_BEAT_CARDINALITY_MISSING",
        detail: "SPEC não formaliza beats.length === 1 pra ScriptResult elegível ao pipeline V1 (Ponto S6)",
      });
    }
  }
  if (skillDirName.startsWith("14-") && markdown.includes("VIDEO_COMPOSITION_V1")) {
    if (!/MUST NOT be performed by Finalization|unsupported.*V1|fora de.*VIDEO_COMPOSITION_V1/i.test(markdown)) {
      findings.push({
        rule: "G_S6_FINALIZATION_MISSING_CONCAT_PROHIBITION",
        detail: "SPEC referencia VIDEO_COMPOSITION_V1 mas não tem a proibição explícita de concatenação multi-source (Ponto S6)",
      });
    }
  }

  // Ponto S7 (EXECUTION_RUNTIME_V1 — Vercel é exclusivamente
  // CONTROL_PLANE, todo SkillJobHandler executa em
  // VIDEO_MACHINE_WORKER_V1/DURABLE_WORKER):
  const S7_RUNTIME_SKILLS = ["01-", "02-", "11-", "12-", "14-", "16-", "17-"];
  if (S7_RUNTIME_SKILLS.some((p) => skillDirName.startsWith(p))) {
    if (!markdown.includes("EXECUTION_RUNTIME_V1")) {
      findings.push({
        rule: "G_S7_EXECUTION_RUNTIME_REFERENCE_MISSING",
        detail: "SPEC não referencia EXECUTION_RUNTIME_V1 (ver contracts/EXECUTION-RUNTIME.md, Ponto S7)",
      });
    }
  }
  if (skillDirName.startsWith("02-") && markdown.includes("EXECUTION_RUNTIME_V1")) {
    if (!markdown.includes("DURABLE_WORKER") || !markdown.includes("VIDEO_MACHINE_WORKER_V1")) {
      findings.push({
        rule: "G_S7_SKILL02_WORKER_OWNERSHIP_MISSING",
        detail: "Skill02 referencia EXECUTION_RUNTIME_V1 mas não afirma DURABLE_WORKER/VIDEO_MACHINE_WORKER_V1 como dono da execução (Ponto S7)",
      });
    }
  }

  // R1 — checkpoint SUBMITTING fenced (kernel repair pós re-review GPT-6
  // Astra, 2026-09-19). Achado real: a máquina de estado do efeito
  // externo persistia SUBMITTING sem exigir leaseFence/expectedVersion,
  // ao contrário de reportExecution — um worker zumbi (fence velho)
  // podia em tese commitar o checkpoint e disparar o side effect.
  if (skillDirName.startsWith("02-")) {
    // PATCH (R1 revisado pra ExternalEffectCheckpoint por occurrence,
    // kernel repair pós re-review GPT-6 Astra, 2026-09-19): a assinatura
    // canônica ganhou um parâmetro novo (externalEffectOccurrenceKey,
    // antes de providerRequestKey) quando o checkpoint deixou de ser
    // por Attempt e passou a ser por (jobId, externalEffectOccurrenceKey).
    const hasFencedOperation = markdown.includes(
      "beginExternalSubmission(jobId, leaseFence, expectedVersion, attemptNumber, externalEffectOccurrenceKey, providerRequestKey?)"
    );
    if (!hasFencedOperation) {
      findings.push({
        rule: "G_R1_FENCED_EXTERNAL_SUBMISSION_OPERATION_MISSING",
        detail: "Não encontrei a assinatura canônica beginExternalSubmission(jobId, leaseFence, expectedVersion, attemptNumber, externalEffectOccurrenceKey, providerRequestKey?) — checkpoint SUBMITTING precisa de uma operação fenced única por occurrence, nos mesmos moldes de reportExecution (achado R1, revisado)",
      });
    }
    // Checagem dirigida (texto, não AST — a operação é comentário de
    // assinatura de função, não um type real): toda ocorrência do
    // padrão "persiste ... state = SUBMITTING" ligado ao
    // ExternalEffectCheckpoint precisa ter beginExternalSubmission
    // mencionado nas proximidades (mesmo bloco normativo) — senão é o
    // write solto, desprotegido, que o R1 proibiu.
    const unguardedPattern = /persiste\s+(?:o\s+)?ExternalEffectCheckpoint\.state\s*=\s*SUBMITTING|persiste\s+state\s*=\s*SUBMITTING/g;
    let m;
    while ((m = unguardedPattern.exec(markdown))) {
      const windowText = markdown.slice(Math.max(0, m.index - 300), m.index + 300);
      if (!windowText.includes("beginExternalSubmission")) {
        findings.push({
          rule: "G_R1_UNGUARDED_SUBMITTING_TRANSITION",
          detail: `'ExternalEffectCheckpoint.state = SUBMITTING' encontrado sem beginExternalSubmission nas proximidades (índice ~${m.index}) — write solto de SUBMITTING sem fencing é exatamente o buraco do R1`,
        });
      }
    }

    // PATCH (R1 revisado, achado real do re-review GPT-6 Astra sobre o
    // ZIP d487eec, 2026-09-19): a migração de JobAttempt.externalEffectState
    // pra ExternalEffectCheckpoint.state (R1 revisado) ficou incompleta —
    // a transação atômica de entrada em BLOCKED (seção "Transação atômica
    // de entrada em BLOCKED") continuava escrevendo o campo já removido
    // de JobAttempt. Não é um bug de shape checável por AST (o campo não
    // existe mais no type, mas a PROSA normativa ainda citava o nome
    // antigo) — precisa ser textual, banindo a string por completo depois
    // que R1 revisado a removeu do JobAttempt.
    if (markdown.includes("JobAttempt.externalEffectState")) {
      findings.push({
        rule: "G_R1_STALE_JOB_ATTEMPT_EXTERNAL_EFFECT_STATE_REFERENCE",
        detail: "Encontrei 'JobAttempt.externalEffectState' no SPEC — esse campo foi removido de JobAttempt pelo R1 revisado (migrou pra ExternalEffectCheckpoint.state); qualquer transação normativa que ainda o cite não foi migrada (achado real do re-review sobre d487eec)",
      });
    }

    // PATCH (R1, fechamento do BLOCKER apontado pelo re-review GPT-6
    // Astra sobre o ZIP d487eec, 2026-09-19, desenhado com o ChatGPT):
    // beginExternalSubmission só cobria a ENTRADA em SUBMITTING — não
    // existia nenhuma operação pra registrar/reconciliar o RESULTADO
    // (CONFIRMED/NOT_APPLIED/UNKNOWN) de uma occurrence específica.
    // reportExternalEffectObservation fecha essa porta de saída. 4
    // regras textuais/dirigidas, mesma família das outras checagens R1.
    if (skillDirName.startsWith("02-")) {
      // Duas checagens independentes (não uma subconjunto textual da
      // outra — uma checagem cuja condição de FAIL nunca é alcançável
      // quando a outra passa é código morto, e não prova nada em
      // fault-injection real): (1) a operação existe (call syntax, sem
      // exigir a assinatura completa literal); (2) SEPARADAMENTE, ela
      // aceita o seletor de occurrence — não um jobId/attemptNumber
      // sozinho, que reabriria a ambiguidade que o R1 revisado já
      // fechou: qual checkpoint, entre vários da mesma Attempt, está
      // sendo atualizado.
      const observationCallIdx = markdown.indexOf("reportExternalEffectObservation(");
      if (observationCallIdx === -1) {
        findings.push({
          rule: "G_R1_EXTERNAL_EFFECT_OBSERVATION_OPERATION_MISSING",
          detail: "Não encontrei reportExternalEffectObservation(...) — sem ela, um SUBMITTING/UNKNOWN não tem porta de saída fechada pra CONFIRMED/NOT_APPLIED/UNKNOWN por occurrence (achado BLOCKER real do re-review sobre d487eec)",
        });
      } else {
        const signatureWindow = markdown.slice(observationCallIdx, observationCallIdx + 300);
        if (!signatureWindow.includes("externalEffectOccurrenceKey")) {
          findings.push({
            rule: "G_R1_EXTERNAL_EFFECT_OBSERVATION_OCCURRENCE_SELECTOR_MISSING",
            detail: "reportExternalEffectObservation não tem externalEffectOccurrenceKey como parâmetro explícito (nos 300 caracteres após a chamada) — sem seletor de occurrence, a operação não sabe qual ExternalEffectCheckpoint específico atualizar entre vários da mesma Attempt (achado BLOCKER real do re-review sobre d487eec)",
          });
        }
      }
      if (
        !markdown.includes("NUNCA escrevem ExternalEffectCheckpoint.state") &&
        !markdown.includes("nunca escrevem ExternalEffectCheckpoint.state") &&
        !markdown.includes("nunca escrevem `ExternalEffectCheckpoint.state`")
      ) {
        findings.push({
          rule: "G_R1_JOB_SETTLEMENT_EXTERNAL_EFFECT_WRITE_BANNED",
          detail: "Não encontrei a proibição explícita de JobExecutionResult/JobExecutionSettlement escreverem ExternalEffectCheckpoint.state — sem ela, poderia surgir uma segunda state machine divergente pro mesmo checkpoint (achado real do re-review sobre d487eec)",
        });
      }
      if (
        !markdown.includes("CONFIRMED é terminal, nunca reaberto") ||
        !markdown.includes("NOT_APPLIED é terminal, nunca")
      ) {
        findings.push({
          rule: "G_R1_EXTERNAL_EFFECT_TERMINAL_REOPEN_BANNED",
          detail: "Não encontrei a proibição explícita de reabrir CONFIRMED/NOT_APPLIED via reportExternalEffectObservation — sem ela, um checkpoint terminal poderia ser mutado de volta pra SUBMITTING/UNKNOWN (achado real do re-review sobre d487eec)",
        });
      }
    }

    // R2 — Job precisa ser união discriminada real por executionScope
    // (achado real: Ponto C prometia "adiciona executionScope/
    // executionScopeRef ao Job" só em prosa, nunca aplicado ao type real
    // — mesmo padrão de bug do N3).
    // PATCH (N12, re-review GPT-6 Astra, 2026-09-19): as checagens abaixo
    // usavam `if (jobProps && ...)` — se o type Job inteiro fosse
    // removido do SPEC, jobProps vira undefined e TODAS as regras
    // seguintes (G_R2_JOB_EXECUTION_SCOPE_MISSING,
    // G_R2_JOB_SCOPE_UNION_MISSING, G_R2_STANDALONE_RUN_COORDINATES_NOT_FORBIDDEN)
    // silenciosamente não disparavam — falso PASS confirmado por
    // reprodução real (remover só "type Job = ..." preservando o resto
    // do SPEC → PASS, 0 erros). G000 não cobre isso (só falha quando o
    // arquivo INTEIRO extrai zero declarações, não quando falta um
    // owner específico). Guarda de presença explícita, antes de validar
    // shape/campos.
    const jobProps = allPropertyNamesByType.get("Job");
    if (!seenSymbols.has("Job")) {
      findings.push({
        rule: "G_R2_JOB_TYPE_MISSING",
        detail: "type Job não está declarado no SPEC da Skill02 — sem o owner, nenhuma das regras de shape (executionScope/union/never) pode ser verificada (achado N12)",
      });
    } else if (!jobProps || !jobProps.has("executionScope") || !jobProps.has("executionScopeRef")) {
      findings.push({
        rule: "G_R2_JOB_EXECUTION_SCOPE_MISSING",
        detail: "Job não tem executionScope/executionScopeRef — sem isso não existe autoridade real pra distinguir RUN_SCOPED de STANDALONE (achado R2)",
      });
    }
    // Escopar a busca textual à declaração real do Job, não ao arquivo
    // inteiro — 'RUN_SCOPED'/'STANDALONE' também aparecem em
    // JobExecutionScopeRef (outro type), então markdown.includes(...)
    // sem escopo daria falso PASS mesmo com a branch do Job removida.
    const jobDeclIdx = markdown.indexOf("type Job =");
    const jobDeclText = jobDeclIdx >= 0 ? markdown.slice(jobDeclIdx, jobDeclIdx + 3500) : "";
    if (jobProps && !jobDeclText.includes("executionScope: 'RUN_SCOPED'")) {
      findings.push({
        rule: "G_R2_JOB_SCOPE_UNION_MISSING",
        detail: "Não encontrei a branch literal executionScope: 'RUN_SCOPED' na declaração do Job — precisa ser discriminated union real, não campos opcionais soltos (achado R2)",
      });
    }
    if (jobProps && !jobDeclText.includes("executionScope: 'STANDALONE'")) {
      findings.push({
        rule: "G_R2_JOB_SCOPE_UNION_MISSING",
        detail: "Não encontrei a branch literal executionScope: 'STANDALONE' na declaração do Job — precisa ser discriminated union real, não campos opcionais soltos (achado R2)",
      });
    }
    // Checagem dirigida via AST real (typeText por ocorrência, não só
    // nome de propriedade — ver nota da coleta acima): pra cada campo
    // RUN_SCOPED-only, a branch STANDALONE precisa proibi-lo via
    // `?: never` de verdade, não apenas deixá-lo ausente/opcional.
    for (const fieldName of ["runId", "stageKey", "subjectType", "subjectId", "stageWorkUnitIdentityHash"]) {
      const typeTexts = jobPropertyTypeTextsByName.get(fieldName);
      if (!typeTexts) continue; // Job nem existe neste SPEC — outro check cobre isso
      if (!typeTexts.has("never")) {
        findings.push({
          rule: "G_R2_STANDALONE_RUN_COORDINATES_NOT_FORBIDDEN",
          detail: `Job.${fieldName} não tem uma ocorrência com typeText 'never' — a branch STANDALONE precisa PROIBIR este campo (?: never), não deixá-lo opcional ou ausente (achado R2)`,
        });
      }
    }
  }

  // R2 — inputs de background/scheduler/webhook não devem carregar runId
  // obrigatório como plumbing legado de RUN_SCOPED. Checagem dirigida
  // (não regex genérico corpus-wide) nos 4 owners exatos que a
  // re-review apontou.
  const R2_BACKGROUND_RUNID_TARGETS = {
    "16-": ["ResponseIntent", "OutboundSendCheckpoint"],
    "18-": ["MetricCollectionInputBase"],
    "19-": ["PerformanceAnalysisInputBase"],
  };
  for (const [prefix, typeNames] of Object.entries(R2_BACKGROUND_RUNID_TARGETS)) {
    if (!skillDirName.startsWith(prefix)) continue;
    for (const typeName of typeNames) {
      const props = allPropertyNamesByType.get(typeName);
      if (props && props.has("runId")) {
        findings.push({
          rule: "G_R2_BACKGROUND_RUN_ID_REQUIRED_BANNED",
          detail: `${typeName}.runId ainda existe — este owner é background/scheduler/webhook (STANDALONE, Ponto C), execution scope é infraestrutura do Job, não campo duplicado no domain input (achado R2)`,
        });
      }
    }
  }
  if (skillDirName.startsWith("11-") && markdown.includes("EXECUTION_RUNTIME_V1")) {
    if (!/CONTINUE/.test(markdown) || !/libera(o worker| o worker| worker)|release/i.test(markdown)) {
      findings.push({
        rule: "G_S7_SKILL11_CONTINUE_RELEASE_MISSING",
        detail: "SPEC referencia EXECUTION_RUNTIME_V1 mas não formaliza que CONTINUE libera o worker pra outro Job (Ponto S7)",
      });
    }
  }
  if ((skillDirName.startsWith("12-") || skillDirName.startsWith("14-")) && markdown.includes("EXECUTION_RUNTIME_V1")) {
    if (!markdown.includes("DURABLE_WORKER")) {
      findings.push({
        rule: "G_S7_MEDIA_PROCESSING_MISSING_DURABLE_WORKER",
        detail: "SPEC referencia EXECUTION_RUNTIME_V1 mas não afirma DURABLE_WORKER pra FFmpeg/media processing (Ponto S7)",
      });
    }
  }

  // Ponto M1 (CONTRACT_CONVENTIONS_V1 — stageKey é a única identidade
  // de stage no kernel, PolicyVersion nunca number, sem pseudo-config
  // de literal único):
  const M1_STAGE_IDENTITY_TYPES = ["StageDefinition", "LogicalJobIntent", "Job"];
  if (skillDirName.startsWith("01-") || skillDirName.startsWith("02-")) {
    for (const typeName of M1_STAGE_IDENTITY_TYPES) {
      const props = allPropertyNamesByType.get(typeName);
      if (props && props.has("stage")) {
        findings.push({
          rule: "G_M1_BANNED_STAGE_ALIAS",
          detail: `${typeName}.stage proibido — use stageKey: StageKey (Ponto M1)`,
        });
      }
    }
  }
  if (skillDirName.startsWith("09-")) {
    // framePolicySnapshot é um object literal inline, não um type nomeado —
    // varre textualmente por "policyVersion: number" no arquivo.
    if (/policyVersion:\s*number\b/.test(markdown)) {
      findings.push({
        rule: "G_M1_POLICY_VERSION_WRONG_TYPE",
        detail: "policyVersion tipado como number — use PolicyVersion (string opaca) (Ponto M1)",
      });
    }
  }
  if (skillDirName.startsWith("03-")) {
    const policyProps = allPropertyNamesByType.get("ApprovalPolicy");
    if (policyProps && policyProps.has("onInsufficientEvidence")) {
      findings.push({
        rule: "G_M1_PSEUDO_CONFIG_SINGLE_LITERAL",
        detail: "ApprovalPolicy.onInsufficientEvidence não pode existir como property — comportamento é invariante V1 normativo (Ponto M1)",
      });
    }
  }

  // Ponto M2 (OPTIONAL_REFERENCE_RULE_V1 — refs opcionais defensivas
  // sem efeito real na ausência, removidas de Skills 05/06/07):
  const M2_BANNED_REDUNDANT_REF = [
    { skillPrefix: "05-", typeName: "OfferAnalysisInput", propName: "candidateRefs" },
    { skillPrefix: "06-", typeName: "TrendResearchInput", propName: "candidateRefs" },
    { skillPrefix: "07-", typeName: "CreativeDirectionInput", propName: "subjectRef" },
  ];
  for (const { skillPrefix, typeName, propName } of M2_BANNED_REDUNDANT_REF) {
    if (!skillDirName.startsWith(skillPrefix)) continue;
    const props = allPropertyNamesByType.get(typeName);
    if (props && props.has(propName)) {
      findings.push({
        rule: "G_M2_BANNED_REDUNDANT_DEFENSIVE_REF",
        detail: `${typeName}.${propName} proibido — era REDUNDANT_DEFENSIVE_REFERENCE removida no Ponto M2 (contracts/CONTRACT-CONVENTIONS.md)`,
      });
    }
  }

  // Ponto M3 (poolSnapshotHash aposentado — sem consumer real, nunca
  // foi optimistic lock; ban corpus-wide, qualquer type/qualquer Skill):
  for (const [typeName, props] of allPropertyNamesByType.entries()) {
    if (props.has("poolSnapshotHash")) {
      findings.push({
        rule: "G_M3_POOL_SNAPSHOT_HASH_BANNED",
        detail: `${typeName}.poolSnapshotHash proibido — campo aposentado no Ponto M3, sem consumer real (contracts/CONTRACT-CONVENTIONS.md)`,
      });
    }
  }

  // Ponto M5 (VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1 — Skills 06/20/21
  // deferidas pra V2, Skill25 nunca vira V2 inteira):
  const M5_DEFERRED_SKILLS = ["06-", "20-", "21-"];
  if (M5_DEFERRED_SKILLS.some((p) => skillDirName.startsWith(p))) {
    if (!markdown.includes("DEFERRED_V2_CONTRACT")) {
      findings.push({
        rule: "G_M5_DEFERRED_MARKER_MISSING",
        detail: "SPEC não contém o marker DEFERRED_V2_CONTRACT (Ponto M5, IMPLEMENTATION-SCOPE.md)",
      });
    }
  }
  if (skillDirName.startsWith("25-")) {
    if (!markdown.includes("V1_REQUIRED")) {
      findings.push({
        rule: "G_M5_SKILL25_MUST_STAY_V1_REQUIRED",
        detail: "Skill25 precisa conter o marker V1_REQUIRED — segurança nunca vira DEFERRED_V2_CONTRACT inteira (Ponto M5)",
      });
    }
  }

  // Ponto M7 (Trusted Run Identity Allocation — RunControlCommand.runId
  // precisa ser opcional, nunca obrigatório, pra START nunca aceitar
  // runId escolhido pelo caller):
  if (skillDirName.startsWith("01-")) {
    const runControlDetails = allPropertyDetailsByType.get("RunControlCommand");
    if (runControlDetails) {
      const runIdDetail = runControlDetails.get("runId");
      if (runIdDetail && runIdDetail.optional !== true) {
        findings.push({
          rule: "G_M7_RUN_CONTROL_COMMAND_RUN_ID_MUST_BE_OPTIONAL",
          detail: "RunControlCommand.runId precisa ser opcional (runId?) — START nunca aceita runId do caller (Ponto M7)",
        });
      }
    }
    const startReqProps = allPropertyNamesByType.get("ProductionRunStartRequest");
    if (startReqProps && startReqProps.has("runId")) {
      findings.push({
        rule: "G_M7_START_REQUEST_RUN_ID_BANNED",
        detail: "ProductionRunStartRequest não pode ter runId — identidade ainda não existe nesse momento (Ponto M7)",
      });
    }
  }

  // R3 — kernel precisa saber QUAL gate concreto, não só "há aprovação?"
  // (achado real: StageDefinition.requiresApproval?: boolean não carrega
  // informação suficiente pra construir um ApprovalRequestIntent válido;
  // OrchestrationDecision não tinha nem como emitir REQUEST_APPROVAL).
  if (skillDirName.startsWith("01-")) {
    // Ignora ocorrências dentro de comentário `//` (nossos próprios PATCH
    // notes citam o nome/shape antigo como explicação histórica) — só
    // interessa se a linha declara o campo de verdade.
    const hasLiveRequiresApproval = markdown.split("\n").some((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
      return /requiresApproval\??:\s*boolean/.test(line.split("//")[0]);
    });
    if (hasLiveRequiresApproval) {
      findings.push({
        rule: "G_R3_LEGACY_REQUIRES_APPROVAL_BANNED",
        detail: "requiresApproval?: boolean ainda existe como campo real — banido, não deprecated (achado R3); boolean + gate em paralelo são duas fontes de verdade",
      });
    }
    const stageDefProps = allPropertyNamesByType.get("StageDefinition");
    if (stageDefProps && !stageDefProps.has("approvalRequirement")) {
      findings.push({
        rule: "G_R3_STAGE_APPROVAL_REQUIREMENT_MISSING",
        detail: "StageDefinition não tem approvalRequirement — sem isso o kernel não sabe qual ApprovalGateKey concreto aplica a este stage (achado R3)",
      });
    }
    // Checagem dirigida na declaração real de OrchestrationDecision — não
    // procurar 'REQUEST_APPROVAL' no arquivo inteiro (mesma lição do R2:
    // o texto podia aparecer solto em prosa/comentário sem o type real
    // ter a branch).
    const odDeclIdx = markdown.indexOf("type OrchestrationDecision =");
    const odDeclText = odDeclIdx >= 0 ? markdown.slice(odDeclIdx, odDeclIdx + 700) : "";
    if (!odDeclText.includes('type: "REQUEST_APPROVAL"')) {
      findings.push({
        rule: "G_R3_REQUEST_APPROVAL_DECISION_MISSING",
        detail: "OrchestrationDecision não tem a branch real { type: \"REQUEST_APPROVAL\"; intent: ApprovalRequestIntent } — kernel não consegue emitir pedido de aprovação (achado R3)",
      });
    }
  }

  // R3 — ApprovalRequestIntent.approvalGateKey precisa usar o enum real,
  // não string solta (mesmo arquivo já possui ApprovalGateKey closed V1).
  if (skillDirName.startsWith("03-")) {
    const intentDeclIdx = markdown.indexOf("type ApprovalRequestIntent =");
    const intentDeclText = intentDeclIdx >= 0 ? markdown.slice(intentDeclIdx, intentDeclIdx + 1200) : "";
    if (intentDeclIdx >= 0 && !intentDeclText.includes("approvalGateKey: ApprovalGateKey")) {
      findings.push({
        rule: "G_R3_APPROVAL_GATE_KEY_MUST_USE_ENUM",
        detail: "ApprovalRequestIntent.approvalGateKey não está tipado como ApprovalGateKey (achado R3)",
      });
    }
  }

  // N8 — subjectVersion nunca teve produtor canônico em nenhum gate;
  // removido do contrato de aprovação em favor de ExactApprovalSubject
  // (subjectType + subjectId + artifactHash). Checagem dirigida: inspeciona
  // as declarações normativas reais (via AST, propertyNames), não
  // comentários históricos que citam o nome do campo antigo como explicação.
  if (skillDirName.startsWith("03-")) {
    for (const typeName of ["ApprovalRequestIntent", "ApprovalRequest", "ApprovalDecision", "ApprovalResolvedEvent"]) {
      const props = allPropertyNamesByType.get(typeName);
      if (!props) continue;
      if (props.has("subjectVersion")) {
        findings.push({
          rule: "G_N8_APPROVAL_SUBJECT_VERSION_BANNED",
          detail: `${typeName}.subjectVersion ainda existe como campo real — removido no achado N8, nunca teve produtor canônico em nenhum gate (VIDEO_COMPLIANCE nem FIRST_REAL_PUBLISH)`,
        });
      }
      if (!props.has("subjectType") || !props.has("subjectId") || !props.has("artifactHash")) {
        findings.push({
          rule: "G_N8_APPROVAL_EXACT_SUBJECT_HASH_REQUIRED",
          detail: `${typeName} não tem subjectType+subjectId+artifactHash completos — remover subjectVersion não pode degradar a identidade pra menos que ExactApprovalSubject (achado N8)`,
        });
      }
    }
  }

  // Ponto M8 (identidade determinística de scheduleSlotKey — nunca
  // derivada de arredondamento de now(), sempre da ocorrência nominal
  // do schedule):
  if (skillDirName.startsWith("18-")) {
    if (!/MUST NOT be derived by rounding/i.test(markdown)) {
      findings.push({
        rule: "G_M8_SCHEDULE_SLOT_SEMANTICS_MISSING",
        detail: "SPEC não contém a definição normativa proibindo scheduleSlotKey derivado de arredondamento (Ponto M8)",
      });
    }
    const triggerProps = allPropertyNamesByType.get("MetricCollectionTrigger");
    if (triggerProps && !triggerProps.has("scheduledOccurrenceAt")) {
      findings.push({
        rule: "G_M8_SCHEDULED_OCCURRENCE_FIELD_MISSING",
        detail: "MetricCollectionTrigger não tem scheduledOccurrenceAt (ocorrência nominal, Ponto M8)",
      });
    }
  }

  const RAW_SECRET_FIELD_NAMES = new Set([
    "apiKey", "accessToken", "refreshToken", "password", "cookie",
    "authorizationHeader", "sessionSecret", "bearerToken", "secret",
  ]);
  for (const [typeName, props] of allPropertyNamesByType.entries()) {
    for (const propName of props) {
      if (RAW_SECRET_FIELD_NAMES.has(propName)) {
        findings.push({
          rule: "G_S15_RAW_SECRET_FIELD",
          detail: `${typeName}.${propName} parece campo de segredo bruto — use IntegrationCredentialHandleRef (Skill 24), nunca segredo direto em contrato de domínio`,
        });
      }
    }
  }

  if (skillDirName.startsWith("16-")) {
    const guardProps = allPropertyNamesByType.get("ResponseGuard");
    if (guardProps && !guardProps.has("suppressionPolicy")) {
      findings.push({
        rule: "G_S16_RESPONSE_GUARD_MISSING_SUPPRESSION_POLICY",
        detail: "ResponseGuard não tem suppressionPolicy — política de supressão precisa ser explícita, nunca inferida da ausência de campo (Ponto S16)",
      });
    }
    const SUPPRESSION_WINDOW_ALLOWLIST = new Set(["ResponseSuppressionPolicy"]);
    for (const [typeName, props] of allPropertyNamesByType.entries()) {
      if (props.has("suppressionWindowMs") && !SUPPRESSION_WINDOW_ALLOWLIST.has(typeName)) {
        findings.push({
          rule: "G_S16_LOOSE_SUPPRESSION_WINDOW_MS",
          detail: `${typeName}.suppressionWindowMs solto fora de ResponseSuppressionPolicy — reintroduz a ambiguidade que o S16 corrigiu`,
        });
      }
    }
  }

  // Ponto S1 (Resource-scoped Authorization + Provider Account Ingress
  // Resolution), via AST real:
  if (skillDirName.startsWith("22-")) {
    for (const typeName of ["TenantAuthorizationRequirement", "TenantAuthorizationDecision"]) {
      const props = allPropertyNamesByType.get(typeName);
      if (props && !props.has("authorizationScope")) {
        findings.push({
          rule: "G_S1_AUTHORIZATION_SCOPE_MISSING",
          detail: `${typeName} não tem authorizationScope — "autorizado a decidir no tenant" != "autorizado a decidir ESTE artefato exato" (Ponto S1)`,
        });
      }
    }
  }

  if (skillDirName.startsWith("24-")) {
    const ingressReqProps = allPropertyNamesByType.get("ProviderAccountIngressResolutionRequest");
    if (ingressReqProps) {
      for (const forbidden of ["tenantId", "trustedTenantContextHash"]) {
        if (ingressReqProps.has(forbidden)) {
          findings.push({
            rule: "G_S1_INGRESS_REQUEST_HAS_TENANT_FIELD",
            detail: `ProviderAccountIngressResolutionRequest.${forbidden} não deveria existir — este request é emitido ANTES de existir qualquer tenant confiável (Ponto S1)`,
          });
        }
      }
    }
    const ingressResProps = allPropertyNamesByType.get("ProviderAccountIngressResolution");
    if (ingressResProps) {
      for (const required of ["tenantId", "integrationBindingRef", "providerKey", "providerAccountIdentityHash"]) {
        if (!ingressResProps.has(required)) {
          findings.push({
            rule: "G_S1_INGRESS_RESOLUTION_MISSING_FIELD",
            detail: `ProviderAccountIngressResolution não tem '${required}' (Ponto S1)`,
          });
        }
      }
    }
    const bindingReqDetails = allPropertyDetailsByType.get("IntegrationBindingResolutionRequest");
    const trustedHashDetail = bindingReqDetails && bindingReqDetails.get("trustedTenantContextHash");
    if (trustedHashDetail && trustedHashDetail.optional) {
      findings.push({
        rule: "G_S1_TRUSTED_TENANT_CONTEXT_HASH_WEAKENED",
        detail: "IntegrationBindingResolutionRequest.trustedTenantContextHash virou opcional — nunca pode ser enfraquecido, nem pelo bootstrap do Ponto S1 (que é um mecanismo separado, não um substituto)",
      });
    }
  }

  // N5 — PublicationIntent nunca foi declarado em nenhuma Skill; achado
  // real era Skill01/03/17 tratando esse nome como se fosse um artifact
  // canônico. PublicationPlan (Skill17) é o owner real. Checagem
  // corpus-wide (roda em todo SPEC.md, não só num skillDirName): nenhum
  // type real pode se chamar PublicationIntent — DeletePublicationIntent
  // (conceito futuro, diferente, de delete-request) não conta.
  if (seenSymbols.has("PublicationIntent")) {
    findings.push({
      rule: "G_N5_UNDECLARED_PUBLICATION_INTENT_BANNED",
      detail: "type PublicationIntent declarado — esse artifact nunca deveria existir; PublicationPlan (Skill17) é o owner real do subject FIRST_REAL_PUBLISH (achado N5)",
    });
  }
  if (skillDirName.startsWith("03-")) {
    const gateTableIdx = markdown.indexOf("Gates V1 e subject exato por gate");
    const gateTableText = gateTableIdx >= 0 ? markdown.slice(gateTableIdx, gateTableIdx + 1500) : "";
    if (gateTableIdx >= 0 && !gateTableText.includes("`FIRST_REAL_PUBLISH` | `PublicationPlan`")) {
      findings.push({
        rule: "G_N5_FIRST_REAL_PUBLISH_SUBJECT_MUST_BE_PUBLICATION_PLAN",
        detail: "Tabela normativa gate→subjectType não diz que FIRST_REAL_PUBLISH exige PublicationPlan (achado N5)",
      });
    }
  }

  // PATCH (achado N7 da re-review GPT-6 Astra, 2026-09-19): guarda de
  // defesa em profundidade. Toda extração vazia num arquivo que
  // deveria ter conteúdo real é, por definição, uma falha da
  // ferramenta, não um SPEC genuinamente sem tipos — os 25 SPEC.md
  // reais sempre têm pelo menos um `type`/`interface`. Isso pega
  // qualquer futura classe de bug de extração silenciosa (encoding,
  // BOM, fence malformado), não só o CRLF já corrigido acima.
  if (totalDecls === 0) {
    findings.push({
      rule: "G000_ZERO_DECLARATIONS_EXTRACTED",
      detail: "0 declarações TS extraídas deste SPEC.md — isso é sinal de falha na extração (encoding/fence/parser), nunca um SPEC real vazio. Não confiar em PASS quando isso ocorre.",
    });
  }

  return { skillDirName, specPath, findings, warnings, declCount: totalDecls, fatalCount: fatalCodes.length };
}

function main() {
  const dirs = findSkillDirs();
  const results = [];
  let errorCount = 0;

  const foundIds = new Set();
  for (const dir of dirs) {
    const idMatch = dir.match(/^(\d{2})-/);
    if (idMatch) foundIds.add(idMatch[1]);
  }
  const globalFindings = [];
  for (const expected of EXPECTED_SKILL_IDS) {
    if (!foundIds.has(expected)) {
      globalFindings.push({ rule: "G016_SKILL_SPEC_MISSING", detail: `Skill ${expected} ausente` });
    }
  }
  for (const found of foundIds) {
    if (!EXPECTED_SKILL_IDS.includes(found)) {
      globalFindings.push({ rule: "G017_UNEXPECTED_SKILL_SPEC", detail: `Skill ${found} inesperada (corpus V1 é 25)` });
    }
  }

  // Ponto M5 (VIDEO_MACHINE_IMPLEMENTATION_SCOPE_V1 — IMPLEMENTATION-SCOPE.md
  // precisa existir e referenciar as 3 Skills deferidas):
  const scopeDocPath = join(SKILLS_DIR, "..", "IMPLEMENTATION-SCOPE.md");
  if (!existsSync(scopeDocPath)) {
    globalFindings.push({ rule: "G_M5_IMPLEMENTATION_SCOPE_DOC_MISSING", detail: "src/modules/video-machine/IMPLEMENTATION-SCOPE.md não existe (Ponto M5)" });
  } else {
    const scopeDoc = readFileSync(scopeDocPath, "utf-8");
    for (const skillRef of ["Skill06", "Skill20", "Skill21"]) {
      if (!scopeDoc.includes(skillRef)) {
        globalFindings.push({ rule: "G_M5_IMPLEMENTATION_SCOPE_DOC_MISSING_SKILL_REF", detail: `IMPLEMENTATION-SCOPE.md não referencia ${skillRef} (Ponto M5)` });
      }
    }
  }
  errorCount += globalFindings.length;

  for (const dir of dirs) {
    if (!/^\d{2}-/.test(dir)) continue;
    const result = lintSkillSpec(dir);
    results.push(result);
    errorCount += result.findings.length;
  }

  console.log("=== Contract Lint V1 — Ponto G ===\n");
  if (globalFindings.length > 0) {
    console.log("Corpus:");
    for (const f of globalFindings) console.log(`  [${f.rule}] ${f.detail}`);
    console.log("");
  } else {
    console.log(`Corpus: ${EXPECTED_SKILL_IDS.length}/25 SPEC.md presentes, nenhuma inesperada. OK\n`);
  }

  let warningCount = 0;
  for (const r of results) {
    const status = r.findings.length === 0 ? "OK" : `${r.findings.length} finding(s)`;
    const warnCount = r.warnings?.length ?? 0;
    warningCount += warnCount;
    console.log(`${r.skillDirName}: ${r.declCount} declarações TS, ${r.fatalCount ?? 0} FATAL_ERROR — ${status}${warnCount ? `, ${warnCount} warning(s)` : ""}`);
    for (const f of r.findings) {
      console.log(`    [${f.rule}] ${f.detail}`);
    }
  }

  console.log(`\nerrorCount=${errorCount}`);
  console.log(`warningCount=${warningCount}`);
  console.log(errorCount === 0 ? "PASS" : "FAIL");
  process.exit(errorCount === 0 ? 0 : 1);
}

main();
