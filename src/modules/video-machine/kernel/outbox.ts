import type { SupabaseClient } from "@supabase/supabase-js";

/** OutboxConsumerDelivery — UNIQUE(event_id, consumer_key), replay-safe. */
export async function enqueueOutboxDelivery(
  db: SupabaseClient,
  params: { tenantId: string; eventId: string; consumerKey: string }
): Promise<void> {
  const { tenantId, eventId, consumerKey } = params;
  const { data: existing } = await db
    .from("video_machine_outbox_consumer_delivery")
    .select("delivery_id")
    .eq("event_id", eventId)
    .eq("consumer_key", consumerKey)
    .maybeSingle();
  if (existing) return;

  const { error } = await db.from("video_machine_outbox_consumer_delivery").insert({
    tenant_id: tenantId,
    event_id: eventId,
    consumer_key: consumerKey,
    delivery_state: "PENDING",
  });
  // 23505 = unique_violation: outro caller já inseriu a mesma (event_id, consumer_key) — replay-safe, não é erro.
  if (error && error.code !== "23505") {
    throw new Error(`enqueueOutboxDelivery: insert failed: ${error.message}`);
  }
}

export async function markOutboxDelivered(
  db: SupabaseClient,
  params: { eventId: string; consumerKey: string }
): Promise<void> {
  const { error } = await db
    .from("video_machine_outbox_consumer_delivery")
    .update({ delivery_state: "DELIVERED", delivered_at: new Date().toISOString() })
    .eq("event_id", params.eventId)
    .eq("consumer_key", params.consumerKey);
  if (error) throw new Error(`markOutboxDelivered: update failed: ${error.message}`);
}
