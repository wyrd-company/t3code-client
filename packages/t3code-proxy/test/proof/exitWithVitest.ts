// ---
// relationships:
//   verifies: proxy
// ---
/**
 * A test worker does not end with Vitest, and Vitest can start one during a stop, after a signal to
 * the process group. An orphan worker would run its tests against a stopped environment.
 * `process.exit` is not usable here, because Vitest replaces it in a worker.
 */
const exit = () => process.kill(process.pid, "SIGTERM");

if (process.connected) process.once("disconnect", exit);
else exit();
