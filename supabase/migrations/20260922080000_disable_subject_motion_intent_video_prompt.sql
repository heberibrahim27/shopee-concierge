-- Heber: "o flow buga demais" (produto saindo deformado/estranho no vídeo).
-- Causa provável: o prompt pedia câmera se aproximando E o produto tendo
-- "movimentos naturais e discretos" ao mesmo tempo. Pedir movimento próprio
-- pra um objeto estático (fone, gadget) é ambíguo pra IA de vídeo e é
-- gatilho conhecido de deformação. Câmera se movendo ao redor de um produto
-- parado é o padrão confiável de "product shot" — mantido.
update video_machine_video_prompt_policy
set allow_subject_motion_intent = false
where policy_key = 'engine-default' and tenant_id = 'descontos-chegando';
