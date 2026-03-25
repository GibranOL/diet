// ============================================================
// PDF PARSER SERVICE — Dieta App
// Parses Mundo Nutrition PDFs produced by Gibran's nutritionist.
//
// Entry points:
//   parseMealPDF(filePath)        → ParsedMealDay
//   parsePDFBatch(filePaths[])    → ParsedMealDay[]
// ============================================================

import pdfParse from "pdf-parse";
import fs from "fs";
import path from "path";
import { MealType, RawIngredient, Dish, Meal, ParsedMealDay } from "../types/index";

// ─── Constants ───────────────────────────────────────────────────────────────

// All recognised meal-time headings in the order they appear in the PDF.
// The order matters: we use it to detect when a new meal block starts.
const MEAL_TYPES: MealType[] = [
  "Al despertar",
  "Desayuno",
  "Medio día",
  "Comida",
  "Media tarde",
  "Cena",
];

// Spanish month names → 0-based month index (January = 0)
const SPANISH_MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

// Units we recognise inline with ingredient quantities.
// Listed longest-first so the regex matches the most specific token first.
const KNOWN_UNITS = [
  "cdas",
  "cda",
  "cdtas",
  "cdta",
  "tazas",
  "taza",
  "piezas",
  "pieza",
  "pzas",
  "pza",
  "rebanadas",
  "rebanada",
  "porciones",
  "porcion",
  "porción",
  "litros",
  "litro",
  "lts",
  "lt",
  "mililitros",
  "mililitro",
  "mls",
  "ml",
  "gramos",
  "gramo",
  "grs",
  "gr",
  "g",
  "kg",
];

// Regex that matches a quantity + optional unit at the END of a token:
//   "250ml"  → { qty: 250, unit: "ml" }
//   "60g"    → { qty: 60, unit: "g" }
//   "2"      → { qty: 2, unit: undefined }
// We build it dynamically so the unit list stays in one place.
const UNIT_PATTERN = KNOWN_UNITS.join("|");
const QUANTITY_RE = new RegExp(
  `^(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_PATTERN})?$`,
  "i"
);

// Parenthesised quantity-alt like "(2 piezas)" or "(1/2 taza)"
const QUANTITY_ALT_RE = /\(([^)]+)\)/;

