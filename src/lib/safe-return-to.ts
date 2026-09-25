const CASE =
  /^\/(peer-mentor|swag)\/cases\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export function safeCaseReturn(value: unknown, role?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = CASE.exec(value);
  if (!match) return undefined;
  if (
    role !== undefined &&
    (match[1] === "peer-mentor" ? role !== "peer_mentor" : role !== "swag_member")
  )
    return undefined;
  return value;
}
