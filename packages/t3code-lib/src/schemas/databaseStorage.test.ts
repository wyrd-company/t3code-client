// ---
// relationships:
//   verifies: library-facades
// ---
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { DatabaseStorageStatus, DatabaseStorageStatusUpdate } from "./server.ts";

const status = {
  databaseBytes: 4096,
  reclaimableBytes: 1024,
  incrementalVacuumEnabled: true,
  compactCommand: "sample-cli doctor --base-dir /srv/sample",
};

describe("database storage schemas", () => {
  it("infers the public status and update types", () => {
    expectTypeOf<DatabaseStorageStatus["databaseBytes"]>().toEqualTypeOf<number>();
    expectTypeOf<DatabaseStorageStatus["reclaimableBytes"]>().toEqualTypeOf<number>();
    expectTypeOf<DatabaseStorageStatus["incrementalVacuumEnabled"]>().toEqualTypeOf<boolean>();
    expectTypeOf<DatabaseStorageStatus["compactCommand"]>().toEqualTypeOf<string>();
    expectTypeOf<DatabaseStorageStatusUpdate>().toEqualTypeOf<DatabaseStorageStatus | null>();
  });

  it("decodes a status and preserves unknown metadata", () => {
    expect(DatabaseStorageStatusUpdate.parse({ ...status, future: "kept" })).toEqual({
      ...status,
      future: "kept",
    });
  });

  it("decodes null before the server first reads the file", () => {
    expect(DatabaseStorageStatusUpdate.parse(null)).toBeNull();
  });

  it("keeps any finite number and any command string, as the tagged schema allows", () => {
    for (const bytes of [0, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
      const value = { ...status, databaseBytes: bytes, reclaimableBytes: bytes };
      expect(DatabaseStorageStatusUpdate.parse(value), String(bytes)).toEqual(value);
    }
    for (const compactCommand of ["", "  padded  "]) {
      expect(DatabaseStorageStatusUpdate.parse({ ...status, compactCommand })).toEqual({
        ...status,
        compactCommand,
      });
    }
    expect(
      DatabaseStorageStatusUpdate.parse({ ...status, incrementalVacuumEnabled: false }),
    ).toMatchObject({ incrementalVacuumEnabled: false });
  });

  it("rejects each missing field while the others stay valid", () => {
    for (const key of Object.keys(status)) {
      const { [key]: _omitted, ...rest } = status as Record<string, unknown>;
      expect(DatabaseStorageStatusUpdate.safeParse(rest).success, key).toBe(false);
    }
  });

  it("rejects each wrongly typed field while the others stay valid", () => {
    const wrong: Record<string, readonly unknown[]> = {
      databaseBytes: ["4096", null, true, {}],
      reclaimableBytes: ["1024", null, false, []],
      incrementalVacuumEnabled: ["true", 1, null],
      compactCommand: [7, null, false, {}],
    };
    for (const [key, values] of Object.entries(wrong)) {
      for (const value of values) {
        const item = { ...status, [key]: value };
        expect(DatabaseStorageStatusUpdate.safeParse(item).success, `${key}=${String(value)}`).toBe(
          false,
        );
      }
    }
  });

  it("rejects a non-object, non-null item", () => {
    for (const item of [undefined, 0, "status", [], true]) {
      expect(DatabaseStorageStatusUpdate.safeParse(item).success, String(item)).toBe(false);
    }
  });
});
