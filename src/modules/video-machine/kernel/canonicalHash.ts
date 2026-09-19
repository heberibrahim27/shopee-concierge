import { createHash } from "crypto";

/**
 * CANONICAL_SERIALIZATION_V1 — src/modules/video-machine/contracts/CANONICAL-SERIALIZATION.md
 * digest = lowercaseHex(SHA256(UTF8(JCS(CanonicalHashEnvelope))))
 */
export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

function canonicalize(value: CanonicalJsonValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("CANONICAL_VALUE_UNSUPPORTED: non-finite number");
    }
    return String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const parts = value.map((v) => {
      if (v === undefined) throw new Error("CANONICAL_VALUE_UNSUPPORTED: undefined array member");
      return canonicalize(v);
    });
    return "[" + parts.join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as { [key: string]: CanonicalJsonValue | undefined };
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => {
      const v = obj[k];
      if (v === undefined) throw new Error(`CANONICAL_VALUE_UNSUPPORTED: undefined field "${k}"`);
      return JSON.stringify(k) + ":" + canonicalize(v);
    });
    return "{" + parts.join(",") + "}";
  }
  throw new Error(`CANONICAL_VALUE_UNSUPPORTED: unsupported type ${typeof value}`);
}

/** digest = lowercaseHex(SHA256(UTF8(JCS({serialization,hashSchema,payload})))) */
export function canonicalHash(hashSchema: string, payload: CanonicalJsonValue): string {
  const envelope: CanonicalJsonValue = {
    serialization: "CANONICAL_SERIALIZATION_V1",
    hashSchema,
    payload,
  };
  const json = canonicalize(envelope);
  return createHash("sha256").update(Buffer.from(json, "utf8")).digest("hex");
}
