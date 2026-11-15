import ts from "typescript";

/** One banned phrase of the glossary. An empty `scope` means every scanned path. */
export type BannedRule = {
  readonly phrase: string;
  readonly say: string;
  readonly scope: readonly string[];
  readonly pattern: RegExp;
};

export type ExceptionRule = {
  readonly path: string;
  readonly phrases: readonly string[] | "*";
  readonly reason: string;
};

export type Glossary = {
  readonly banned: readonly BannedRule[];
  readonly exceptions: readonly ExceptionRule[];
};

export type Hit = {
  readonly path: string;
  readonly line: number;
  readonly phrase: string;
  readonly say: string;
  readonly text: string;
};

type ScreenString = { line: number; text: string };

type ScanResult = {
  readonly hits: readonly Hit[];
  readonly staleExceptions: readonly ExceptionRule[];
  /** Scope prefixes under which no scanned file sits: a typo that switches a row off. */
  readonly unusedScopes: readonly string[];
};

const BANNED_SECTION = "## Banned words";

const EXCEPTIONS_SECTION = "## Allowed exceptions";

/** The body rows of the first table under `heading`, each split into its cells. */
function tableRows(markdown: string, heading: string): string[][] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);

  if (start < 0) {
    throw new Error(`The glossary is missing the section "${heading}".`);
  }

  const rows: string[][] = [];
  let inTable = false;

  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;

    if (!line.trimStart().startsWith("|")) {
      if (inTable) break;
      continue;
    }

    inTable = true;
    // A table cell escapes its pipes as `\|`, so only a bare `|` ends a cell.
    rows.push(
      line
        .trim()
        .slice(1, -1)
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim().replaceAll("\\|", "|"))
    );
  }

  // Drop the header row and the `| --- |` separator.
  return rows.slice(2);
}

/** The code spans of a cell. Never split by commas: a regular expression can hold one. */
function codeSpans(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? "");
}

function compile(phrase: string): RegExp {
  const regex = /^\/(.+)\/([a-z]*)$/.exec(phrase);

  try {
    if (regex) {
      // Each string is tested once, so a `g` or `y` flag would only make `test` stateful.
      return new RegExp(regex[1] ?? "", (regex[2] ?? "").replace(/[gy]/g, ""));
    }

    const words = phrase
      .split(/\s+/)
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");

    return new RegExp(`(?<![\\p{L}\\p{N}_])${words}(?![\\p{L}\\p{N}_])`, "iu");
  } catch (error) {
    throw new Error(
      `The glossary row "${phrase}" is an invalid regular expression: ${String(error)}`,
      { cause: error }
    );
  }
}

/** The path prefixes of an Applies in cell; empty for `all`. A typo here must fail, not hide. */
function readScope(appliesIn: string): string[] {
  if (appliesIn === "all" || appliesIn === "`all`") return [];

  const scope = codeSpans(appliesIn);

  if (scope.length === 0) {
    throw new Error(
      `The glossary Applies in "${appliesIn}" is neither all nor paths in backticks.`
    );
  }

  for (const prefix of scope) {
    if (!prefix.endsWith("/")) {
      throw new Error(`The glossary scope "${prefix}" must end in "/".`);
    }
  }

  return scope;
}

/** The banned table and the exceptions table of `terminology.md`. */
export function readGlossary(markdown: string): Glossary {
  const banned = tableRows(markdown, BANNED_SECTION).flatMap(
    ([phrases = "", say = "", appliesIn = ""]) => {
      const spans = codeSpans(phrases);

      if (spans.length === 0) {
        throw new Error(
          `The glossary banned row "${phrases}" has no phrase in backticks.`
        );
      }

      const scope = readScope(appliesIn);

      return spans.map((phrase) => ({
        phrase,
        say: say.replaceAll('"', ""),
        scope,
        pattern: compile(phrase),
      }));
    }
  );

  const known = new Set(banned.map((rule) => rule.phrase));

  const exceptions = tableRows(markdown, EXCEPTIONS_SECTION).map(
    ([pathCell = "", phrasesCell = "", reason = ""]): ExceptionRule => {
      const [path] = codeSpans(pathCell);
      const spans = codeSpans(phrasesCell);

      if (!path || spans.length === 0) {
        throw new Error(
          `The glossary exception row "${pathCell}" needs a path and phrases in backticks.`
        );
      }

      if (spans.length === 1 && spans[0] === "*") {
        return { path, phrases: "*", reason };
      }

      for (const phrase of spans) {
        if (!known.has(phrase)) {
          throw new Error(
            `The glossary exception for ${path}: "${phrase}" is not a banned phrase.`
          );
        }
      }

      return { path, phrases: spans, reason };
    }
  );

  return { banned, exceptions };
}

const CLASS_HELPERS = new Set(["cn", "clsx", "cva", "twMerge", "tv"]);

const CLASS_NAME = /(?:class|classname|classes)$/i;

// SQL held in a string constant such as `GROUP_COLUMNS`. A `columns` array of headers is read.
const SQL_COLUMNS = /columns$/i;

const SQL_START = /^(?:select |insert into |update |delete from |with )/;

