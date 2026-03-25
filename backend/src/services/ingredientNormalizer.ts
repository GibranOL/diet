// ============================================================
// ingredientNormalizer.ts
// Normalizes and deduplicates ingredient names across meal plans
// using fuzzy matching (fuse.js) and keyword-based categorization.
// ============================================================

import Fuse from "fuse.js";
import { v4 as uuidv4 } from "uuid";
import type {
  ParsedMealDay,
  MasterIngredient,
  NormalizedIngredientRegistry,
  IngredientCategory,
  UnitStandard,
  StorageLocation,
  ShelfLife,
} from "../types/index";

// ─── Keyword Maps ────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<IngredientCategory, string[]> = {
  Lácteos: ["queso", "leche", "yogur", "crema", "mantequilla", "mantecilla", "kefir"],
  Proteínas: [
    "carne",
    "pollo",
    "pechuga",
    "filete",
    "res",
    "cerdo",
    "huevo",
    "atún",
    "atun",
    "salmón",
    "salmon",
    "camarón",
    "camaron",
    "jamón",
    "jamon",
    "tocino",
    "pescado",
    "filete de pescado",
    "tilapia",
    "trucha",
    "sardina",
    "pulpo",
    "pavo",
    "cordero",
  ],
  Granos: [
    "arroz",
    "pan",
    "tortilla",
    "avena",
    "pasta",
    "cereal",
    "granola",
    "quinoa",
    "maíz",
    "maiz",
    "harina",
    "galleta",
    "fideo",
    "espagueti",
    "lentejas",
    "frijol",
    "garbanzo",
  ],
  Frutas: [
    "manzana",
    "plátano",
    "platano",
    "piña",
    "pina",
    "naranja",
    "uva",
    "fresa",
    "mango",
    "pera",
    "melón",
    "melon",
    "sandía",
    "sandia",
    "durazno",
    "kiwi",
    "papaya",
    "guayaba",
    "ciruela",
    "chabacano",
    "higo",
    "mamey",
    "limón",
    "limon",
    "mandarina",
    "cereza",
    "frambuesa",
    "arándano",
    "arandano",
  ],
  // Bebidas must come before Lácteos in evaluation order (handled in suggestCategory)
  Bebidas: [
    "agua",
    "jugo",
    "refresco",
    "té",
    "te",
    "café",
    "cafe",
    "bebida",
    "leche de almendra",
    "leche de avena",
    "leche de coco",
    "proteína en polvo",
    "proteina en polvo",
  ],
  Verduras: [
    "zanahoria",
    "brócoli",
    "brocoli",
    "espinaca",
    "tomate",
    "pepino",
    "lechuga",
    "cebolla",
    "ajo",
    "papa",
    "papas",
    "camote",
    "calabaza",
    "chayote",
    "ejote",
    "chile",
    "pimiento",
    "betabel",
    "apio",
    "alcachofa",
    "espárrago",
    "esparrago",
    "champiñon",
    "champiñón",
    "hongos",
    "coliflor",
    "col",
    "nopales",
    "nopal",
    "elote",
    "verdura",
    "vegetal",
    "acelga",
    "rábano",
    "rabano",
    "berro",
    "perejil",
    "cilantro",
    "albahaca",
  ],
  Otros: [],
};

// ─── Shelf Life Defaults ─────────────────────────────────────

const SHELF_LIFE_DEFAULTS: Record<IngredientCategory, ShelfLife> = {
  Proteínas: { fridge_days: 3, freezer_days: 30, pantry_days: null },
  Verduras: { fridge_days: 6, freezer_days: null, pantry_days: null },
  Lácteos: { fridge_days: 8, freezer_days: null, pantry_days: null },
  Frutas: { fridge_days: 5, freezer_days: null, pantry_days: 3 },
  Granos: { fridge_days: null, freezer_days: null, pantry_days: 60 },
  Bebidas: { fridge_days: 5, freezer_days: null, pantry_days: 30 },
  Otros: { fridge_days: 7, freezer_days: null, pantry_days: 30 },
};

// ─── Unit Standards ───────────────────────────────────────────

const UNIT_BY_CATEGORY: Record<IngredientCategory, UnitStandard> = {
  Proteínas: "g",
  Lácteos: "g",
  Granos: "g",
  Verduras: "g",
  Bebidas: "ml",
  Frutas: "unidad",
  Otros: "g",
};

// ─── Storage Locations ────────────────────────────────────────

