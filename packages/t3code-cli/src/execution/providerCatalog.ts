// ---
// relationships:
//   implements: command-line
// ---
/** The live provider catalog as the CLI reads it from `server.providers`. */
import type { schemas } from "@wyrd-company/t3code-lib";

export type ServerProvider = schemas.provider.ServerProvider;
export type ServerModel = schemas.provider.ServerProviderModel;
export type OptionDescriptor = schemas.provider.ProviderOptionDescriptor;
export type UnknownOptionDescriptor = Extract<OptionDescriptor, { readonly unknown: true }>;
export type KnownOptionDescriptor = Exclude<OptionDescriptor, UnknownOptionDescriptor>;

/** Growing descriptor types decode as `{ unknown: true, raw }`. */
export function isUnknownDescriptor(
  descriptor: OptionDescriptor,
): descriptor is UnknownOptionDescriptor {
  return (descriptor as { unknown?: unknown }).unknown === true;
}

/** The option id, which an unknown descriptor keeps only in its raw record. */
export function descriptorId(descriptor: OptionDescriptor): unknown {
  return isUnknownDescriptor(descriptor) ? descriptor.raw["id"] : descriptor.id;
}
