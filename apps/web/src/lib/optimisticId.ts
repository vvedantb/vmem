import type { Id, TableNames } from "@vmem/backend";

export function optimisticId<TableName extends TableNames>(
  tableName: TableName,
  id = crypto.randomUUID(),
): Id<TableName> {
  return Object.assign(id, { __tableName: tableName });
}
