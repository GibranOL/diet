// ============================================================
// Shopping List Generator Service — Dieta App
// Generates optimized shopping lists from 21-day meal plans
// ============================================================

import { v4 as uuidv4 } from "uuid";
import type {
  ParsedMealDay,
  InventoryItem,
  ShoppingListOutput,
  ShoppingList,
  ShoppingCategory,
  ShoppingItem,
  InventoryGap,
  BuyStrategy,
  IngredientCategory,
} from "../types/index";

// ─── Constants ───────────────────────────────────────────────

const CATEGORY_ORDER: IngredientCategory[] = [
  "Verduras",
  "Frutas",
  "Proteínas",
  "Lácteos",
  "Granos",
  "Bebidas",
  "Otros",
];

// Days before usage date at which a perishable item cannot safely be purchased
// (shelf life window too short to cover the gap)
const EARLY_BUY_WARNING_THRESHOLD_DAYS = 1; // if shelf life < gap to usage, warn

// ─── Internal Interfaces ─────────────────────────────────────

interface AggregatedIngredient {
  ingredient_id: string;
  canonical_name: string;
  unit: string;
  category: IngredientCategory;
  perishable: boolean;
  pantry_days: number | null;
  fridge_days: number | null;
  total_quantity_needed: number;
  usage_dates: string[]; // YYYY-MM-DD, sorted ascending
  frequency: string; // human-readable usage frequency
}

interface IngredientUsage {
  date: string; // YYYY-MM-DD
  quantity: number;
  unit: string;
}

