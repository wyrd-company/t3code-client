// ---
// relationships:
//   implements: library
// ---
import { z } from "zod";
import { defineMethod } from "../spec.ts";
import {
  AgentSessionImportInput,
  AgentSessionImportResult,
  AgentSessionScanResult,
} from "../../schemas/agentSessions.ts";

export const agentSessionsMethods = {
  /** Reads the transcripts of the server's enabled providers, on its host. */
  "agentSessions.scan": defineMethod({
    payload: z.looseObject({}),
    success: AgentSessionScanResult,
    stream: false,
    scope: "orchestration:read",
  }),
  /** Creates threads from the project's recent transcripts. */
  "agentSessions.import": defineMethod({
    payload: AgentSessionImportInput,
    success: AgentSessionImportResult,
    stream: false,
    scope: "orchestration:operate",
  }),
};
