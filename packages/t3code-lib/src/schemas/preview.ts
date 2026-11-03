// ---
// relationships:
//   implements: library
// ---
/**
 * Mirrors `packages/contracts/src/preview.ts` and `browserProfile.ts`: the browser
 * tabs of a thread and the local servers that the environment finds. A closed value
 * in an input has its own form, because the same name in a result stays open for a
 * newer server. Unknown keys pass.
 */
import { z } from "zod";
import {
  NonNegativeInt,
  PositiveInt,
  ThreadId,
  TrimmedNonEmptyString,
  forwardCompatibleLiteral,
  taggedUnionWithUnknown,
} from "./common.ts";

const PreviewUrl = TrimmedNonEmptyString.max(2048);
const PreviewTitle = z.string().max(512);
export const PreviewTabId = TrimmedNonEmptyString.max(128);
export type PreviewTabId = z.infer<typeof PreviewTabId>;
/** Control characters could select another browser partition. */
export const BrowserProfileId = TrimmedNonEmptyString.max(64).regex(/^[^\p{Cc}]+$/u);
export type BrowserProfileId = z.infer<typeof BrowserProfileId>;

const VIEWPORT_MAX_AREA = 3840 * 2160;
const ViewportDimension = z.number().int().min(240).max(3840);
const viewportSize = { width: ViewportDimension, height: ViewportDimension } as const;
const withinViewportArea = (size: { width: number; height: number }) =>
  size.width * size.height <= VIEWPORT_MAX_AREA;
const VIEWPORT_AREA_MESSAGE = `The viewport area must not be over ${VIEWPORT_MAX_AREA} pixels.`;

/** The server also accepts the older ids that its stored settings can hold. */
const PreviewViewportPresetId = z.enum([
  "iphone-se",
  "iphone-xr",
  "iphone-12-pro",
  "iphone-14-pro-max",
  "pixel-7",
  "samsung-galaxy-s8-plus",
  "samsung-galaxy-s20-ultra",
  "ipad-mini",
  "ipad-air",
  "ipad-pro",
  "surface-pro-7",
  "surface-duo",
  "galaxy-z-fold-5",
  "asus-zenbook-fold",
  "samsung-galaxy-a51-71",
  "nest-hub",
  "nest-hub-max",
  "desktop-1920x1080",
  "desktop-1440x900",
  "laptop-1366x768",
  "laptop-1280x800",
  "ipad-pro-11",
  "iphone-15-pro",
  "pixel-8",
  "galaxy-s24",
]);

export const PreviewViewportInput = z.discriminatedUnion("_tag", [
  z.looseObject({ _tag: z.literal("fill") }),
  z
    .looseObject({ _tag: z.literal("freeform"), ...viewportSize })
    .refine(withinViewportArea, VIEWPORT_AREA_MESSAGE),
  z
    .looseObject({
      _tag: z.literal("preset"),
      ...viewportSize,
      presetId: PreviewViewportPresetId,
    })
    .refine(withinViewportArea, VIEWPORT_AREA_MESSAGE),
]);
export type PreviewViewportInput = z.infer<typeof PreviewViewportInput>;

export const PreviewViewportSetting = taggedUnionWithUnknown("_tag", [
  z.looseObject({ _tag: z.literal("fill") }),
  z.looseObject({ _tag: z.literal("freeform"), width: z.number(), height: z.number() }),
  z.looseObject({
    _tag: z.literal("preset"),
    width: z.number(),
    height: z.number(),
    presetId: z.string(),
  }),
]);
export type PreviewViewportSetting = z.infer<typeof PreviewViewportSetting>;

const PreviewFileDownload = z.looseObject({ id: z.string(), fileName: z.string() });
const pageFields = { url: PreviewUrl, title: PreviewTitle } as const;
const loadFailureFields = {
  ...pageFields,
  code: z.number().int(),
  description: z.string(),
  download: PreviewFileDownload.optional(),
} as const;
const navStatusMembers = [
  z.looseObject({ _tag: z.literal("Idle") }),
  z.looseObject({ _tag: z.literal("Loading"), ...pageFields }),
  z.looseObject({ _tag: z.literal("Success"), ...pageFields }),
  z.looseObject({ _tag: z.literal("LoadFailed"), ...loadFailureFields }),
] as const;

export const PreviewNavStatus = taggedUnionWithUnknown("_tag", navStatusMembers);
export type PreviewNavStatus = z.infer<typeof PreviewNavStatus>;

export const PreviewNavStatusInput = z.discriminatedUnion("_tag", navStatusMembers);
export type PreviewNavStatusInput = z.infer<typeof PreviewNavStatusInput>;

export const PreviewSessionSnapshot = z.looseObject({
  threadId: TrimmedNonEmptyString,
  tabId: PreviewTabId,
  navStatus: PreviewNavStatus,
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  viewport: PreviewViewportSetting.optional(),
  colorScheme: forwardCompatibleLiteral(["system", "light", "dark"]).optional(),
  zoomFactor: z.number().optional(),
  profileId: z.string().optional(),
  runtime: forwardCompatibleLiteral(["desktop", "server"]).optional(),
  /** The server runs this tab in headless Chromium. */
  headless: z.boolean().optional(),
  automationOwner: z.string().optional(),
  reveal: z.boolean().optional(),
  revealRequest: z.looseObject({ id: z.string(), force: z.boolean() }).optional(),
  updatedAt: z.string(),
});
export type PreviewSessionSnapshot = z.infer<typeof PreviewSessionSnapshot>;

const tabRef = { threadId: ThreadId, tabId: PreviewTabId } as const;

