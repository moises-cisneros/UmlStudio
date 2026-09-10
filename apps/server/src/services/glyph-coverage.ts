import type { UMLModel } from "@umlstudio/core";

const isCoveredCodePoint = (cp: number): boolean =>
  (cp >= 0x20 && cp <= 0x7e) || // Basic Latin
  (cp >= 0xa0 && cp <= 0xff) || // Latin-1 Supplement
  (cp >= 0x100 && cp <= 0x17f) || // Latin Extended-A
  (cp >= 0x180 && cp <= 0x24f) || // Latin Extended-B (Vietnamese ư/ơ, …)
  (cp >= 0x300 && cp <= 0x36f) || // Combining diacritics
  (cp >= 0x370 && cp <= 0x3ff) || // Greek and Coptic
  (cp >= 0x400 && cp <= 0x4ff) || // Cyrillic
  (cp >= 0x1e00 && cp <= 0x1eff) || // Latin Extended Additional (Vietnamese)
  cp === 0x2013 || // en dash
  cp === 0x2014 || // em dash
  (cp >= 0x2018 && cp <= 0x201f) || // smart quotes
  cp === 0x2026 || // horizontal ellipsis
  cp === 0x09 || // tab
  cp === 0x0a || // newline
  cp === 0x0d; // carriage return

const collectStrings = (value: unknown, out: string[]): void => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) collectStrings(v, out);
};

export function findUnsupportedLabels(model: UMLModel): string[] {
  const strings: string[] = [model.title ?? ""];
  for (const node of model.nodes ?? []) collectStrings(node.data, strings);
  for (const edge of model.edges ?? []) collectStrings(edge.data, strings);

  const flagged = new Set<string>();
  for (const text of strings) {
    for (const ch of text) {
      if (!isCoveredCodePoint(ch.codePointAt(0) ?? 0)) {
        flagged.add(text.trim());
        break;
      }
    }
  }
  return [...flagged].filter(Boolean);
}