/** The plain name and the initializer of a declaration, property or JSX attribute. */
function declared(
  node: ts.Node
): { name: string; value: ts.Node | undefined } | undefined {
  if (
    (ts.isVariableDeclaration(node) ||
      ts.isPropertyAssignment(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isJsxAttribute(node)) &&
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
  ) {
    return { name: node.name.text, value: node.initializer };
  }

  return undefined;
}

/** True for a subtree that holds code, never text a person reads. */
function isCodeSubtree(node: ts.Node): boolean {
  if (
    ts.isImportDeclaration(node) ||
    ts.isExportDeclaration(node) ||
    ts.isLiteralTypeNode(node) ||
    ts.isImportTypeNode(node) ||
    ts.isTaggedTemplateExpression(node)
  ) {
    return true;
  }

  if (ts.isCallExpression(node)) {
    const callee = node.expression;

    if (
      callee.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(callee) && CLASS_HELPERS.has(callee.text)) ||
      (ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "console")
    ) {
      return true;
    }
  }

  const declaration = declared(node);

  if (declaration === undefined) return false;

  const { name, value } = declaration;

  if (name === "className" || name === "class" || CLASS_NAME.test(name)) {
    return true;
  }

  return (
    SQL_COLUMNS.test(name) &&
    value !== undefined &&
    (ts.isStringLiteralLike(value) || ts.isTemplateExpression(value))
  );
}

/** A string literal used as a property name: an object key, a member name. */
function isPropertyName(node: ts.Node): boolean {
  const parent: ts.Node & { name?: ts.Node } = node.parent;

  return parent.name === node;
}

/** The text of a template, with `{}` in place of each substitution. */
function templateText(node: ts.TemplateExpression): string {
  return (
    node.head.text +
    node.templateSpans.map((span) => `{}${span.literal.text}`).join("")
  );
}

function isScreenText(text: string): boolean {
  // A code token: an id, a key or a URL path such as `/people/{personId}/disable`.
  if (!/\s/.test(text) && (!/\p{Lu}/u.test(text) || text.startsWith("/"))) {
    return false;
  }

  return !SQL_START.test(text.trimStart());
}

function collect(source: ts.SourceFile, json: boolean): ScreenString[] {
  const found: ScreenString[] = [];

  // A JSX child is never an id, a key or a path, so the code-token rules do not apply to it.
  const add = (position: number, raw: string, jsx = false) => {
    const text = raw.replace(/\s+/g, " ").trim();

    if (!text || (!jsx && !isScreenText(text))) return;

    found.push({
      line: source.getLineAndCharacterOfPosition(position).line + 1,
      text,
    });
  };

  const visit = (node: ts.Node): void => {
    if (!json && isCodeSubtree(node)) return;

    // `parseJsonText` sets no parent links, so a JSON key is skipped from its property.
    if (json && ts.isPropertyAssignment(node)) {
      visit(node.initializer);

      return;
    }

    if (ts.isJsxText(node)) {
      const start = node.end - node.text.length;

      add(
        start + (node.text.length - node.text.trimStart().length),
        node.text,
        true
      );
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      if (json || !isPropertyName(node)) add(node.getStart(source), node.text);
    } else if (ts.isTemplateExpression(node)) {
      add(node.getStart(source), templateText(node));
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
}

/** The strings of one file that a person reads, with their line numbers. */
export function screenStrings(
  path: string,
  text: string
): readonly ScreenString[] {
  if (path.endsWith(".json")) {
    return collect(ts.parseJsonText(path, text), true);
  }

  const kind = path.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : path.endsWith(".ts")
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JSX;

  return collect(
    ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind),
    false
  );
}

function hides(rule: ExceptionRule, path: string, phrase: string): boolean {
  return (
    // A path that ends in `/` is a folder: the row covers every file under it.
    (rule.path.endsWith("/")
      ? path.startsWith(rule.path)
      : rule.path === path) &&
    (rule.phrases === "*" || rule.phrases.includes(phrase))
  );
}

/** Every banned phrase in a screen string, the exceptions that hid nothing, and unused scopes. */
export function bannedHits(
  files: ReadonlyMap<string, string>,
  glossary: Glossary
): ScanResult {
  const used = new Set<ExceptionRule>();
  const hits: Hit[] = [];

  for (const [path, source] of files) {
    const rules = glossary.banned.filter(
      (rule) =>
        rule.scope.length === 0 ||
        rule.scope.some((prefix) => path.startsWith(prefix))
    );

    for (const { line, text } of screenStrings(path, source)) {
      for (const { phrase, say, pattern } of rules) {
        if (!pattern.test(text)) continue;

        const exception = glossary.exceptions.find((rule) =>
          hides(rule, path, phrase)
        );

        if (exception) used.add(exception);
        else hits.push({ path, line, phrase, say, text });
      }
    }
  }

  const paths = [...files.keys()];
  const scopes = new Set(glossary.banned.flatMap((rule) => rule.scope));

  return {
    hits,
    staleExceptions: glossary.exceptions.filter((rule) => !used.has(rule)),
    unusedScopes: [...scopes].filter(
      (prefix) => !paths.some((path) => path.startsWith(prefix))
    ),
  };
}

export function formatHit(hit: Hit): string {
  return `${hit.path}:${hit.line}: "${hit.phrase}" in "${hit.text}". Say "${hit.say}".`;
}
