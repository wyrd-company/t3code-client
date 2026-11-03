// ---
// relationships:
//   verifies: proxy
// ---
// A test npm registry for one local tarball, so that a Feature scenario installs the package
// from this checkout. It also lists version 99.0.0 of the same bytes, which a scenario uses to
// prove that the installer checks the installed version. Usage: registry.mjs TARBALL PORT
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";

const [tarball, port] = process.argv.slice(2);
if (!tarball || !port) throw new Error("Usage: registry.mjs TARBALL PORT");

const bytes = NodeFS.readFileSync(tarball);
const manifest = JSON.parse(
  NodeChildProcess.execFileSync("tar", ["-xzOf", tarball, "package/package.json"], {
    encoding: "utf8",
  }),
);
const integrity = `sha512-${NodeCrypto.createHash("sha512").update(bytes).digest("base64")}`;

const server = NodeHttp.createServer((request, response) => {
  if (decodeURIComponent(request.url ?? "").toLowerCase() === `/${manifest.name}`) {
    const version = (number) => ({
      ...manifest,
      version: number,
      dist: { integrity, tarball: `http://${request.headers.host}/package.tgz` },
    });
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        name: manifest.name,
        "dist-tags": { latest: manifest.version },
        versions: { [manifest.version]: version(manifest.version), "99.0.0": version("99.0.0") },
      }),
    );
    return;
  }
  if (request.url === "/package.tgz") {
    response.setHeader("content-type", "application/octet-stream");
    response.end(bytes);
    return;
  }
  response.statusCode = 404;
  response.end();
});
process.once("SIGTERM", () => server.close(() => process.exit(0)));
server.listen(Number(port), "0.0.0.0", () => process.stdout.write("listening\n"));
