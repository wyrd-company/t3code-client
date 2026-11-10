// ---
// relationships:
//   implements: library
// ---
/**
 * Text generators: model APIs that only generate text, such as commit messages
 * and thread titles. Mirrors the text generator part of `settings.ts` in the
 * contracts. An input has closed lists and the contracts' bounds. A result
 * stays open, so a newer server's values decode.
 */
import { z } from "zod";
import { ProviderInstanceId, TrimmedNonEmptyString, forwardCompatibleArray } from "./common.ts";
import { SettingsSecretValue } from "./providerInstance.ts";

export const TextGeneratorKind = z.enum(["openaiCompatible", "anthropic"]);
export type TextGeneratorKind = z.infer<typeof TextGeneratorKind>;

/** An `http:` or `https:` URL with no credentials, query or fragment. */
const isPlainHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
};

export const TextGeneratorBaseUrl = TrimmedNonEmptyString.max(2048).refine(
  isPlainHttpUrl,
  "Expected an http or https URL without credentials, query or fragment.",
);

/**
 * A text generator's settings. Its id shares the namespace of provider
 * instance ids. A redacted `apiKey` keeps the key saved under that id.
 */
export const TextGeneratorConfig = z.looseObject({
  kind: TextGeneratorKind,
  label: TrimmedNonEmptyString.optional(),
  baseUrl: TextGeneratorBaseUrl,
  apiKey: SettingsSecretValue.optional(),
  enabled: z.boolean().optional(),
});
export type TextGeneratorConfig = z.infer<typeof TextGeneratorConfig>;

export const TextGeneratorModel = z.looseObject({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
});
export type TextGeneratorModel = z.infer<typeof TextGeneratorModel>;

export const ListTextGeneratorModelsInput = z.looseObject({
  id: ProviderInstanceId,
  /** Unsaved settings to check before saving them. Without it, the saved generator `id`. */
  config: TextGeneratorConfig.optional(),
  /** Skip the server's cached list and ask the API again. */
  refresh: z.boolean().optional(),
  /** Also have a model answer a short prompt, which proves the key, endpoint and model. */
  test: z.boolean().optional(),
  /** With `test`: the model to try. The server picks a listed one when omitted. */
  model: TrimmedNonEmptyString.optional(),
});
export type ListTextGeneratorModelsInput = z.infer<typeof ListTextGeneratorModelsInput>;

export const ListTextGeneratorModelsResult = z.looseObject({
  models: forwardCompatibleArray(TextGeneratorModel),
  /** The model that answered, when `test` was set. */
  testedModel: TrimmedNonEmptyString.optional(),
});
export type ListTextGeneratorModelsResult = z.infer<typeof ListTextGeneratorModelsResult>;
