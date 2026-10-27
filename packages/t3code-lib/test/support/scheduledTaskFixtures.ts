/**
 * Wire-shaped scheduled tasks and webhook deliveries for unit tests.
 */
export const sampleTaskBase = {
  title: "Sample task",
  prompt: "Summarize the sample notes.",
  enabled: true,
  projectId: "project-sample",
  threadId: null,
  workspaceStrategy: { type: "root" },
  modelSelection: { instanceId: "sample-provider", model: "sample-model" },
  runtimeMode: "full-access",
  interactionMode: "default",
  createdBy: "agent",
  creationSource: "mcp",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  nextRunAt: null,
  lastRunAt: null,
  lastRunStatus: "never",
  lastRunError: null,
  runCount: 0,
} as const;

export const intervalTask = {
  ...sampleTaskBase,
  id: "scheduled-task:interval",
  schedule: { type: "interval", everyMs: 3_600_000 },
};

export const webhookEndpoint = {
  path: "/api/hooks/scheduled-task%3Awebhook/sample-token",
  url: null,
  hasSecret: true,
};

export const webhookTask = {
  ...sampleTaskBase,
  id: "scheduled-task:webhook",
  schedule: {
    type: "webhook",
    signature: { header: "x-sample-signature", encoding: "hex", prefix: "sha256=" },
    maxDeliveryAgeMinutes: 30,
    dedupe: { replayKey: "{{headers.x-sample-id}}" },
    filters: [{ path: "body.action", op: "equals", value: "opened" }],
  },
  webhook: webhookEndpoint,
};

export const deliverySummary = {
  id: "delivery-sample",
  taskId: "scheduled-task:webhook",
  receivedAt: "2026-01-01T00:00:00.000Z",
  method: "POST",
  contentType: "application/json",
  bodyBytes: 2,
  outcome: "rejected_signature",
  signatureVerified: false,
  missingFields: [],
  error: null,
};
