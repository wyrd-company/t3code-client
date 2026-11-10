// ---
// relationships:
//   verifies: library
// ---
import { describe, expect, it } from "vite-plus/test";

import { requiredScopesForSettingsUpdate, ServerSettingsPatch } from "./settingsPatch.ts";

describe("the voice settings of a patch", () => {
  it("takes the speech keys, a cloud key as a literal or a reference, and a project vocabulary", () => {
    const patch = {
      cloudSpeechCredentials: { openai: "sample-key", xai: { provider: "sample", reference: "k" } },
      speechModelId: "sample/model",
      speechAcceleration: "gpu:0",
      speechModelUnloadTimeout: "never",
      speechProjectCustomWords: [{ term: "Sample", aliases: ["Sampel"] }],
      speechPostProcessingModelSelection: null,
      projectSettingsOverrides: {
        sample: { speechProjectCustomWords: [{ term: "Other", aliases: [] }] },
      },
    };
    expect(ServerSettingsPatch.parse(patch)).toEqual(patch);
    expect(requiredScopesForSettingsUpdate({ patch: ServerSettingsPatch.parse(patch) })).toEqual([
      "settings:write",
    ]);
  });

  it("refuses a bad acceleration and a vocabulary with a repeated spelling", () => {
    expect(ServerSettingsPatch.safeParse({ speechAcceleration: "gpu:" }).success).toBe(false);
    expect(
      ServerSettingsPatch.safeParse({
        speechProjectCustomWords: [{ term: "Sample", aliases: [" sample"] }],
      }).success,
    ).toBe(false);
  });
});
