// ---
// relationships:
//   verifies: mcp
// ---
import { T3Client, T3ConnectionError } from "@wyrd-company/t3code-lib";
import { startStdio } from "../../../dist/cliMain.js";

startStdio({}, () => {
  let closed = false;
  const client = T3Client.create({ baseUrl: "http://127.0.0.1:1" });
  client.server.providerStatus = async () => [];
  return {
    async get() {
      if (closed) throw new T3ConnectionError("closed", "The client was closed.");
      return client;
    },
    async close() {
      closed = true;
      await client.close();
    },
  };
});
