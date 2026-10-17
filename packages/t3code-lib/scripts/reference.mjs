// ---
// relationships:
//   implements: library
// ---
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import jsdoc2md from "jsdoc-to-markdown";
import ts from "typescript-api";

const root = NodePath.resolve(import.meta.dirname, "..");
const entry = NodePath.join(root, "src/index.ts");
const program = ts.createProgram([entry], {
  allowImportingTsExtensions: true,
  target: ts.ScriptTarget.ESNext,
});
const checker = program.getTypeChecker();
const module = checker.getSymbolAtLocation(program.getSourceFile(entry));
const exports = checker
  .getExportsOfModule(module)
  .map((symbol) =>
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol,
  );
const files = new Set();
const signatures = new Map();
const names = new Set();
const profileTypes = [];
for (const symbol of exports) {
  for (const declaration of symbol.declarations ?? []) {
    if (
      (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) &&
      /(?:profiles|credentialStore)/u.test(declaration.getSourceFile().fileName)
    ) {
      profileTypes.push(declaration.getText(declaration.getSourceFile()));
    }
    if (
      !ts.isClassDeclaration(declaration) &&
      !ts.isFunctionDeclaration(declaration) &&
      !ts.isVariableDeclaration(declaration)
    )
      continue;
    names.add(symbol.name);
    const source = declaration.getSourceFile();
    files.add(
      NodePath.join(
        root,
        "dist",
        NodePath.relative(NodePath.join(root, "src"), source.fileName).replace(/\.ts$/u, ".js"),
      ),
    );
    if (ts.isFunctionDeclaration(declaration) && declaration.body) {
      signatures.set(
        symbol.name,
        source.text.slice(declaration.getStart(source), declaration.body.pos).trim(),
      );
    }
    if (ts.isClassDeclaration(declaration)) {
      for (const member of declaration.members) {
        if (
          (!ts.isMethodDeclaration(member) && !ts.isGetAccessorDeclaration(member)) ||
          ts.isPrivateIdentifier(member.name)
        )
          continue;
        const separator = member.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword)
          ? "."
          : "#";
        const signature = source.text
          .slice(member.getStart(source), member.body?.pos ?? member.end)
          .replace(/^\/\*\*[\s\S]*?\*\/\s*/u, "")
          .trim();
        signatures.set(`${symbol.name}${separator}${member.name.getText(source)}`, signature);
      }
    }
  }
}
const data = await jsdoc2md.getTemplateData({ files: [...files], "no-cache": true });
const publicData = data.filter((item) => names.has(item.name) || names.has(item.memberof));
for (const item of publicData) {
  // jsdoc's ESM class output can make a class its own parent, hiding its tree.
  if (item.kind === "class" && item.memberof === item.name) delete item.memberof;
  const signature = signatures.get(item.id);
  if (signature) item.description = `${item.description ?? ""}\n\n\`\`\`ts\n${signature};\n\`\`\``;
}
for (const [id] of signatures) {
  const item = publicData.find((candidate) => candidate.id === id);
  if (!item || item.undocumented) throw new Error(`Public API ${id} lacks JSDoc.`);
}
const reference = await jsdoc2md.render({ data: publicData });
const types = `\n## Profile and credential types\n\n\`\`\`ts\n${profileTypes.join("\n\n")}\n\`\`\`\n`;
const header = `---\nrelationships:\n  references: [library, profiles]\n---\n\n# Library API reference\n\nGenerated with \`task lib:docs\`. Import public symbols from \`@wyrd-company/t3code-lib\`.\nSee [profiles](profiles.md) for configuration and [design](technical-designs/library.yml) for the library contract.\nTypeScript declarations ship with the package.\n\n`;
const output = NodeChildProcess.execFileSync(
  "pnpm",
  ["exec", "vp", "fmt", "--stdin-filepath=docs/api.md"],
  {
    cwd: root,
    input: header + reference + types,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
  },
);
const destination = NodePath.resolve(root, "../../docs/api.md");
if (process.argv.includes("--check")) {
  if ((await NodeFSP.readFile(destination, "utf8")) !== output) {
    throw new Error("Library reference differs; run task lib:docs.");
  }
} else {
  await NodeFSP.writeFile(destination, output);
}
