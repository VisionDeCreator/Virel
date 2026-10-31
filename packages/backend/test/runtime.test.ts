// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";

// convex-test runs in a JS test runtime that accepts import(), while the
// deployed Convex query/mutation runtime rejects it. Check the production sources.
test("Convex runtime modules contain no unsupported dynamic imports", () => {
  const directory = join(import.meta.dirname, "../convex");
  const failures: string[] = [];
  function inspect(folder: string) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === "_generated") continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        inspect(path);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      const source = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      if (
        source.statements.some(
          (statement) =>
            ts.isExpressionStatement(statement) &&
            ts.isStringLiteral(statement.expression) &&
            statement.expression.text === "use node",
        )
      )
        continue;
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword
        )
          failures.push(path);
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  inspect(directory);
  expect(failures).toEqual([]);
});

test("Convex contains no R2/provider implementation or SDK dependency", () => {
  const directory = join(import.meta.dirname, "../convex");
  const sources = readdirSync(directory)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => readFileSync(join(directory, name), "utf8"))
    .join("\n");
  expect(sources).not.toMatch(
    /@aws-sdk|mediabunny|SUME_API_KEY|R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID/,
  );
});
