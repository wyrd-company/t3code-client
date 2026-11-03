// ---
// relationships:
//   verifies: proxy
// ---
/** Every `example.test` name is the test container, in the test process only. */
import dns from "node:dns";

const address = process.env["T3_FEATURE_ADDRESS"];
if (!address) throw new Error("Run this test with scripts/feature/test-feature-runtime.sh.");
const lookup = dns.lookup;
const container = (
  hostname: string,
  options: dns.LookupOptions | ((...args: unknown[]) => void),
  callback?: (...args: unknown[]) => void,
) => {
  const done = typeof options === "function" ? options : callback!;
  const settings = typeof options === "function" ? {} : options;
  if (!hostname.endsWith(".example.test")) {
    return lookup(hostname, settings as dns.LookupAllOptions, done as () => void);
  }
  if (settings.all) return done(null, [{ address, family: 4 }]);
  return done(null, address, 4);
};
Object.assign(dns, { lookup: container });
