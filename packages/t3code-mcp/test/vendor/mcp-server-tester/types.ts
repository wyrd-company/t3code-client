// ---
// relationships:
//   verifies: mcp
// ---
export interface TestCase {
  id: string;
  toolName: string;
  description: string;
  naturalLanguageQuery: string;
  inputs: Record<string, unknown>;
  expectedOutcome: { status: "success" | "error"; validationRules?: ValidationRule[] };
}
export interface ValidationRule {
  type: "contains" | "matches" | "hasProperty" | "equals" | "arrayLength" | "custom";
  target?: string;
  value?: unknown;
  custom?: (response: unknown) => boolean;
  message: string;
}
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
export interface ToolResponse {
  status: "success" | "error";
  data?: unknown;
  error?: { message: string; code?: string };
}
export interface ResponseValidatorInterface {
  validateResponse(response: ToolResponse, testCase: TestCase): ValidationResult;
}
