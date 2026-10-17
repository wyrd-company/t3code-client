/**
 * Building blocks shared by the RPC error schemas.
 */
import { z } from "zod";
import { TrimmedNonEmptyString } from "../common.ts";

/** A `Schema.Defect()` value: an opaque encoding of whatever the server threw. */
export const Defect = z.unknown();

export function taggedError<const Tag extends string, const Shape extends z.ZodRawShape>(
  tag: Tag,
  shape: Shape,
) {
  return z.looseObject({ _tag: z.literal(tag), ...shape });
}

export const messageAndCause = { message: TrimmedNonEmptyString, cause: Defect.optional() };
