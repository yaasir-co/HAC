/** Empty optional controls represent missing information, not a claimed identifier. */
export function cleanObservationInput(input: Record<string, unknown>) {
  const result = { ...input };
  for (const [key, value] of Object.entries(result)) {
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) delete result[key];
    else if (typeof value === "string") result[key] = value.trim();
  }
  if (result.quantity !== undefined) result.quantity = Number(result.quantity);
  return result;
}
