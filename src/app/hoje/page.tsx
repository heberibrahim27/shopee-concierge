import { redirect } from "next/navigation";

// A Home (`/`) virou a própria listagem de "postado no Instagram nas
// últimas 24h" (pedido do Heber, 2026-09-16) — /hoje continua existindo
// só porque é o link fixo que a resposta automática do Instagram manda
// pra quem comenta "QUERO" no Story (não dá pra trocar isso sem mexer
// nesse fluxo separado), mas agora só redireciona pra Home.
export default function HojePage() {
  redirect("/");
}
