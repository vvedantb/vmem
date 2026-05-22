import type { ApiErrorBody } from "./types";

export class VMemoryError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues?: ApiErrorBody["issues"];

  constructor(
    message: string,
    status: number,
    code: string,
    issues?: ApiErrorBody["issues"],
  ) {
    super(message);
    this.name = "VMemoryError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export function isVMemoryError(error: unknown): error is VMemoryError {
  return error instanceof VMemoryError;
}
