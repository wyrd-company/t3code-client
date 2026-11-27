import * as NodeFS from "node:fs";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import {
  BooleanProviderOptionDescriptor,
  SelectProviderOptionDescriptor,
  ServerProvider,
} from "./provider.ts";

describe("provider fields in 0.1.13", () => {
  it("recognizes mode roles on select and boolean options", () => {
    const option = { id: "sample-mode", label: "Session mode", role: "mode" };
    const toggle = { ...option, type: "boolean" };
    const select = { ...option, type: "select", options: [] };
    expect(BooleanProviderOptionDescriptor.parse(toggle).role).toBe("mode");
    expect(SelectProviderOptionDescriptor.parse(select).role).toBe("mode");
    expect(SelectProviderOptionDescriptor.parse({ ...select, role: "reasoning" }).role).toBe(
      "reasoning",
    );
    expect(BooleanProviderOptionDescriptor.safeParse({ ...toggle, role: false }).success).toBe(
      false,
    );
    expect(SelectProviderOptionDescriptor.safeParse({ ...select, role: 1 }).success).toBe(false);
  });

  it("validates incomplete provider catalogs and accepts older snapshots", () => {
    const config = JSON.parse(
      NodeFS.readFileSync(
        new URL("../../test/fixtures/server-config.json", import.meta.url),
        "utf8",
      ),
    ) as { providers: Array<Record<string, unknown>> };
    const provider = ServerProvider.parse(config.providers[0]);
    expectTypeOf(provider.modelsIncomplete).toEqualTypeOf<boolean | undefined>();
    expect(ServerProvider.parse({ ...provider, modelsIncomplete: true }).modelsIncomplete).toBe(
      true,
    );
    expect(ServerProvider.parse({ ...provider, modelsIncomplete: false }).modelsIncomplete).toBe(
      false,
    );
    expect(
      ServerProvider.parse({ ...provider, modelsIncomplete: undefined }).modelsIncomplete,
    ).toBeUndefined();
    expect(ServerProvider.safeParse({ ...provider, modelsIncomplete: 1 }).success).toBe(false);
  });
});
