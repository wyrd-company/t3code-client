#!/usr/bin/env node
// ---
// relationships:
//   implements: proxy
// ---
import { main } from "./cliMain.ts";
process.exitCode = await main(process.argv.slice(2));
