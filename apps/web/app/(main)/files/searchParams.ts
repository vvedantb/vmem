import { parseAsString, parseAsStringLiteral } from "nuqs";

const fileViews = ["grid", "list"] as const;
const fileSortFields = ["name", "size", "date"] as const;
const sortDirections = ["asc", "desc"] as const;

const filesSearchParams = {
  view: parseAsStringLiteral(fileViews).withDefault("grid"),
  sort: parseAsStringLiteral(fileSortFields).withDefault("name"),
  sortDir: parseAsStringLiteral(sortDirections).withDefault("asc"),
  folderId: parseAsString,
};

export type FileView = (typeof fileViews)[number];
export type FileSortField = (typeof fileSortFields)[number];
export type SortDirection = (typeof sortDirections)[number];

export { filesSearchParams };