const STORAGE_BY_CATEGORY: Record<IngredientCategory, StorageLocation> = {
  Granos: "Despensa",
  Otros: "Despensa",
  Proteínas: "Nevera",
  Lácteos: "Nevera",
  Verduras: "Nevera",
  Frutas: "Nevera",
  Bebidas: "Nevera",
};

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Normalizes a raw ingredient name to a lowercase, accent-stripped, trimmed string
 * suitable for matching and indexing.
 */
function normalizeString(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .replace(/\s+/g, " ");
}

/**
 * Derives perishable flag: true when fridge_days is not null and < 7.
 */
function derivePerishable(shelfLife: ShelfLife): boolean {
  return shelfLife.fridge_days !== null && shelfLife.fridge_days < 7;
}

/**
 * Builds a MasterIngredient from a canonical name with all derived defaults.
 */
function buildMasterIngredient(canonicalName: string): MasterIngredient {
  const category = suggestCategory(canonicalName);
  const shelfLife = SHELF_LIFE_DEFAULTS[category];

  return {
    id: uuidv4(),
    canonical_name: canonicalName,
    category,
    aliases: [],
    unit_standard: UNIT_BY_CATEGORY[category],
    shelf_life: { ...shelfLife },
    storage_location: STORAGE_BY_CATEGORY[category],
    perishable: derivePerishable(shelfLife),
    nutrition_notes: null,
    last_updated: new Date().toISOString(),
  };
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Suggests an IngredientCategory for an ingredient name using keyword matching.
 * Evaluation order matters: Bebidas compound phrases are checked before Lácteos
 * to correctly classify "leche de almendra" as Bebidas rather than Lácteos.
 */
export function suggestCategory(ingredientName: string): IngredientCategory {
  try {
    const normalized = normalizeString(ingredientName);

    // Ordered evaluation: check compound Bebidas phrases first to avoid
    // "leche de almendra" being caught by the generic Lácteos "leche" keyword.
    const orderedCategories: IngredientCategory[] = [
      "Bebidas",
      "Proteínas",
      "Lácteos",
      "Granos",
      "Frutas",
      "Verduras",
      "Otros",
    ];

    for (const category of orderedCategories) {
      const keywords = CATEGORY_KEYWORDS[category];
      for (const keyword of keywords) {
        const normalizedKeyword = normalizeString(keyword);
        // Use word boundaries to avoid "te" matching "aceite", "filete", etc.
        const wordRe = new RegExp(`\\b${normalizedKeyword}\\b`);
        if (wordRe.test(normalized)) {
          return category;
        }
      }
    }

    return "Otros";
  } catch (error) {
    console.error(
      `[ingredientNormalizer] suggestCategory error for "${ingredientName}":`,
      error
    );
    return "Otros";
  }
}

/**
 * Deduplicates an ingredient name against an existing registry using fuzzy matching.
 * If a sufficiently similar canonical ingredient already exists, returns its id.
 * Otherwise creates a new MasterIngredient entry in the registry and returns the new id.
 *
 * @param name               - Raw ingredient name to look up or register.
 * @param existingRegistry   - The registry to search and potentially mutate.
 * @returns The canonical ingredient id (existing or newly created).
 */
export function deduplicateIngredient(
  name: string,
  existingRegistry: NormalizedIngredientRegistry
): string {
  try {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error("Ingredient name must not be empty.");
    }

    // Fast-path: exact mapping already exists.
    if (existingRegistry.ingredient_mapping[trimmedName] !== undefined) {
      return existingRegistry.ingredient_mapping[trimmedName];
    }

    const masters = existingRegistry.master_ingredients;

    if (masters.length === 0) {
      // Registry is empty — create the first entry.
      const newIngredient = buildMasterIngredient(trimmedName);
      existingRegistry.master_ingredients.push(newIngredient);
      existingRegistry.ingredient_mapping[trimmedName] = newIngredient.id;
      existingRegistry.new_ingredients_found += 1;
      return newIngredient.id;
    }

    // Build fuzzy search index over canonical names (normalised for matching).
    const fuseItems = masters.map((m) => ({
      id: m.id,
      normalized: normalizeString(m.canonical_name),
    }));

    const fuse = new Fuse(fuseItems, {
      keys: ["normalized"],
      threshold: 0.3,
      includeScore: true,
    });

    const results = fuse.search(normalizeString(trimmedName));

    if (results.length > 0 && results[0].score !== undefined && results[0].score <= 0.3) {
      // Match found — register alias if not already present.
      const matchedId = results[0].item.id;
      const masterEntry = masters.find((m) => m.id === matchedId);

      if (masterEntry && !masterEntry.aliases.includes(trimmedName)) {
        masterEntry.aliases.push(trimmedName);
        masterEntry.last_updated = new Date().toISOString();
      }

      existingRegistry.ingredient_mapping[trimmedName] = matchedId;
      return matchedId;
    }

    // No match — register as a new canonical ingredient.
    const newIngredient = buildMasterIngredient(trimmedName);
    existingRegistry.master_ingredients.push(newIngredient);
    existingRegistry.ingredient_mapping[trimmedName] = newIngredient.id;
    existingRegistry.new_ingredients_found += 1;
    return newIngredient.id;
  } catch (error) {
    console.error(
      `[ingredientNormalizer] deduplicateIngredient error for "${name}":`,
      error
    );
    // Fallback: create a new entry to avoid data loss.
    const fallback = buildMasterIngredient(name.trim() || "desconocido");
    existingRegistry.master_ingredients.push(fallback);
    existingRegistry.ingredient_mapping[name] = fallback.id;
    existingRegistry.new_ingredients_found += 1;
    return fallback.id;
  }
}

