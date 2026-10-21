import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Expose actionable validation failures; never expose database or filesystem details. */
export function handleError(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Please check the submitted fields.",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    );
  }
  if (error instanceof SyntaxError) {
    return Response.json(
      {
        error: {
          code: "INVALID_JSON",
          message: "The request body must be valid JSON.",
        },
      },
      { status: 400 },
    );
  }
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : undefined;
  if (code === "P2002")
    return Response.json(
      {
        error: {
          code: "DUPLICATE_RECORD",
          message: "A record with these identifiers already exists.",
        },
      },
      { status: 409 },
    );
  if (code === "P2025")
    return Response.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "The requested record no longer exists.",
        },
      },
      { status: 404 },
    );
  if (code === "P2003")
    return Response.json(
      {
        error: {
          code: "INVALID_REFERENCE",
          message: "A linked record does not exist or is still in use.",
        },
      },
      { status: 409 },
    );
  console.error("[api] Request failed", {
    code: typeof code === "string" ? code : "UNEXPECTED_ERROR",
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message:
          "The operation could not be completed. Please retry or contact an administrator.",
      },
    },
    { status: 500 },
  );
}
