-- Pedido do Heber (2026-09-22): o prompt de video mandava a IA (Flow)
-- renderizar literalmente o texto da CTA na tela ("Comenta QUERO... e
-- ja segue aqui...") -- gerava muito bug/glitch na geracao manual no
-- Flow. FORBID e um valor ja suportado pela Skill10 (SPEC.md), so
-- precisa mudar a policy ativa -- sem alteracao de codigo.
update video_machine_video_prompt_policy set provider_generated_text_policy = 'FORBID' where policy_key = 'engine-default' and tenant_id = 'descontos-chegando';
