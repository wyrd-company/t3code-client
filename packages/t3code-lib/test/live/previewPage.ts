// ---
// relationships:
//   verifies: library
// ---
/** The page that a server browser tab loads in a live test, on a local server of the test. */
import { startLocalHttp } from "./localHttp.ts";

export const SAVED_FILE_BODY = "sample download body";

const PAGE = `<!doctype html><html><head><title>Sample page</title></head><body style="margin:0">
<input id="picker" type="file" style="position:absolute;left:0;top:0;width:400px;height:150px">
<a href="/file" download style="position:absolute;left:0;top:200px;display:block;width:400px;height:100px">Save</a>
<input id="typed" style="position:absolute;left:0;top:350px;width:400px;height:100px">
<script>
const report = (path, body) => fetch(path, { method: "POST", body });
document.getElementById("picker").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  await report("/picked", file === undefined ? "" : await file.text());
});
document.getElementById("typed").addEventListener("input", (event) => report("/typed", event.target.value));
</script></body></html>`;

export const PICKER_POINT = { x: 100, y: 75 };
export const SAVE_POINT = { x: 100, y: 250 };
export const TYPED_POINT = { x: 100, y: 400 };
export const BLANK_POINT = { x: 700, y: 500 };

export interface PreviewPage {
  readonly url: string;
  /** The last body that the page reported on this path. */
  reported(path: "/picked" | "/typed"): string | undefined;
  stop(): Promise<void>;
}

export async function startPreviewPage(): Promise<PreviewPage> {
  const reports = new Map<string, string>();
  const server = await startLocalHttp(async (request, response) => {
    if (request.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      reports.set(request.url ?? "", Buffer.concat(chunks).toString());
      response.end();
      return;
    }
    if (request.url === "/file") {
      response.writeHead(200, {
        "content-type": "text/plain",
        "content-disposition": 'attachment; filename="sample.txt"',
      });
      response.end(SAVED_FILE_BODY);
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(PAGE);
  });
  return {
    url: `${server.url}/`,
    reported: (path) => reports.get(path),
    stop: server.close,
  };
}
