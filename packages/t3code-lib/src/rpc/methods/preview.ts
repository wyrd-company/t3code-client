// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import { VoidSuccess, defineMethod } from "../spec.ts";
import {
  DiscoveredLocalServerList,
  PreviewAdjustInput,
  PreviewClearProfileInput,
  PreviewCloseInput,
  PreviewEvent,
  PreviewListInput,
  PreviewListResult,
  PreviewOpenInput,
  PreviewReportProfilesInput,
  PreviewReportStatusInput,
  PreviewResizeInput,
  PreviewSessionSnapshot,
  PreviewStopLocalServerInput,
  SubscribeDiscoveredLocalServersInput,
} from "../../schemas/preview.ts";

// A reader sees tabs and listeners. Stopping a listener is a terminal operation.
export const previewMethods = {
  "preview.open": defineMethod({
    payload: PreviewOpenInput,
    success: PreviewSessionSnapshot,
    stream: false,
    scope: "preview:operate",
  }),
  "preview.resize": defineMethod({
    payload: PreviewResizeInput,
    success: PreviewSessionSnapshot,
    stream: false,
    scope: "preview:operate",
  }),
  "preview.adjust": defineMethod({
    payload: PreviewAdjustInput,
    success: PreviewSessionSnapshot,
    stream: false,
    scope: "preview:operate",
  }),
  "preview.close": defineMethod({
    payload: PreviewCloseInput,
    success: VoidSuccess,
    stream: false,
    scope: "preview:operate",
  }),
  "preview.list": defineMethod({
    payload: PreviewListInput,
    success: PreviewListResult,
    stream: false,
    scope: "orchestration:read",
  }),
  "preview.clearProfile": defineMethod({
    payload: PreviewClearProfileInput,
    success: VoidSuccess,
    stream: false,
    scope: "preview:operate",
  }),
  "preview.reportProfiles": defineMethod({
    payload: PreviewReportProfilesInput,
    success: VoidSuccess,
    stream: false,
    scope: "preview:operate",
  }),
  "preview.reportStatus": defineMethod({
    payload: PreviewReportStatusInput,
    success: VoidSuccess,
    stream: false,
    scope: "preview:operate",
  }),
  "preview.stopLocalServer": defineMethod({
    payload: PreviewStopLocalServerInput,
    success: VoidSuccess,
    stream: false,
    scope: "terminal:operate",
  }),
  subscribePreviewEvents: defineMethod({
    payload: z.looseObject({}),
    success: PreviewEvent,
    stream: true,
    scope: "orchestration:read",
  }),
  subscribeDiscoveredLocalServers: defineMethod({
    payload: SubscribeDiscoveredLocalServersInput,
    success: DiscoveredLocalServerList,
    stream: true,
    scope: "orchestration:read",
  }),
} as const;