export const PreviewOpenInput = z.looseObject({
  threadId: ThreadId,
  url: PreviewUrl.optional(),
  viewport: PreviewViewportInput.optional(),
  profileId: BrowserProfileId.optional(),
  /** `server` runs the tab in the environment's headless browser. */
  runtime: z.enum(["desktop", "server"]).optional(),
  reveal: z.boolean().optional(),
});
export type PreviewOpenInput = z.infer<typeof PreviewOpenInput>;

export const PreviewReportStatusInput = z.looseObject({
  ...tabRef,
  navStatus: PreviewNavStatusInput,
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
});
export type PreviewReportStatusInput = z.infer<typeof PreviewReportStatusInput>;

export const PreviewResizeInput = z.looseObject({ ...tabRef, viewport: PreviewViewportInput });
export type PreviewResizeInput = z.infer<typeof PreviewResizeInput>;

/** The zoom steps of the desktop browser controls. */
const PreviewZoomFactor = z.union(
  [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5].map((step) =>
    z.literal(step),
  ) as [z.ZodLiteral<number>, z.ZodLiteral<number>, ...z.ZodLiteral<number>[]],
);

export const PreviewAdjustInput = z.looseObject({
  ...tabRef,
  colorScheme: z.enum(["system", "light", "dark"]).optional(),
  zoomFactor: PreviewZoomFactor.optional(),
  hardReload: z.boolean().optional(),
  clear: z.enum(["cookies", "cache"]).optional(),
});
export type PreviewAdjustInput = z.infer<typeof PreviewAdjustInput>;

/** Without a tab, closes all of the thread's tabs. */
export const PreviewCloseInput = z.looseObject({
  threadId: ThreadId,
  tabId: PreviewTabId.optional(),
});
export type PreviewCloseInput = z.infer<typeof PreviewCloseInput>;

export const BrowserProfile = z.looseObject({
  id: BrowserProfileId,
  name: TrimmedNonEmptyString.max(48),
  kind: z.enum(["persistent", "incognito"]),
});
export type BrowserProfile = z.infer<typeof BrowserProfile>;

export const PreviewReportProfilesInput = z.looseObject({
  profiles: z.array(BrowserProfile).max(24),
  defaultProfileId: BrowserProfileId,
  /** Without it, the server keeps the last reported rate. */
  recordingFrameRate: z.union([z.literal(30), z.literal(60)]).optional(),
});
export type PreviewReportProfilesInput = z.infer<typeof PreviewReportProfilesInput>;

export const PreviewClearProfileInput = z.looseObject({ profileId: BrowserProfileId });
export type PreviewClearProfileInput = z.infer<typeof PreviewClearProfileInput>;

export const PreviewListInput = z.looseObject({ threadId: ThreadId });
export type PreviewListInput = z.infer<typeof PreviewListInput>;

export const PreviewListResult = z.looseObject({
  sessions: z.array(PreviewSessionSnapshot),
  /** Names the server process, so that a lower `revision` after a restart is safe. */
  serverEpoch: TrimmedNonEmptyString,
  revision: NonNegativeInt,
});
export type PreviewListResult = z.infer<typeof PreviewListResult>;

const eventFields = {
  threadId: TrimmedNonEmptyString,
  tabId: PreviewTabId,
  createdAt: z.string(),
  serverEpoch: TrimmedNonEmptyString,
  /** Shared with `PreviewListResult`. */
  revision: PositiveInt,
} as const;

export const PreviewEvent = taggedUnionWithUnknown("type", [
  z.looseObject({
    ...eventFields,
    type: z.literal("opened"),
    snapshot: PreviewSessionSnapshot,
  }),
  z.looseObject({
    ...eventFields,
    type: z.literal("navigated"),
    snapshot: PreviewSessionSnapshot,
  }),
  z.looseObject({
    ...eventFields,
    type: z.literal("resized"),
    snapshot: PreviewSessionSnapshot,
    request: z
      .looseObject({
        hardReload: z.boolean().optional(),
        clear: forwardCompatibleLiteral(["cookies", "cache"]).optional(),
      })
      .optional(),
  }),
  z.looseObject({ ...eventFields, type: z.literal("failed"), ...loadFailureFields }),
  z.looseObject({ ...eventFields, type: z.literal("closed") }),
]);
export type PreviewEvent = z.infer<typeof PreviewEvent>;

const LocalServerPort = z.number().int().min(1).max(65_535);

export const DiscoveredLocalServer = z.looseObject({
  host: TrimmedNonEmptyString,
  port: LocalServerPort,
  url: PreviewUrl,
  processName: TrimmedNonEmptyString.nullable(),
  pid: PositiveInt.nullable(),
  terminal: z.looseObject({ threadId: ThreadId, terminalId: TrimmedNonEmptyString }).nullable(),
  /** Started by the thread's agent. */
  agent: z.looseObject({ threadId: ThreadId }).nullable().optional(),
});
export type DiscoveredLocalServer = z.infer<typeof DiscoveredLocalServer>;

export const DiscoveredLocalServerList = z.looseObject({
  servers: z.array(DiscoveredLocalServer),
  scannedAt: z.string(),
  configuredUrlProbing: z.literal(true).optional(),
});
export type DiscoveredLocalServerList = z.infer<typeof DiscoveredLocalServerList>;

export const SubscribeDiscoveredLocalServersInput = z.looseObject({
  /** More URLs to probe, beyond the listeners that the environment finds. */
  configuredUrls: z.array(PreviewUrl).max(32).optional(),
});
export type SubscribeDiscoveredLocalServersInput = z.infer<
  typeof SubscribeDiscoveredLocalServersInput
>;

/** The server signals only a listener that it attributes to a terminal or an agent. */
export const PreviewStopLocalServerInput = z.looseObject({
  pid: PositiveInt,
  port: LocalServerPort,
});
export type PreviewStopLocalServerInput = z.infer<typeof PreviewStopLocalServerInput>;
