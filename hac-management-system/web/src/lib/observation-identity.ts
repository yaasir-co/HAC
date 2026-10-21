import { createHash } from "node:crypto";
const clean = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export function observationIdentity(productId: string): string;
export function observationIdentity(
  productId: null,
  name: string,
  kind: string,
  brand: string,
): string;
export function observationIdentity(
  productId: string | null,
  name = "",
  kind = "",
  brand = "",
) {
  return createHash("sha256")
    .update(
      productId
        ? `product:${productId}`
        : `unlisted:${JSON.stringify([clean(name), clean(brand)])}`,
    )
    .digest("hex");
}
