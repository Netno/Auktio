export function isMissingSupabaseTableError(
  error: { message?: string } | null | undefined,
  tableName: string,
) {
  const normalizedTableName = tableName.trim().toLowerCase();
  const message = error?.message?.toLowerCase() ?? "";

  if (!normalizedTableName || !message) {
    return false;
  }

  return (
    (message.includes(normalizedTableName) ||
      message.includes(`public.${normalizedTableName}`)) &&
    (message.includes("could not find the table") ||
      message.includes("schema cache") ||
      message.includes(`relation \"${normalizedTableName}\" does not exist`))
  );
}