/**
 * Normalizes all ingredients across a list of ParsedMealDay objects.
 * Returns a NormalizedIngredientRegistry with deduplicated MasterIngredient entries,
 * a complete raw-name → id mapping, and confidence/statistics metadata.
 *
 * @param parsedMeals - Array of parsed meal day objects (from PDF parser output).
 * @returns A fully populated NormalizedIngredientRegistry.
 */
export function normalizeIngredients(
  parsedMeals: ParsedMealDay[]
): NormalizedIngredientRegistry {
  const registry: NormalizedIngredientRegistry = {
    master_ingredients: [],
    ingredient_mapping: {},
    new_ingredients_found: 0,
    standardization_confidence: 0,
  };

  try {
    if (!Array.isArray(parsedMeals) || parsedMeals.length === 0) {
      registry.standardization_confidence = 1.0;
      return registry;
    }

    let totalRawIngredients = 0;
    let exactMatchCount = 0;

    for (const day of parsedMeals) {
      try {
        if (!day.meals || !Array.isArray(day.meals)) continue;

        for (const meal of day.meals) {
          try {
            if (!meal.dishes || !Array.isArray(meal.dishes)) continue;

            for (const dish of meal.dishes) {
              try {
                if (!dish.ingredients || !Array.isArray(dish.ingredients)) continue;

                for (const ingredient of dish.ingredients) {
                  try {
                    const rawName = ingredient.name?.trim();
                    if (!rawName) continue;

                    totalRawIngredients += 1;
                    const wasAlreadyMapped =
                      registry.ingredient_mapping[rawName] !== undefined;

                    deduplicateIngredient(rawName, registry);

                    if (wasAlreadyMapped) {
                      exactMatchCount += 1;
                    }
                  } catch (ingredientError) {
                    console.error(
                      "[ingredientNormalizer] Error processing ingredient:",
                      ingredientError
                    );
                  }
                }
              } catch (dishError) {
                console.error(
                  "[ingredientNormalizer] Error processing dish:",
                  dishError
                );
              }
            }
          } catch (mealError) {
            console.error(
              "[ingredientNormalizer] Error processing meal:",
              mealError
            );
          }
        }
      } catch (dayError) {
        console.error(
          "[ingredientNormalizer] Error processing day:",
          dayError
        );
      }
    }

    // Standardization confidence: ratio of deduplicated to total raw ingredients.
    // Higher value → more reuse / successful deduplication across the meal plan.
    if (totalRawIngredients > 0) {
      const uniqueCount = registry.master_ingredients.length;
      // Score = 1 - (unique / total): more merging = higher confidence.
      // Clamped to [0, 1]. When all names are unique the score is 0 (no merging done);
      // when all names collapse to one entry the score approaches 1.
      // We blend with a base confidence of 0.5 to avoid a misleadingly low score
      // for small meal plans where uniqueness is genuinely expected.
      const deduplicationRatio =
        totalRawIngredients > 0
          ? 1 - uniqueCount / totalRawIngredients
          : 0;
      registry.standardization_confidence = Math.min(
        1,
        Math.max(0, 0.5 + deduplicationRatio * 0.5)
      );
    } else {
      registry.standardization_confidence = 1.0;
    }

    return registry;
  } catch (error) {
    console.error(
      "[ingredientNormalizer] normalizeIngredients fatal error:",
      error
    );
    // Return whatever was built before the error occurred.
    registry.standardization_confidence = 0;
    return registry;
  }
}
