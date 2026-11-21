// Render the guide's terminal recording from a passing live test's evidence.
// From the repo root, build with `task build`, then run:
// env -u T3_LIVE_URL -u T3_LIVE_TOKEN T3C_APPROVAL_HOOK_EVIDENCE=/tmp/watch-approvals.json \
//   pnpm --filter @wyrd-company/t3code-cli run test:live approvalHookGuide.live.test.ts
// node packages/t3code-cli/demo/watchApprovals.mjs /tmp/watch-approvals.json /path/to/DejaVuSansMono.ttf
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import { fileURLToPath } from "node:url";

const [evidenceFile, font] = process.argv.slice(2);
if (!evidenceFile || !font) throw new Error("Supply the live evidence file and a monospace font.");
const evidence = JSON.parse(NodeFS.readFileSync(evidenceFile, "utf8"));
const watch = evidence.find(({ watcher }) => watcher)?.watcher;
const request = watch?.reports.find(({ command }) => command === "echo sample");
const ready = watch?.stderr.find((line) => line === "t3c: watching for requests");
const wait = evidence.find(
  ({ command }) => command?.join(" ") === `t3c thread wait ${request?.thread.id}`,
);
if (!request || !ready || wait?.exit !== 0)
  throw new Error("The live acceptance evidence is incomplete.");

const lines = watch.stderr
  .filter((line) => line.includes(request.requestId))
  .map((line) =>
    line
      .replaceAll(request.requestId, "request-1")
      .replaceAll(request.thread.id, "requester")
      .replaceAll("\t", " "),
  );
if (lines.length !== 3) throw new Error("Expected the hook receipt, verdict and response.");

const initial = [
  "$ t3c requests watch --ignore-defaults --kind approval \\",
  '    --exclude-thread "$REVIEWER_THREAD_ID" --exec ./forward-to-reviewer.sh \\',
  "    --exec-concurrency 1 --exec-timeout 1m --log-level info --json",
  ready,
];
const reported = [...initial, "", ...lines];
const completed = [...reported, "", '$ t3c thread wait "$requester"', ...wait.stdout];
const background = "#17212d";
const frame = (delay, text) => [
  "(",
  "-delay",
  String(delay),
  "-background",
  background,
  "-fill",
  "#ecf2f8",
  "-font",
  font,
  "-pointsize",
  "20",
  "-interline-spacing",
  "5",
  "-size",
  "960x355",
  "-gravity",
  "northwest",
  `caption:${text.join("\n").replaceAll("\\", "\\\\")}`,
  "-bordercolor",
  background,
  "-border",
  "22",
  ")",
];
NodeChildProcess.execFileSync("magick", [
  ...frame(220, initial),
  ...frame(300, reported),
  ...frame(400, completed),
  "-loop",
  "0",
  fileURLToPath(new URL("../../../docs/user/t3c/assets/watch-approvals.gif", import.meta.url)),
]);