// Minimal ingredient metadata embedded in raw ingredient names when no master
// record is found — we fall back to safe defaults.
interface ResolvedMeta {
  category: IngredientCategory;
  perishable: boolean;
  pantry_days: number | null;
  fridge_days: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Parse a YYYY-MM-DD string into a Date (midnight UTC).
 */
function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Compute the number of whole days between two YYYY-MM-DD strings.
 * Returns a positive number when `to` is after `from`.
 */
function daysBetween(from: string, to: string): number {
  const msPerDay = 86_400_000;
  return Math.round(
    (parseDate(to).getTime() - parseDate(from).getTime()) / msPerDay
  );
}

/**
 * Add `n` days to a YYYY-MM-DD string and return the resulting YYYY-MM-DD.
 */
function addDays(dateStr: string, n: number): string {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Determine the buy strategy for an item.
 */
function determineBuyStrategy(
  perishable: boolean,
  pantry_days: number | null
): BuyStrategy {
  if (perishable) {
    return "Compra cuando vayas a cocinar (perecedero)";
  }
  if (pantry_days !== null && pantry_days > 30) {
    return "Compra en cantidad (no perecedero)";
  }
  return "Compra con anticipación";
}

/**
 * Heuristic: infer shelf-life metadata from the ingredient name when no
 * master record is available.  This keeps the generator self-contained and
 * avoids hard-coded ingredient databases.
 */
function inferMeta(name: string): ResolvedMeta {
  const lower = name.toLowerCase();

  const isVerdura =
    /espinaca|lechuga|brócoli|brocoli|zanahoria|tomate|cebolla|ajo|pimiento|chile|coliflor|acelga|apio|pepino|calabaza|nopales|verdura/i.test(
      lower
    );
  const isFruta =
    /manzana|plátano|platano|naranja|fresa|mango|piña|uva|kiwi|pera|durazno|guayaba|papaya|ciruela|chabacano|fruta/i.test(
      lower
    );
  const isProteina =
    /pollo|res|carne|cerdo|pavo|atún|atun|salmón|salmon|huevo|tofu|tempeh|proteina|pescado|tilapia|trucha|sardina|camaron|camarón|pulpo/i.test(
      lower
    );
  const isLacteo =
    /leche|queso|yogur|crema|mantequilla|lacteo|lácteo/i.test(lower);
  const isGrano =
    /arroz|avena|pasta|frijol|lenteja|garbanzo|quinoa|pan|tortilla|cereal|harina|granos/i.test(
      lower
    );
  const isBebida = /agua|jugo|\bté\b|\bte\b|\bcafe\b|\bcafé\b|refresco|bebida/i.test(lower);

  if (isVerdura)
    return { category: "Verduras", perishable: true, pantry_days: null, fridge_days: 7 };
  if (isFruta)
    return { category: "Frutas", perishable: true, pantry_days: 5, fridge_days: 10 };
  if (isProteina)
    return { category: "Proteínas", perishable: true, pantry_days: null, fridge_days: 3 };
  if (isLacteo)
    return { category: "Lácteos", perishable: true, pantry_days: null, fridge_days: 7 };
  if (isGrano)
    return { category: "Granos", perishable: false, pantry_days: 180, fridge_days: null };
  if (isBebida)
    return { category: "Bebidas", perishable: false, pantry_days: 365, fridge_days: null };

  return { category: "Otros", perishable: false, pantry_days: 30, fridge_days: null };
}

/**
 * Determine the effective shelf life in days given the purchase strategy.
 * Returns null when no relevant shelf-life data is available.
 */
function effectiveShelfLife(meta: ResolvedMeta): number | null {
  // For perishables we use fridge as the primary storage after purchase.
  if (meta.perishable && meta.fridge_days !== null) return meta.fridge_days;
  if (meta.pantry_days !== null) return meta.pantry_days;
  return null;
}

/**
 * Build a human-readable frequency string from usage dates.
 */
function buildFrequencyLabel(usageDates: string[]): string {
  const count = usageDates.length;
  if (count === 1) return "1 vez en el plan";
  if (count <= 3) return `${count} veces en el plan`;
  return `${count} veces en el plan (frecuente)`;
}

// ─── Step 1: Aggregate Consumption ───────────────────────────

/**
 * Scan all meal days, extract every ingredient usage, and aggregate totals
 * keyed by canonical name (lower-cased).  We also track usage dates for
 * shelf-life badge logic.
 */
function aggregateConsumption(
  mealDays: ParsedMealDay[]
): Map<string, AggregatedIngredient> {
  const map = new Map<string, AggregatedIngredient>();

  for (const day of mealDays) {
    for (const meal of day.meals) {
      for (const dish of meal.dishes) {
        for (const ing of dish.ingredients) {
          const key = ing.name.trim().toLowerCase();
          const qty = ing.quantity ?? 0;

          if (!map.has(key)) {
            const meta = inferMeta(ing.name);
            map.set(key, {
              ingredient_id: key.replace(/\s+/g, "_"),
              canonical_name: ing.name.trim(),
              unit: ing.unit || "unidad",
              category: meta.category,
              perishable: meta.perishable,
              pantry_days: meta.pantry_days,
              fridge_days: meta.fridge_days,
              total_quantity_needed: 0,
              usage_dates: [],
              frequency: "",
            });
          }

          const agg = map.get(key)!;
          agg.total_quantity_needed += qty;
          if (day.date && !agg.usage_dates.includes(day.date)) {
            agg.usage_dates.push(day.date);
          }
          // Keep the most specific unit (non-empty wins)
          if (!agg.unit && ing.unit) agg.unit = ing.unit;
        }
      }
    }
  }

  // Finalize usage dates sort and frequency label
  for (const agg of map.values()) {
    agg.usage_dates.sort();
    agg.frequency = buildFrequencyLabel(agg.usage_dates);
  }

  return map;
}

// ─── Step 2: Deduct Inventory ─────────────────────────────────

interface NetIngredient extends AggregatedIngredient {
  quantity_in_inventory: number;
  quantity_to_buy: number;
}

function deductInventory(
  aggregated: Map<string, AggregatedIngredient>,
  inventory: InventoryItem[]
): Map<string, NetIngredient> {
  const result = new Map<string, NetIngredient>();

  for (const [key, agg] of aggregated.entries()) {
    // Look up by canonical_name (case-insensitive) or ingredient_id
    const invItem = inventory.find(
      (i) =>
        i.canonical_name.trim().toLowerCase() === key ||
        i.ingredient_id === agg.ingredient_id
    );

    const inInventory = invItem?.quantity_remaining ?? 0;
    const toBuy = Math.max(0, agg.total_quantity_needed - inInventory);

    result.set(key, {
      ...agg,
      quantity_in_inventory: inInventory,
      quantity_to_buy: toBuy,
    });
  }

  return result;
}

// ─── Step 3: Identify Inventory Gaps ─────────────────────────

function buildInventoryGaps(
  netMap: Map<string, NetIngredient>
): InventoryGap[] {
  const gaps: InventoryGap[] = [];

  for (const net of netMap.values()) {
    if (net.quantity_in_inventory === 0 && net.total_quantity_needed > 0) {
      gaps.push({
        ingredient: net.canonical_name,
        reason: `No hay existencias de "${net.canonical_name}" y se necesitan ${net.total_quantity_needed} ${net.unit} en el plan.`,
        action: "MUST_BUY",
      });
    }
  }

  return gaps;
}

// ─── Step 4: Assign Days to Shopping Sessions ─────────────────

/**
 * For each shopping date, determine which meal-plan days it covers.
 * A session covers all days from its own date up to (but not including) the
 * next shopping date.  Days before the first shopping date are folded into
 * the first session.
 */
function assignDaysToSessions(
  mealDays: ParsedMealDay[],
  shoppingDates: string[]
): Map<string, string[]> {
  const sorted = [...shoppingDates].sort();
  const sessionDays = new Map<string, string[]>();

  for (const sd of sorted) {
    sessionDays.set(sd, []);
  }

  for (const day of mealDays) {
    const dayDate = day.date;
    // Find the last shopping date that is <= dayDate
    let assignedSession: string | null = null;
    for (const sd of sorted) {
      if (sd <= dayDate) {
        assignedSession = sd;
      }
    }
    // If the day is before all shopping dates, assign to first session
    if (!assignedSession) {
      assignedSession = sorted[0];
    }
    if (assignedSession) {
      sessionDays.get(assignedSession)!.push(dayDate);
    }
  }

  return sessionDays;
}

// ─── Step 5: Build Per-Session Shopping Lists ─────────────────

function buildShoppingLists(
  netMap: Map<string, NetIngredient>,
  shoppingDates: string[],
  mealDays: ParsedMealDay[]
): ShoppingList[] {
  const sorted = [...shoppingDates].sort();
  const sessionDays = assignDaysToSessions(mealDays, sorted);

  // Collect all meal-plan dates for day-number mapping
  const allPlanDates = mealDays.map((d) => d.date).sort();
  const planStartDate = allPlanDates[0] ?? sorted[0];

  const lists: ShoppingList[] = [];

  for (let si = 0; si < sorted.length; si++) {
    const sessionDate = sorted[si];
    const nextSessionDate = sorted[si + 1] ?? null;
    const daysInSession = sessionDays.get(sessionDate) ?? [];

    // Translate dates to day numbers (1-indexed from plan start)
    const dayNumbers = daysInSession
      .map((d) => daysBetween(planStartDate, d) + 1)
      .sort((a, b) => a - b);

    // Items needed for this session: any item whose earliest usage_date falls
    // within this session's date range.
    const sessionItems: ShoppingItem[] = [];
    const warnings: string[] = [];

    for (const net of netMap.values()) {
      if (net.quantity_to_buy <= 0) continue;

      // Determine if this item has at least one usage date in this session
      const usagesInSession = net.usage_dates.filter((ud) => {
        const inWindow =
          ud >= sessionDate &&
          (nextSessionDate === null || ud < nextSessionDate);
        return inWindow;
      });

      if (usagesInSession.length === 0) continue;

      const earliestUsage = usagesInSession[0];
      const gapToUsage = daysBetween(sessionDate, earliestUsage); // days from shop to first use
      const shelfLife = effectiveShelfLife({
        category: net.category,
        perishable: net.perishable,
        pantry_days: net.pantry_days,
        fridge_days: net.fridge_days,
      });

      let badge: ShoppingItem["badge"] = null;

      // EARLY_BUY_WARNING: item purchased today might expire before usage
      if (shelfLife !== null && shelfLife < gapToUsage) {
        badge = "EARLY_BUY_WARNING";
        warnings.push(
          `"${net.canonical_name}": vida útil (${shelfLife}d) menor que días hasta su uso (${gapToUsage}d). Comprar más cerca de la fecha.`
        );
      }

      // WASTE_RISK: buying on this date, item expires before earliest usage
      if (shelfLife !== null) {
        const expiryDateIfBoughtToday = addDays(sessionDate, shelfLife);
        if (expiryDateIfBoughtToday < earliestUsage) {
          badge = "WASTE_RISK";
          warnings.push(
            `"${net.canonical_name}": si se compra el ${sessionDate}, vence el ${expiryDateIfBoughtToday} antes de usarse el ${earliestUsage}. Riesgo de desperdicio.`
          );
        }
      }

      const buyStrategy = determineBuyStrategy(net.perishable, net.pantry_days);

      // Quantity to buy for this session only (proportional to usages in window)
      const sessionFraction =
        net.usage_dates.length > 0
          ? usagesInSession.length / net.usage_dates.length
          : 1;
      const sessionQuantityToBuy = parseFloat(
        (net.quantity_to_buy * sessionFraction).toFixed(3)
      );
      const sessionQuantityNeeded = parseFloat(
        (net.total_quantity_needed * sessionFraction).toFixed(3)
      );
      const sessionInventoryUsed = parseFloat(
        (net.quantity_in_inventory * sessionFraction).toFixed(3)
      );

      sessionItems.push({
        ingredient_id: net.ingredient_id,
        canonical_name: net.canonical_name,
        quantity_needed_total: sessionQuantityNeeded,
        quantity_in_inventory: sessionInventoryUsed,
        quantity_to_buy: sessionQuantityToBuy,
        unit: net.unit,
        frequency: net.frequency,
        buy_strategy: buyStrategy,
        notes: badge === "WASTE_RISK" || badge === "EARLY_BUY_WARNING"
          ? `Revisar fecha de caducidad al comprar.`
          : null,
        badge,
      });
    }

    // Group by category in defined order
    const byCategory: ShoppingCategory[] = [];
    for (const cat of CATEGORY_ORDER) {
      const catItems = sessionItems.filter((i) => {
        // Re-derive category from netMap
        const net = netMap.get(i.canonical_name.trim().toLowerCase());
        return net?.category === cat;
      });
      if (catItems.length === 0) continue;
      byCategory.push({
        category: cat,
        items: catItems,
      });
    }

    // Critical items: perishables needed within 3 days of this session
    const criticalCount = sessionItems.filter((item) => {
      const net = netMap.get(item.canonical_name.trim().toLowerCase());
      if (!net?.perishable) return false;
      const earliest = net.usage_dates.find(
        (ud) =>
          ud >= sessionDate &&
          (nextSessionDate === null || ud < nextSessionDate)
      );
      if (!earliest) return false;
      return daysBetween(sessionDate, earliest) <= 3;
    }).length;

    // Deduplicate warnings
    const uniqueWarnings = [...new Set(warnings)];

    lists.push({
      shopping_session_id: uuidv4(),
      shopping_date: sessionDate,
      days_covered: dayNumbers,
      by_category: byCategory,
      summary: {
        total_items: sessionItems.length,
        critical_items: criticalCount,
        warnings: uniqueWarnings,
      },
    });
  }

  return lists;
}

// ─── Exported: optimizeShoppingOrder ─────────────────────────

/**
 * Sort items within each category by perishability (most perishable first).
 * Within the same perishability level, sort by effective shelf life ascending
 * (shortest shelf life comes first — buy these last / use first).
 */
export function optimizeShoppingOrder(list: ShoppingList): ShoppingList {
  try {
    const optimizedCategories: ShoppingCategory[] = list.by_category.map(
      (cat) => {
        const sorted = [...cat.items].sort((a, b) => {
          const metaA = inferMeta(a.canonical_name);
          const metaB = inferMeta(b.canonical_name);

          // Perishable first
          if (metaA.perishable !== metaB.perishable) {
            return metaA.perishable ? -1 : 1;
          }

          // Among equally perishable: sort by shortest effective shelf life first
          const slA = effectiveShelfLife(metaA) ?? Number.MAX_SAFE_INTEGER;
          const slB = effectiveShelfLife(metaB) ?? Number.MAX_SAFE_INTEGER;
          if (slA !== slB) return slA - slB;

          // Alphabetical fallback
          return a.canonical_name.localeCompare(b.canonical_name, "es");
        });
        return { ...cat, items: sorted };
      }
    );

    return { ...list, by_category: optimizedCategories };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error in optimizeShoppingOrder";
    throw new Error(`optimizeShoppingOrder failed: ${message}`);
  }
}

// ─── Exported: generateShoppingLists ─────────────────────────

export function generateShoppingLists(
  mealDays: ParsedMealDay[],
  currentInventory: InventoryItem[],
  shoppingDates: string[]
): ShoppingListOutput {
  try {
    if (!mealDays || mealDays.length === 0) {
      throw new Error("mealDays must be a non-empty array.");
    }
    if (!shoppingDates || shoppingDates.length === 0) {
      throw new Error("shoppingDates must be a non-empty array.");
    }

    // 1. Aggregate total consumption across all days
    const aggregated = aggregateConsumption(mealDays);

    // 2. Deduct current inventory
    const netMap = deductInventory(aggregated, currentInventory);

    // 3. Identify items with zero inventory coverage
    const inventoryGaps = buildInventoryGaps(netMap);

    // 4 & 5. Build per-session lists with shelf-life flags
    const shoppingLists = buildShoppingLists(netMap, shoppingDates, mealDays);

    // 6. Collect cross-list optimization notes
    const totalSessions = shoppingLists.length;
    const totalWarnings = shoppingLists.reduce(
      (sum, sl) => sum + sl.summary.warnings.length,
      0
    );
    const totalGaps = inventoryGaps.length;

    const optimizationNotes = [
      `Se generaron ${totalSessions} sesiones de compra.`,
      totalGaps > 0
        ? `${totalGaps} ingredientes no tienen existencias en inventario y deben comprarse.`
        : "Todos los ingredientes necesarios tienen cobertura parcial o total en inventario.",
      totalWarnings > 0
        ? `${totalWarnings} advertencia(s) de vida útil detectadas. Revisar la lista antes de comprar.`
        : "Sin advertencias de vida útil.",
      "Orden sugerido dentro de cada categoría: perecederos primero (usar antes), no perecederos al final.",
    ].join(" ");

    return {
      shopping_lists: shoppingLists,
      inventory_gaps: inventoryGaps,
      optimization_notes: optimizationNotes,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error in generateShoppingLists";
    throw new Error(`generateShoppingLists failed: ${message}`);
  }
}
