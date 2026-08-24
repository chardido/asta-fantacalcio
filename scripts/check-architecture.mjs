import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);
const DOMAIN_DECIMAL_FIELDS = new Set([
  "fantamedia",
  "golAttesi",
  "mediaVoto",
  "precisionePassaggi",
]);
const CONTRACT_DOMAIN_FILES = new Set([
  "packages/contracts/src/domain.ts",
  "packages/contracts/src/esportazione.ts",
]);

function isInside(candidate, parent) {
  const relativePath = relative(parent, candidate);

  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) &&
      relativePath !== ".." &&
      !isAbsolute(relativePath))
  );
}

async function collectFiles(directory, predicate, result) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          await collectFiles(absolutePath, predicate, result);
        }
        return;
      }

      if (entry.isFile() && predicate(absolutePath)) result.push(absolutePath);
    }),
  );
}

function sourceFileFor(filePath, source) {
  const scriptKind = filePath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : filePath.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
}

function location(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${line + 1}:${character + 1}`;
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return undefined;
}

function isDatabaseModule(moduleName) {
  return (
    moduleName === "@asta/db" ||
    moduleName.startsWith("@asta/db/") ||
    /(?:^|\/)packages\/db(?:\/|$)/u.test(moduleName) ||
    /(?:^|\/)db\/src(?:\/|$)/u.test(moduleName)
  );
}

function isForbiddenDomainModule(moduleName) {
  return (
    isDatabaseModule(moduleName) ||
    moduleName === "@asta/adapters" ||
    moduleName.startsWith("@asta/adapters/") ||
    /(?:^|\/)packages\/adapters(?:\/|$)/u.test(moduleName) ||
    /(?:^|\/)adapters\/src(?:\/|$)/u.test(moduleName)
  );
}

function importedModule(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
      ? node.moduleSpecifier.text
      : undefined;
  }
  if (
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
    node.arguments.length === 1 &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return undefined;
}

function isGlobalMember(node, objectName, memberName) {
  if (ts.isPropertyAccessExpression(node)) {
    if (ts.isIdentifier(node.expression) && node.expression.text === objectName) {
      return node.name.text === memberName;
    }
    return (
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "globalThis" &&
      node.expression.name.text === objectName &&
      node.name.text === memberName
    );
  }
  if (ts.isElementAccessExpression(node)) {
    return (
      ts.isIdentifier(node.expression) &&
      node.expression.text === objectName &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === memberName
    );
  }
  return false;
}

function isGlobalIdentifierOrMember(node, name) {
  return (
    (ts.isIdentifier(node) && node.text === name) ||
    (ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "globalThis" &&
      node.name.text === name) ||
    (ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "globalThis" &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === name)
  );
}

function isZodNumberCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "z" &&
    node.expression.name.text === "number"
  );
}

function zodNumberHasInt(numberCall) {
  let current = numberCall;
  while (current.parent) {
    const parent = current.parent;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === current) {
      if (parent.name.text === "int") return true;
      current = parent;
      continue;
    }
    if (ts.isCallExpression(parent) && parent.expression === current) {
      current = parent;
      continue;
    }
    break;
  }
  return false;
}

function typeContainsNumber(typeNode) {
  if (!typeNode) return false;
  let containsNumber = false;
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.NumberKeyword) containsNumber = true;
    if (!containsNumber) ts.forEachChild(node, visit);
  };
  visit(typeNode);
  return containsNumber;
}

function isForbiddenDecimalField(fieldName) {
  return (
    DOMAIN_DECIMAL_FIELDS.has(fieldName) ||
    /(?:float|floating|decimal)/iu.test(fieldName)
  );
}

function isApiBoundary(relativePath) {
  const normalized = relativePath.split(sep).join("/");
  return (
    /^apps\/web\/src\/(?:app\/api|api|server\/(?:api|trpc))\//u.test(normalized) ||
    /\/route\.(?:[cm]?[jt]sx?)$/u.test(normalized)
  );
}

async function inspectSourceFile(filePath, workspaceRoot, violations) {
  const relativePath = relative(workspaceRoot, filePath).split(sep).join("/");
  const source = await readFile(filePath, "utf8");
  const sourceFile = sourceFileFor(filePath, source);
  const domainSource = relativePath.startsWith("packages/domain/");
  const domainContract = CONTRACT_DOMAIN_FILES.has(relativePath);
  const apiBoundary = isApiBoundary(relativePath);

  const addViolation = (node, message) => {
    violations.push(`${relativePath}:${location(sourceFile, node)}: ${message}`);
  };

  const visit = (node) => {
    const moduleName = importedModule(node);
    if (domainSource && moduleName && isForbiddenDomainModule(moduleName)) {
      addViolation(node, `packages/domain non può importare ${moduleName}`);
    }
    if (apiBoundary && moduleName && isDatabaseModule(moduleName)) {
      addViolation(
        node,
        "lo strato API non può accedere direttamente a @asta/db; usa caricaSessionePropria",
      );
    }

    if (domainSource && ts.isCallExpression(node)) {
      if (isGlobalIdentifierOrMember(node.expression, "fetch")) {
        addViolation(node, "packages/domain non può eseguire fetch");
      }
      if (
        isGlobalIdentifierOrMember(node.expression, "Date") ||
        ((ts.isPropertyAccessExpression(node.expression) ||
          ts.isElementAccessExpression(node.expression)) &&
          isGlobalIdentifierOrMember(node.expression.expression, "Date"))
      ) {
        addViolation(node, "packages/domain non può leggere Date");
      }
      if (isGlobalMember(node.expression, "Math", "random")) {
        addViolation(node, "packages/domain non può usare Math.random");
      }
    }
    if (
      domainSource &&
      ts.isNewExpression(node) &&
      isGlobalIdentifierOrMember(node.expression, "Date")
    ) {
      addViolation(node, "packages/domain non può leggere Date");
    }

    if (domainContract && isZodNumberCall(node) && !zodNumberHasInt(node)) {
      addViolation(node, "ogni schema numerico Zod di dominio deve applicare .int()");
    }

    if (
      (domainSource || domainContract) &&
      (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node))
    ) {
      const name = propertyName(node.name);
      if (name && isForbiddenDecimalField(name) && typeContainsNumber(node.type)) {
        addViolation(
          node,
          `il campo numerico ${name} deve usare una rappresentazione intera esplicita (per esempio il suffisso Milli)`,
        );
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

export async function findCssViolations(workspaceRoot) {
  const root = resolve(workspaceRoot);
  const allowedThemeDirectory = resolve(root, "apps/web/src/tema");
  const cssFiles = [];

  await collectFiles(root, (filePath) => filePath.endsWith(".css"), cssFiles);

  return cssFiles
    .filter((filePath) => !isInside(filePath, allowedThemeDirectory))
    .map((filePath) => relative(root, filePath).split(sep).join("/"))
    .sort((left, right) => left.localeCompare(right));
}

export async function findSourceViolations(workspaceRoot) {
  const root = resolve(workspaceRoot);
  const sourceFiles = [];
  const violations = [];

  await collectFiles(
    root,
    (filePath) => SOURCE_EXTENSIONS.has(extname(filePath)),
    sourceFiles,
  );
  await Promise.all(
    sourceFiles.map((filePath) => inspectSourceFile(filePath, root, violations)),
  );

  return violations.sort((left, right) => left.localeCompare(right));
}

export async function checkArchitecture(workspaceRoot) {
  const [cssViolations, sourceViolations] = await Promise.all([
    findCssViolations(workspaceRoot),
    findSourceViolations(workspaceRoot),
  ]);

  return [
    ...cssViolations.map(
      (filePath) =>
        `${filePath}: i file CSS sono consentiti solo in apps/web/src/tema`,
    ),
    ...sourceViolations,
  ].sort((left, right) => left.localeCompare(right));
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const defaultRoot = resolve(dirname(currentFile), "..");
  const workspaceRoot = resolve(argumentValue("--root") ?? defaultRoot);
  const violations = await checkArchitecture(workspaceRoot);

  if (violations.length > 0) {
    console.error("Violazioni architetturali rilevate:");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  }
}