// Comma-format ingredient: finds quantity+unit anywhere in the line.
// Matches the real Mundo Nutrition format: "Tortilla de harina integral, 64g, 2 piezas"
const COMMA_INGREDIENT_RE = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_PATTERN})\\b`,
  "i"
);

// Footer/garbage lines to skip (URL, timestamp, nutritionist footer)
const GARBAGE_LINE_RE = /^https?:\/\/|\d{2}\/\d{2}\/\d{2},\s*\d+:\d+|^L\.N\.\s|^Document$/i;

// ─── Date Parsing ────────────────────────────────────────────────────────────

/**
 * Parse a Spanish date string such as "18 de Diciembre" into YYYY-MM-DD.
 *
 * Year inference:
 *  - If the plan spans December→January we need to bump the year for January
 *    dates. We handle this by comparing the parsed month to the current month:
 *    if the parsed month is significantly earlier than today it likely belongs
 *    to next year; if significantly later it likely belongs to last year.
 *  - The heuristic uses a ±6-month window, which is sufficient for meal plans
 *    that span at most 3 weeks.
 */
function parseSpanishDate(raw: string, referenceYear?: number): string {
  const normalised = raw.trim().toLowerCase();

  // Match "18 de diciembre" or "18 diciembre"
  const match = normalised.match(/(\d{1,2})\s+(?:de\s+)?([a-záéíóúñ]+)/i);
  if (!match) {
    throw new Error(`Cannot parse date: "${raw}"`);
  }

  const day = parseInt(match[1], 10);
  const monthName = match[2].toLowerCase();
  const monthIndex = SPANISH_MONTHS[monthName];

  if (monthIndex === undefined) {
    throw new Error(`Unknown Spanish month "${match[2]}" in date: "${raw}"`);
  }

  // Determine the year using the reference year (usually current year) and a
  // rolling-window heuristic.
  const base = referenceYear ?? new Date().getFullYear();
  const today = new Date();
  const todayMonth = today.getMonth(); // 0-based

  // If the candidate month is more than 6 months in the future relative to
  // today, it probably belongs to last year (e.g. today is Feb, date is Nov).
  // If the candidate month is more than 6 months in the past, it probably
  // belongs to next year (e.g. today is Nov, date is Jan).
  let year = base;
  const diff = monthIndex - todayMonth;
  if (diff > 6) {
    year = base - 1;
  } else if (diff < -6) {
    year = base + 1;
  }

  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// ─── Comma-format Ingredient Helpers ─────────────────────────────────────────

/**
 * Returns true when a line contains a quantity+unit, indicating it is an
 * ingredient line in the Mundo Nutrition comma format ("Name, 100g, 2 piezas").
 */
function isCommaIngredientLine(line: string): boolean {
  return COMMA_INGREDIENT_RE.test(line);
}

/**
 * Parse an ingredient in the Mundo Nutrition comma format:
 *   "Tortilla de harina integral, 64g, 2 piezas"
 *   "Espinaca, cruda, 30g, ½ taza"
 *   "Yogurt Griego Fage, 170ml, 1 unidad"
 *
 * Strategy: locate the first quantity+unit token anywhere in the string.
 * Everything before it (minus trailing commas/spaces) is the name.
 * Everything after it (minus leading commas/spaces) is the alt quantity.
 */
function parseCommaIngredientLine(text: string): RawIngredient | null {
  const qtyMatch = text.match(COMMA_INGREDIENT_RE);
  if (!qtyMatch) return null;

  const qtyIndex = text.indexOf(qtyMatch[0]);
  const quantity = parseFloat(qtyMatch[1].replace(",", "."));
  const unit = qtyMatch[2].toLowerCase();

  const namePart = text.slice(0, qtyIndex).replace(/[,\s]+$/, "").trim();
  const afterQty = text.slice(qtyIndex + qtyMatch[0].length).replace(/^[,\s]+/, "").trim();
  const quantity_alt = afterQty || null;

  if (!namePart) return null;

  return { name: namePart, quantity, unit, quantity_alt, notes: null };
}

// ─── Ingredient Line Parsing ─────────────────────────────────────────────────

/**
 * Parse a single ingredient line from the PDF text.
 *
 * The PDF formats ingredients in two ways:
 *
 * 1. Inline:  "Agua con limón 250ml"
 *             "Pan de caja integral 60g (2 piezas)"
 *
 * 2. Block (indented under a dish name):
 *             "  Pan de caja integral 60g (2 piezas)"
 *
 * In both cases this function receives the trimmed text of the line and
 * returns a structured RawIngredient.
 *
 * Strategy:
 *   a. Strip a leading bullet "-" or "•".
 *   b. Extract any parenthesised quantity_alt → "(2 piezas)".
 *   c. Tokenise the remainder.
 *   d. Walk tokens right-to-left; greedily consume a quantity token (optional
 *      unit) and treat everything to the left as the name.
 *   e. Notes: text after a comma that doesn't look like a quantity.
 */
function parseIngredientLine(raw: string): RawIngredient {
  let text = raw.trim().replace(/^[-•]\s*/, "");

  // ── Comma-separated format (Mundo Nutrition): "Name, 100g, 2 piezas" ──────
  if (isCommaIngredientLine(text)) {
    const result = parseCommaIngredientLine(text);
    if (result) return result;
  }

  // Extract parenthesised alternative quantity, e.g. "(2 piezas)"
  let quantity_alt: string | null = null;
  const altMatch = text.match(QUANTITY_ALT_RE);
  if (altMatch) {
    quantity_alt = altMatch[1].trim();
    text = text.replace(QUANTITY_ALT_RE, "").trim();
  }

  // Separate notes: text after a comma that follows the main ingredient body,
  // typically used for preparation hints ("sin sal", "cocido", etc.)
  let notes: string | null = null;
  const commaIdx = text.indexOf(",");
  if (commaIdx !== -1) {
    const potentialNotes = text.slice(commaIdx + 1).trim();
    // Only treat as notes if it doesn't look like a unit+quantity string
    if (!QUANTITY_RE.test(potentialNotes.split(/\s+/)[0])) {
      notes = potentialNotes || null;
      text = text.slice(0, commaIdx).trim();
    }
  }

  // Tokenise and walk right-to-left to find the quantity token.
  // We look at the last one or two tokens:
  //   "Pan de caja integral 60g"  → tokens[last] = "60g"
  //   "Leche descremada 200 ml"   → tokens[last-1] = "200", tokens[last] = "ml"
  const tokens = text.split(/\s+/);
  let quantity: number | null = null;
  let unit = "unknown";
  let nameEndIdx = tokens.length; // exclusive index into tokens for the name

  if (tokens.length > 0) {
    const lastToken = tokens[tokens.length - 1];
    const lastMatch = lastToken.match(QUANTITY_RE);

    if (lastMatch) {
      // e.g. "60g" or just "60"
      quantity = parseFloat(lastMatch[1].replace(",", "."));
      unit = lastMatch[2] ? lastMatch[2].toLowerCase() : "unknown";
      nameEndIdx = tokens.length - 1;
    } else if (tokens.length >= 2) {
      // Maybe quantity and unit are separate tokens: "200 ml"
      const secondLast = tokens[tokens.length - 2];
      const twoTokenStr = `${secondLast}${lastToken}`;
      const twoMatch = twoTokenStr.match(QUANTITY_RE);
      if (twoMatch) {
        quantity = parseFloat(twoMatch[1].replace(",", "."));
        unit = twoMatch[2] ? twoMatch[2].toLowerCase() : "unknown";
        nameEndIdx = tokens.length - 2;
      }
    }
  }

  const name = tokens.slice(0, nameEndIdx).join(" ").trim();

  return {
    name: name || text, // fallback: use full text as name if parsing failed
    quantity,
    unit,
    quantity_alt,
    notes,
  };
}

// ─── PDF Text Parsing ────────────────────────────────────────────────────────

/**
 * Internal result from the low-level text parser, before date normalisation.
 */
interface RawParsedDay {
  raw_date_str: string;
  meals: Meal[];
  warnings: string[];
}

/**
 * Determine if a line is a meal-type heading (case-insensitive, trimmed).
 * Returns the canonical MealType or null.
 */
function matchMealType(line: string): MealType | null {
  const trimmed = line.trim();
  for (const mt of MEAL_TYPES) {
    // Use a case-insensitive comparison and allow minor accent differences
    if (trimmed.toLowerCase() === mt.toLowerCase()) {
      return mt;
    }
  }
  return null;
}

/**
 * A line is a "date line" if it looks like "18 de Diciembre" or "5 Mayo".
 * We intentionally keep this strict to avoid mis-classifying ingredient names.
 */
function isDateLine(line: string): boolean {
  return /^\d{1,2}\s+(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i.test(
    line.trim()
  );
}

/**
 * A line is an ingredient line if it starts with a bullet or is indented,
 * OR if it sits inside a known ingredient block (context-sensitive).
 * We use a simple heuristic: indented lines (start with whitespace) or lines
 * that start with "- " / "• ".
 */
function isIngredientLine(line: string): boolean {
  return /^(\s{2,}|[-•]\s)/.test(line);
}

/**
 * Parse raw extracted PDF text into an array of RawParsedDay structures.
 *
 * The Mundo Nutrition PDF layout is:
 *
 *   [Date line]
 *   [Meal heading]
 *   - [Dish / ingredient line]
 *     [Indented ingredient lines...]
 *   [Next meal heading]
 *   ...
 *   [Next date line]
 *
 * State machine:
 *   OUTSIDE_DAY   → waiting for a date line
 *   IN_MEAL       → inside a meal block, reading dishes/ingredients
 */
function parsePDFText(text: string): RawParsedDay[] {
  const lines = text.split(/\r?\n/);
  const days: RawParsedDay[] = [];

  let currentDay: RawParsedDay | null = null;
  let currentMeal: Meal | null = null;
  let currentDish: Dish | null = null;

  // Flush helpers — push the in-progress objects into their parents.
  const flushDish = () => {
    if (currentDish && currentMeal) {
      currentMeal.dishes.push(currentDish);
      currentDish = null;
    }
  };

  const flushMeal = () => {
    flushDish();
    if (currentMeal && currentDay) {
      currentDay.meals.push(currentMeal);
      currentMeal = null;
    }
  };

  const flushDay = () => {
    flushMeal();
    if (currentDay) {
      days.push(currentDay);
      currentDay = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd(); // preserve leading whitespace for indent detection
    const trimmed = line.trim();

    // Skip blank lines
    if (!trimmed) continue;

    // Skip footer/garbage lines (URLs, timestamps, nutritionist attribution)
    if (GARBAGE_LINE_RE.test(trimmed)) continue;

    // ── Date line ────────────────────────────────────────────
    if (isDateLine(trimmed)) {
      flushDay();
      currentDay = {
        raw_date_str: trimmed,
        meals: [],
        warnings: [],
      };
      continue;
    }

    // Everything below requires an active day context.
    if (!currentDay) continue;

    // ── Meal heading ─────────────────────────────────────────
    const mealType = matchMealType(trimmed);
    if (mealType) {
      flushMeal();
      currentMeal = { mealType, dishes: [] };
      continue;
    }

    // Everything below requires an active meal context.
    if (!currentMeal) {
      // Unexpected text between a date and the first meal heading.
      currentDay.warnings.push(`Unexpected line before first meal: "${trimmed}"`);
      continue;
    }

    // ── Dish name line (bullet, not indented beyond 1 space) ─
    // A line starting with "- " that is NOT further indented is a dish name
    // (which may also be a standalone ingredient with a quantity on the same
    // line, e.g. "- Agua con limón 250ml").
    if (/^-\s/.test(raw.trimStart()) && !/^\s{4,}/.test(raw)) {
      // Could be:
      //   a) A dish name only:       "- Sandwich de queso con aguacate"
      //   b) A dish+ingredient:      "- Agua con limón 250ml"
      //
      // Heuristic: if the next non-blank line is indented (ingredient of the
      // dish), treat this as a dish name; otherwise treat it as a lone ingredient.
      flushDish();

      const content = trimmed.replace(/^-\s*/, "").trim();

      // Peek ahead: is the next non-blank line an indented ingredient?
      let nextNonBlank = "";
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim()) {
          nextNonBlank = lines[j];
          break;
        }
      }

      const nextIsIngredient =
        nextNonBlank &&
        (isIngredientLine(nextNonBlank) ||
          /^\s{4,}/.test(nextNonBlank));

      if (nextIsIngredient) {
        // This line is a dish name; sub-ingredients will follow.
        currentDish = { name: content, ingredients: [] };
      } else {
        // Standalone ingredient (no indented children).
        const ingredient = parseIngredientLine(content);
        // Create an anonymous dish to hold this single ingredient so the
        // data model stays consistent.
        const dish: Dish = { name: "", ingredients: [ingredient] };
        currentMeal.dishes.push(dish);
      }
      continue;
    }

    // ── Indented ingredient line ──────────────────────────────
    if (/^\s{2,}/.test(raw) || /^\s*•/.test(raw)) {
      if (!currentDish) {
        // Indented ingredient without a parent dish — attach to an anonymous dish.
        currentDish = { name: "", ingredients: [] };
      }
      const ingredient = parseIngredientLine(trimmed);
      currentDish.ingredients.push(ingredient);
      continue;
    }

    // ── Comma-format ingredient line (Mundo Nutrition format) ──────────────
    // e.g. "Tortilla de harina integral, 64g, 2 piezas"
    if (isCommaIngredientLine(trimmed)) {
      if (!currentDish) {
        currentDish = { name: "", ingredients: [] };
      }
      const ingredient = parseIngredientLine(trimmed);
      currentDish.ingredients.push(ingredient);
      continue;
    }

    // ── Fallback: plain dish name (no bullet needed in this PDF format) ────
    flushDish();
    currentDish = { name: trimmed, ingredients: [] };
  }

  // Flush any open state at end of file.
  flushDay();

  return days;
}

// ─── Confidence Score ────────────────────────────────────────────────────────

/**
 * Calculate a confidence score [0, 1] for a parsed day.
 *
 * Deductions:
 *   - 0.10 per warning
 *   - 0.05 per meal with zero dishes
 *   - 0.03 per ingredient where quantity is null
 *   - 0.15 if fewer than 3 meals found (plan normally has 5-6)
 *   - 0.20 if zero meals found
 *
 * Score is clamped to [0, 1].
 */
function calculateConfidence(day: RawParsedDay): number {
  let score = 1.0;

  score -= day.warnings.length * 0.1;

  if (day.meals.length === 0) {
    score -= 0.2;
  } else if (day.meals.length < 3) {
    score -= 0.15;
  }

  for (const meal of day.meals) {
    if (meal.dishes.length === 0) {
      score -= 0.05;
    }
    for (const dish of meal.dishes) {
      for (const ing of dish.ingredients) {
        if (ing.quantity === null) {
          score -= 0.03;
        }
      }
    }
  }

  return Math.max(0, Math.min(1, score));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Parse a single Mundo Nutrition PDF and return a structured ParsedMealDay.
 *
 * @param filePath  Absolute or relative path to the PDF file.
 * @throws          If the file cannot be read or if no parseable date is found.
 */
export async function parseMealPDF(filePath: string): Promise<ParsedMealDay> {
  const resolvedPath = path.resolve(filePath);

  // ── Read file ───────────────────────────────────────────────
  let fileBuffer: Buffer;
  try {
    fileBuffer = fs.readFileSync(resolvedPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`pdfParser: cannot read file "${resolvedPath}": ${msg}`);
  }

  // ── Extract text via pdf-parse ──────────────────────────────
  let pdfText: string;
  try {
    const data = await pdfParse(fileBuffer);
    pdfText = data.text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `pdfParser: pdf-parse failed for "${resolvedPath}": ${msg}`
    );
  }

  if (!pdfText || pdfText.trim().length === 0) {
    throw new Error(
      `pdfParser: extracted text is empty for "${resolvedPath}". The PDF may be image-only.`
    );
  }

  // ── Parse text ──────────────────────────────────────────────
  let rawDays: RawParsedDay[];
  try {
    rawDays = parsePDFText(pdfText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `pdfParser: text parsing failed for "${resolvedPath}": ${msg}`
    );
  }

  if (rawDays.length === 0) {
    throw new Error(
      `pdfParser: no meal-day blocks found in "${resolvedPath}". ` +
        `The PDF may not be in the expected Mundo Nutrition format.`
    );
  }

  // This service processes one day per PDF. If the PDF contains multiple date
  // blocks, we take the first one and add a warning.
  const rawDay = rawDays[0];
  const extraWarnings: string[] = [];

  if (rawDays.length > 1) {
    extraWarnings.push(
      `PDF contains ${rawDays.length} date blocks; only the first was parsed. ` +
        `Use parsePDFBatch for multi-day PDFs.`
    );
  }

  // ── Normalise date ──────────────────────────────────────────
  let isoDate: string;
  try {
    isoDate = parseSpanishDate(rawDay.raw_date_str);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Don't throw — return a best-effort result with a warning and a fallback date.
    isoDate = new Date().toISOString().slice(0, 10);
    extraWarnings.push(`Date parse error: ${msg}. Defaulted to today.`);
  }

  const allWarnings = [...rawDay.warnings, ...extraWarnings];
  const confidence = calculateConfidence({ ...rawDay, warnings: allWarnings });

  return {
    date: isoDate,
    raw_date_str: rawDay.raw_date_str,
    meals: rawDay.meals,
    parsed_at: new Date().toISOString(),
    confidence,
    warnings: allWarnings,
  };
}

/**
 * Parse multiple Mundo Nutrition PDFs in parallel.
 *
 * Failed individual parses are collected as warnings on a stub ParsedMealDay
 * rather than aborting the entire batch, so the caller always receives an
 * array of the same length as the input.
 *
 * @param filePaths  Array of absolute or relative paths to PDF files.
 */
export async function parsePDFBatch(
  filePaths: string[]
): Promise<ParsedMealDay[]> {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    throw new Error("parsePDFBatch: filePaths must be a non-empty array.");
  }

  // Process all files concurrently; capture errors per-file.
  const results = await Promise.allSettled(
    filePaths.map((fp) => parseMealPDF(fp))
  );

  return results.map((result, idx) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    // Build a stub result for failed files so callers can inspect errors
    // without losing the rest of the batch.
    const errorMsg =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);

    const stubDay: ParsedMealDay = {
      date: new Date().toISOString().slice(0, 10),
      raw_date_str: "",
      meals: [],
      parsed_at: new Date().toISOString(),
      confidence: 0,
      warnings: [
        `parsePDFBatch: failed to parse file [${idx}] "${filePaths[idx]}": ${errorMsg}`,
      ],
    };

    return stubDay;
  });
}
