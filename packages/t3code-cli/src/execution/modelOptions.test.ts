// ---
// relationships:
//   verifies: command-line
// ---
import { expect, it } from "vite-plus/test";
import { T3PreconditionError, type T3Client } from "@wyrd-company/t3code-lib";
import { changesModelOptions, parseModelOptions, resolveModelOptions } from "./modelOptions.ts";

type Model = Awaited<ReturnType<T3Client["server"]["providers"]>>[number]["models"][number];
const model = {
  slug: "sample-model",
  capabilities: {
    optionDescriptors: [
      { id: "flag", label: "Flag", type: "boolean" },
      {
        id: "level",
        label: "Level",
        type: "select",
        options: [
          { id: "low", label: "Low" },
          { id: "true", label: "Literal" },
        ],
      },
      { id: "free", label: "Free", type: "select", options: [] },
      { unknown: true, raw: { id: "future", type: "future-kind" } },
    ],
  },
} as unknown as Model;

it("parses key=value entries, keeps later equals signs and trims both sides", () => {
  expect(parseModelOptions([" level = low ", "free=a=b"])).toEqual([
    { id: "level", raw: "low" },
    { id: "free", raw: "a=b" },
  ]);
  expect(parseModelOptions(undefined)).toEqual([]);
});
it.each([["level"], ["=low"], ["level="], [" = "], ["level=low", "level=true"]])(
  "rejects malformed or repeated entries %j",
  (...entries) => {
    expect(() => parseModelOptions(entries)).toThrow(T3PreconditionError);
  },
);
it("sends booleans for boolean descriptors and strings for select choices", () => {
  expect(
    resolveModelOptions(model, { modelOption: ["flag=false", "level=true", "free=any"] }, []),
  ).toEqual([
    { id: "flag", value: false },
    { id: "level", value: "true" },
    { id: "free", value: "any" },
  ]);
  expect(resolveModelOptions(model, { modelOption: ["flag=true"] }, undefined)).toEqual([
    { id: "flag", value: true },
  ]);
});
it.each(["missing=low", "flag=yes", "flag=TRUE", "level=high", "future=value"])(
  "rejects %s against advertised descriptors",
  (entry) => {
    expect(() => resolveModelOptions(model, { modelOption: [entry] }, [])).toThrow(
      T3PreconditionError,
    );
  },
);
it("rejects every option when the model advertises no descriptors", () => {
  expect(() =>
    resolveModelOptions({ ...model, capabilities: null }, { modelOption: ["flag=true"] }, []),
  ).toThrow(T3PreconditionError);
});
it("overrides inherited entries by key and keeps the others", () => {
  const inherited = [
    { id: "level", value: "low" },
    { id: "other", value: "kept" },
  ];
  expect(resolveModelOptions(model, { modelOption: ["level=true"] }, inherited)).toEqual([
    { id: "other", value: "kept" },
    { id: "level", value: "true" },
  ]);
});
it("clearing starts empty and combines with explicit entries", () => {
  const inherited = [{ id: "level", value: "low" }];
  expect(resolveModelOptions(model, { clearModelOptions: true }, inherited)).toEqual([]);
  expect(
    resolveModelOptions(model, { clearModelOptions: true, modelOption: ["flag=true"] }, inherited),
  ).toEqual([{ id: "flag", value: true }]);
});
it("leaves options untouched without option input", () => {
  expect(resolveModelOptions(model, {}, [{ id: "level", value: "low" }])).toBeUndefined();
  expect(changesModelOptions({})).toBe(false);
  expect(changesModelOptions({ modelOption: [] })).toBe(false);
  expect(changesModelOptions({ clearModelOptions: false })).toBe(false);
  expect(changesModelOptions({ modelOption: ["flag=true"] })).toBe(true);
  expect(changesModelOptions({ clearModelOptions: true })).toBe(true);
});
