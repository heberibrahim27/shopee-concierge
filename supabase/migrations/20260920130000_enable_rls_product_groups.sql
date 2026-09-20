-- Correção de segurança real (SEC-025-PRODUCT-GROUPS-ANON-RLS, ver
-- CONTINUIDADE.md "Security findings rastreados" e
-- src/modules/video-machine/skills/25-seguranca-auditoria/SPEC.md).
--
-- public.product_groups estava com RLS desativado — qualquer um com a
-- chave anon conseguia ler/escrever livremente. Auditoria de código
-- confirmou: zero uso client-side/anon-key em todo o repositório; o
-- único consumo real é server-side via service_role
-- (src/lib/admin/stats.ts, getComparisonStats(), painel /admin). Sem
-- nenhum uso legítimo de leitura pública a preservar, a correção é
-- NOT_PUBLIC — mesmo padrão RLS-sem-policy (service_role-only) já
-- usado em toda outra tabela deste projeto.

alter table public.product_groups enable row level security;
