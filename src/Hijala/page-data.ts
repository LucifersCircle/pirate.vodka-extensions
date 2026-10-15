/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Lucifers Circle */

// Decode only the data literals emitted by TanStack/Seroval. Never evaluate site code.
// Functions, calls, constructors, operators, computed keys and cyclic references are unsupported.
export const serializedProperty = <T>(script: string, key: string): T => {
  if (script.length > 4_000_000) throw new Error("Hijala page data is too large.");
  // Sticky scanning must stop at an unterminated string, not retry at every escaped quote.
  const tokenPattern =
    /\s+|<!--|-->|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\/[/*]|[A-Za-z_$][\w$]*|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[^\s"']/gy;
  const tokens: string[] = [];
  while (tokenPattern.lastIndex < script.length) {
    const match = tokenPattern.exec(script);
    if (!match) throw new Error("Hijala returned incomplete page data syntax.");
    if (!match[0].trim()) continue;
    if (["//", "/*", "<!--", "-->", "`", "/"].includes(match[0]))
      throw new Error("Hijala returned unsupported page data syntax.");
    tokens.push(match[0]);
    if (tokens.length > 250_000) throw new Error("Hijala page data is too large.");
  }
  const prefix = ["$_TSR", ".", "router", "=", "(", "$R", "=", ">", "$R", "[", "0", "]", "=", "{"];
  const assignments = tokens.flatMap((_token, index) =>
    prefix.every((token, offset) => tokens[index + offset] === token) ? [index] : [],
  );
  if (assignments.length !== 1)
    throw new Error("Hijala returned unsupported or ambiguous router data.");
  const start = assignments[0] + prefix.length - 1;
  let rootEnd = start;
  const delimiters: string[] = [];
  const openers: Record<string, string> = { "}": "{", "]": "[", ")": "(" };
  for (; rootEnd < tokens.length; rootEnd++) {
    const token = tokens[rootEnd];
    if (["{", "[", "("].includes(token)) delimiters.push(token);
    else if (Object.hasOwn(openers, token)) {
      if (delimiters.pop() !== openers[token])
        throw new Error("Hijala returned incomplete router data.");
      if (!delimiters.length) break;
    }
    if (delimiters.length > 64) throw new Error("Hijala page data is too deeply nested.");
  }
  if (rootEnd === tokens.length) throw new Error("Hijala returned incomplete router data.");
  const definitions = new Map<string, number>();
  const properties = new Map<string, { depth: number; positions: number[] }>();
  let nesting = 0;
  const string = (token: string): string => {
    // Seroval uses JSON strings plus JavaScript hex escapes and literal control characters.
    return JSON.parse(
      token.replace(
        // Control characters can occur literally in Seroval strings.
        // eslint-disable-next-line no-control-regex
        /\\(?:x([\da-fA-F]{2})|[\s\S])|[\x00-\x1f]/g,
        (match, hex: string | undefined) =>
          hex
            ? `\\u00${hex}`
            : match[0] === "\\"
              ? match
              : `\\u${match.charCodeAt(0).toString(16).padStart(4, "0")}`,
      ),
    ) as string;
  };
  for (let i = start; i <= rootEnd; i++) {
    if (tokens[i] === "{") nesting++;
    if (tokens[i] === "}") nesting--;
    if (
      tokens[i] === "$R" &&
      tokens[i + 1] === "[" &&
      /^\d+$/.test(tokens[i + 2]) &&
      tokens[i + 3] === "]" &&
      tokens[i + 4] === "="
    ) {
      const id = tokens[i + 2];
      if (definitions.has(id)) throw new Error("Hijala returned duplicate data references.");
      definitions.set(id, i + 5);
    }
    if ((tokens[i - 1] === "{" || tokens[i - 1] === ",") && tokens[i + 1] === ":") {
      const name = tokens[i][0] === '"' ? string(tokens[i]) : tokens[i];
      const current = properties.get(name);
      if (!current || nesting < current.depth)
        properties.set(name, { depth: nesting, positions: [i + 2] });
      else if (nesting === current.depth) current.positions.push(i + 2);
    }
  }
  const active = new Set<string>();
  let budget = 100_000;
  const invalid = (): never => {
    throw new Error(`Hijala returned unsupported or incomplete ${key} data.`);
  };
  const read = (position: number, depth = 0): [unknown, number] => {
    if (--budget < 0 || depth > 64) return invalid();
    let i = position;
    const token = tokens[i++];
    if (token === "$R") {
      const id = tokens[i + 1];
      if (tokens[i] !== "[" || !/^\d+$/.test(id) || tokens[i + 2] !== "]" || active.has(id))
        return invalid();
      i += 3;
      const assigned = tokens[i] === "=";
      const start = definitions.get(id);
      if (start === undefined || (assigned && start !== i + 1)) return invalid();
      active.add(id);
      const [value, end] = read(start, depth + 1);
      active.delete(id);
      if (![",", "}", "]"].includes(tokens[end])) return invalid();
      return [value, assigned ? end : i];
    }
    if (token === "[" || token === "{") {
      const array = token === "[";
      const close = array ? "]" : "}";
      const values: unknown[] = [];
      const object: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      while (tokens[i] !== close) {
        let name = "";
        if (!array) {
          const field = tokens[i++];
          if (!field || (field[0] !== '"' && !/^[A-Za-z_$][\w$]*$/.test(field))) return invalid();
          name = field[0] === '"' ? string(field) : field;
          if (
            ["__proto__", "prototype", "constructor"].includes(name) ||
            Object.hasOwn(object, name) ||
            tokens[i++] !== ":"
          )
            return invalid();
        }
        const [value, end] = read(i, depth + 1);
        i = end;
        if (array) values.push(value);
        else object[name] = value;
        if (tokens[i] === close) break;
        if (tokens[i++] !== "," || tokens[i] === close) return invalid();
      }
      return [array ? values : object, i + 1];
    }
    if (token?.[0] === '"') return [string(token), i];
    if (token === "null") return [null, i];
    if (token === "true" || token === "false") return [token === "true", i];
    if (token === "!" && (tokens[i] === "0" || tokens[i] === "1")) return [tokens[i++] === "0", i];
    if (token === "void" && tokens[i] === "0") return [undefined, i + 1];
    if (
      /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token) &&
      Number.isFinite(Number(token))
    )
      return [Number(token), i];
    return invalid();
  };
  const positions = properties.get(key)?.positions;
  if (!positions?.length) throw new Error(`Hijala page is missing ${key}.`);
  // Select the page field, not same-named fields nested in individual series cards.
  // At the shallowest level it must be unique; do not guess between payloads.
  if (positions.length !== 1) throw new Error(`Hijala returned ambiguous ${key} data.`);
  const [value, end] = read(positions[0]);
  if (![",", "}"].includes(tokens[end])) return invalid();
  return value as T;
};
