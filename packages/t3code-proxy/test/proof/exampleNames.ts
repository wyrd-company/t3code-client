// ---
// relationships:
//   verifies: proxy
// ---
/** Every `example.test` name is this machine, in the test process only. No host file changes. */
import dns from "node:dns";

const lookup = dns.lookup;
const local = (
  hostname: string,
  options: dns.LookupOptions | ((...args: unknown[]) => void),
  callback?: (...args: unknown[]) => void,
) => {
  const done = typeof options === "function" ? options : callback!;
  const settings = typeof options === "function" ? {} : options;
  if (!hostname.endsWith(".example.test")) {
    return lookup(hostname, settings as dns.LookupAllOptions, done as () => void);
  }
  if (settings.all) return done(null, [{ address: "127.0.0.1", family: 4 }]);
  return done(null, "127.0.0.1", 4);
};
Object.assign(dns, { lookup: local });
