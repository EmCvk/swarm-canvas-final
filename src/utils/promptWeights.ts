/**
 * Shared helpers for parsing and formatting weighted prompt tokens.
 *
 * A "plain" tag is weighted by wrapping it in parens: `(tag:1.20)`.
 * A LoRA/LyCORIS reference already carries its weight as the last field
 * inside the tag itself: `<lora:SubFolder/Name.safetensors:1.20>`. These two
 * forms must not be conflated - wrapping a lora tag in an extra paren
 * (`(<lora:...:1>:1.20)`) produces a tag SwarmUI/A1111 back-ends will not
 * parse as a lora weight change. All weight-adjusting UI (scroll-to-adjust,
 * bulk stage-weight, manual edits) should go through these helpers so the
 * two token flavors are always handled consistently.
 */

export const LORA_TOKEN_RE = /^<(lora|lyco):(.+?):([0-9]+(?:\.[0-9]+)?)>$/i;
export const PAREN_WEIGHT_RE = /^\((.*):([0-9]+(?:\.[0-9]+)?)\)$/;

export interface ParsedWeightedToken {
  /** For a lora token this is the full `<lora:...>` tag (weight excluded from display). For a
   *  plain tag this is the bare tag text with any paren-weight wrapper removed. */
  base: string;
  weight: number;
  isLora: boolean;
  loraType?: 'lora' | 'lyco';
  /** The lora/lyco file reference, e.g. `SubFolder/Name.safetensors` */
  loraName?: string;
}

export function parseWeightedToken(raw: string): ParsedWeightedToken {
  const clean = raw.trim();

  const loraMatch = clean.match(LORA_TOKEN_RE);
  if (loraMatch) {
    return {
      base: clean,
      weight: parseFloat(loraMatch[3]) || 1.0,
      isLora: true,
      loraType: loraMatch[1].toLowerCase() as 'lora' | 'lyco',
      loraName: loraMatch[2],
    };
  }

  const parenMatch = clean.match(PAREN_WEIGHT_RE);
  if (parenMatch) {
    return { base: parenMatch[1].trim(), weight: parseFloat(parenMatch[2]) || 1.0, isLora: false };
  }

  return { base: clean, weight: 1.0, isLora: false };
}

/** Re-serializes a parsed token at a new weight, preserving lora tag syntax. */
export function formatWeightedToken(parsed: ParsedWeightedToken, weight: number): string {
  const w = Number(weight.toFixed(2));
  if (parsed.isLora && parsed.loraType && parsed.loraName) {
    return `<${parsed.loraType}:${parsed.loraName}:${w}>`;
  }
  if (w === 1.0) return parsed.base;
  return `(${parsed.base}:${w})`;
}

/** True if a raw tag/token string is a lora or lyco reference (any weight). */
export function isLoraToken(raw: string): boolean {
  return LORA_TOKEN_RE.test(raw.trim());
}

/** Friendly display name for a lora/lyco reference: strips folder path and known extensions. */
export function loraDisplayName(loraName: string): string {
  const withoutExt = loraName.replace(/\.(safetensors|ckpt|pt|bin)$/i, '');
  const parts = withoutExt.split(/[\\/]/);
  return parts[parts.length - 1] || withoutExt;
}

export function clampWeight(weight: number, min = 0.1, max = 3.0): number {
  return Math.max(min, Math.min(max, Number(weight.toFixed(2))));
}
