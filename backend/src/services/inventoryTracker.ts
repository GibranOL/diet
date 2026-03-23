// ============================================================
// inventoryTracker.ts — Dieta App
// Tracks kitchen inventory: quantities, expiry, consumption,
// and waste prediction across the 21-day meal plan.
// ============================================================

import type {
  Purchase,
  ConsumptionLog,
  InventoryItem,
  InventoryAlert,
  WastePrediction,
  ParsedMealDay,
  InventoryStatus,
  AlertSeverity,
  AlertType,
  AlertAction,
  UpcomingMealUsage,
  ConsumptionEstimate,
} from "../types/index";

// ─── Internal helpers ────────────────────────────────────────

/**
 * Returns the number of whole days between today (UTC midnight) and
 * the given ISO date string (YYYY-MM-DD).  Negative values mean the
 * date is already in the past.
 */
function calcDaysUntilExpiry(expiryDateStr: string): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const expiry = new Date(expiryDateStr);
  expiry.setUTCHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - today.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Maps a days_until_expiry value to the appropriate InventoryStatus.
 */
function resolveStatus(daysUntilExpiry: number): InventoryStatus {
  if (daysUntilExpiry > 5) return "OK";
  if (daysUntilExpiry >= 3) return "USE_NEXT";
  if (daysUntilExpiry >= 1) return "EXPIRING_SOON";
  return "EXPIRED";
}

/**
 * Adds shelf-life days to a purchase date and returns YYYY-MM-DD string.
 */
function calcExpiryDate(purchaseDateStr: string, shelfLifeDays: number): string {
  const d = new Date(purchaseDateStr);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + shelfLifeDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Collects every future usage of an ingredient (by id) across all
 * upcoming meal days, returning an array of UpcomingMealUsage entries.
 * "quantity_needed" defaults to 1 when exact data is unavailable (the
 * raw ingredient quantity may be null per the schema).
 */
function collectUpcomingUsages(
  ingredientId: string,
  canonicalName: string,
  upcomingMeals: ParsedMealDay[]
): UpcomingMealUsage[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const usages: UpcomingMealUsage[] = [];

  for (const day of upcomingMeals) {
    const mealDate = new Date(day.date);
    mealDate.setUTCHours(0, 0, 0, 0);
    if (mealDate < today) continue;

    for (const meal of day.meals) {
      for (const dish of meal.dishes) {
        for (const ing of dish.ingredients) {
          // Match by canonical name (case-insensitive) since we don't
          // embed ingredient_id inside RawIngredient.
          if (ing.name.toLowerCase() === canonicalName.toLowerCase()) {
            usages.push({
              meal_date: day.date,
              meal_type: meal.mealType,
              quantity_needed: ing.quantity ?? 1,
              unit: ing.unit,
            });
          }
        }
      }
    }
  }

  return usages;
}

/**
 * Builds a simple ConsumptionEstimate from current stock and upcoming
 * usages, relative to the item's expiry date.
 */
function buildConsumptionEstimate(
  item: Pick<InventoryItem, "quantity_remaining" | "expiry_date" | "used_in_upcoming_meals">
): ConsumptionEstimate {
  const usages = item.used_in_upcoming_meals;

  if (usages.length === 0) {
    return {
      days_of_supply: 0,
      will_expire_before_use: true,
      recommendation:
        "No upcoming meals use this item. Consider consuming or freezing it before it expires.",
    };
  }

  // Sum all quantities needed across upcoming meals
  const totalNeeded = usages.reduce((sum, u) => sum + u.quantity_needed, 0);

  // Rough days of supply: how many full "use cycles" the remaining stock covers
  const avgPerUse = totalNeeded / usages.length;
  const daysOfSupply =
    avgPerUse > 0 ? Math.floor(item.quantity_remaining / avgPerUse) : 0;

  // Last meal that uses this item
  const sortedDates = usages
    .map((u) => u.meal_date)
    .sort((a, b) => (a > b ? 1 : -1));
  const lastUsageDate = sortedDates[sortedDates.length - 1];

  const willExpireBeforeUse = item.expiry_date < lastUsageDate;

  const recommendation = willExpireBeforeUse
    ? `Item expires on ${item.expiry_date} before last planned use on ${lastUsageDate}. Reorganize meals to use it earlier.`
    : `Sufficient stock for ${usages.length} upcoming meal(s). Last use scheduled on ${lastUsageDate}.`;

  return {
    days_of_supply: daysOfSupply,
    will_expire_before_use: willExpireBeforeUse,
    recommendation,
  };
}

// ─── Exported service functions ──────────────────────────────

/**
 * Adds or updates an inventory item based on a new purchase.
 * If the ingredient already exists it increases quantity_remaining and
 * refreshes expiry; otherwise it creates a new item with sensible
 * defaults.
 */
export function updateInventory(
  purchase: Purchase,
  currentInventory: InventoryItem[]
): InventoryItem[] {
  try {
    const expiryDate = calcExpiryDate(purchase.purchase_date, purchase.shelf_life_days);
    const daysUntilExpiry = calcDaysUntilExpiry(expiryDate);
    const status = resolveStatus(daysUntilExpiry);

    const existing = currentInventory.find(
      (item) => item.ingredient_id === purchase.ingredient_id
    );

    if (existing) {
      // Merge: add new stock, refresh expiry and status
      const updated: InventoryItem = {
        ...existing,
        quantity_remaining: existing.quantity_remaining + purchase.quantity_purchased,
        purchase_date: purchase.purchase_date,
        expiry_date: expiryDate,
        days_until_expiry: daysUntilExpiry,
        status,
        consumption_estimate: buildConsumptionEstimate({
          quantity_remaining: existing.quantity_remaining + purchase.quantity_purchased,
          expiry_date: expiryDate,
          used_in_upcoming_meals: existing.used_in_upcoming_meals,
        }),
      };

      return currentInventory.map((item) =>
        item.ingredient_id === purchase.ingredient_id ? updated : item
      );
    }

    // New item — storage_location defaults to "Despensa"; caller can
    // enrich afterwards if master-ingredient data is available.
    const newItem: InventoryItem = {
      ingredient_id: purchase.ingredient_id,
      canonical_name: purchase.canonical_name,
      quantity_remaining: purchase.quantity_purchased,
      unit: purchase.unit,
      purchase_date: purchase.purchase_date,
      expiry_date: expiryDate,
      days_until_expiry: daysUntilExpiry,
      status,
      used_in_upcoming_meals: [],
      consumption_estimate: buildConsumptionEstimate({
        quantity_remaining: purchase.quantity_purchased,
        expiry_date: expiryDate,
        used_in_upcoming_meals: [],
      }),
      storage_location: "Despensa",
    };

    return [...currentInventory, newItem];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `inventoryTracker.updateInventory failed for ingredient "${purchase.ingredient_id}": ${message}`
    );
  }
}

/**
 * Deducts a consumed quantity from the matching inventory item.
 * Clamps quantity_remaining to 0 — it will never go negative.
 */
export function logConsumption(
  consumed: ConsumptionLog,
  currentInventory: InventoryItem[]
): InventoryItem[] {
  try {
    const itemIndex = currentInventory.findIndex(
      (item) => item.ingredient_id === consumed.ingredient_id
    );

    if (itemIndex === -1) {
      // Ingredient not tracked; return unchanged inventory
      return currentInventory;
    }

    const existing = currentInventory[itemIndex];
    const newQuantity = Math.max(0, existing.quantity_remaining - consumed.quantity_used);
    const daysUntilExpiry = calcDaysUntilExpiry(existing.expiry_date);
    const status = resolveStatus(daysUntilExpiry);

    const updated: InventoryItem = {
      ...existing,
      quantity_remaining: newQuantity,
      days_until_expiry: daysUntilExpiry,
      status,
      consumption_estimate: buildConsumptionEstimate({
        quantity_remaining: newQuantity,
        expiry_date: existing.expiry_date,
        used_in_upcoming_meals: existing.used_in_upcoming_meals,
      }),
    };

    return currentInventory.map((item, idx) =>
      idx === itemIndex ? updated : item
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `inventoryTracker.logConsumption failed for ingredient "${consumed.ingredient_id}": ${message}`
    );
  }
}

/**
 * Recalculates days_until_expiry and status for every item using
 * today's date as the reference point.  Call this on application
 * startup or whenever a stale snapshot is loaded.
 */
export function getCurrentInventory(items: InventoryItem[]): InventoryItem[] {
  try {
    return items.map((item) => {
      const daysUntilExpiry = calcDaysUntilExpiry(item.expiry_date);
      const status = resolveStatus(daysUntilExpiry);
      const consumptionEstimate = buildConsumptionEstimate({
        quantity_remaining: item.quantity_remaining,
        expiry_date: item.expiry_date,
        used_in_upcoming_meals: item.used_in_upcoming_meals,
      });

      return {
        ...item,
        days_until_expiry: daysUntilExpiry,
        status,
        consumption_estimate: consumptionEstimate,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `inventoryTracker.getCurrentInventory failed: ${message}`
    );
  }
}

/**
 * Inspects all inventory items and returns actionable alerts.
 *
 * Priority rules (evaluated in order — an item may produce several alerts):
 *  1. EXPIRED               → HIGH  / DISCARD
 *  2. EXPIRING_SOON with no upcoming use → HIGH / CONSUME_IMMEDIATELY or FREEZE
 *  3. WASTE_RISK (expires before last planned use) → HIGH / REORGANIZE_MEALS
 *  4. LOW_STOCK (< 20 % of total needed)          → MEDIUM / LOW_STOCK → mapped to DISCARD as fallback
 *  5. NOT_IN_USE (in inventory but not in any meal) → LOW / DISCARD
 *
 * Note: AlertAction does not include "LOW_STOCK" as a value in the
 * type union, so LOW_STOCK alerts use DISCARD as the action (meaning
 * "buy more / review").  Adjust the type definition if a dedicated
 * LOW_STOCK action is needed.
 */
export function getAlerts(inventory: InventoryItem[]): InventoryAlert[] {
  try {
    const alerts: InventoryAlert[] = [];

    for (const item of inventory) {
      const { canonical_name, status, used_in_upcoming_meals, consumption_estimate } = item;

      // ── 1. EXPIRED ───────────────────────────────────────────
      if (status === "EXPIRED") {
        alerts.push({
          severity: "HIGH" as AlertSeverity,
          type: "EXPIRING" as AlertType,
          ingredient: canonical_name,
          message: `${canonical_name} expired on ${item.expiry_date}. Remove from inventory immediately.`,
          action: "DISCARD" as AlertAction,
        });
        continue; // No further alerts for an already-expired item
      }

      // ── 2. EXPIRING_SOON with no upcoming meals ──────────────
      if (status === "EXPIRING_SOON" && used_in_upcoming_meals.length === 0) {
        // Suggest FREEZE if item still has quantity; otherwise CONSUME_IMMEDIATELY
        const action: AlertAction =
          item.quantity_remaining > 0 ? "FREEZE" : "CONSUME_IMMEDIATELY";
        alerts.push({
          severity: "HIGH",
          type: "EXPIRING",
          ingredient: canonical_name,
          message: `${canonical_name} expires in ${item.days_until_expiry} day(s) and is not scheduled in any upcoming meal. ${
            action === "FREEZE"
              ? "Freeze it to extend shelf life."
              : "Consume it immediately."
          }`,
          action,
        });
      }

      // ── 3. WASTE_RISK ────────────────────────────────────────
      if (consumption_estimate.will_expire_before_use && used_in_upcoming_meals.length > 0) {
        alerts.push({
          severity: "HIGH",
          type: "WASTE_RISK",
          ingredient: canonical_name,
          message: `${canonical_name} will expire on ${item.expiry_date} before its last planned use. ${consumption_estimate.recommendation}`,
          action: "REORGANIZE_MEALS",
        });
      }

      // ── 4. LOW_STOCK ─────────────────────────────────────────
      if (used_in_upcoming_meals.length > 0) {
        const totalNeeded = used_in_upcoming_meals.reduce(
          (sum, u) => sum + u.quantity_needed,
          0
        );
        const typicalUsage = totalNeeded / used_in_upcoming_meals.length;
        if (typicalUsage > 0 && item.quantity_remaining < typicalUsage * 0.2) {
          alerts.push({
            severity: "MEDIUM",
            type: "LOW_STOCK",
            ingredient: canonical_name,
            message: `${canonical_name} stock (${item.quantity_remaining} ${item.unit}) is below 20% of typical usage (${typicalUsage.toFixed(1)} ${item.unit}). Restock soon.`,
            action: "DISCARD", // Closest available action; indicates review needed
          });
        }
      }

      // ── 5. NOT_IN_USE ────────────────────────────────────────
      if (used_in_upcoming_meals.length === 0 && (status as string) !== "EXPIRING_SOON") {
        alerts.push({
          severity: "LOW",
          type: "NOT_IN_USE",
          ingredient: canonical_name,
          message: `${canonical_name} is in inventory but not referenced in any upcoming meal plan.`,
          action: "DISCARD",
        });
      }
    }

    // Sort: HIGH first, then MEDIUM, then LOW
    const severityOrder: Record<AlertSeverity, number> = {
      HIGH: 0,
      MEDIUM: 1,
      LOW: 2,
    };
    alerts.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );

    return alerts;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`inventoryTracker.getAlerts failed: ${message}`);
  }
}

/**
 * Predicts which inventory items will be wasted based on the upcoming
 * meal schedule.
 *
 * An item is "at risk" when its expiry_date falls before the date of
 * the last meal that uses it.  Items not used in any upcoming meal are
 * also considered at risk if they are perishable (EXPIRING_SOON /
 * EXPIRED).
 *
 * total_waste_risk_value is expressed as the total quantity at risk
 * (unit-agnostic sum — a proxy for waste volume).
 */
export function predictWaste(
  inventory: InventoryItem[],
  upcomingMeals: ParsedMealDay[]
): WastePrediction {
  try {
    // Refresh usages and consumption estimates against the provided meal plan
    const refreshed = inventory.map((item) => {
      const usages = collectUpcomingUsages(
        item.ingredient_id,
        item.canonical_name,
        upcomingMeals
      );
      const consumptionEstimate = buildConsumptionEstimate({
        quantity_remaining: item.quantity_remaining,
        expiry_date: item.expiry_date,
        used_in_upcoming_meals: usages,
      });
      return {
        ...item,
        used_in_upcoming_meals: usages,
        consumption_estimate: consumptionEstimate,
        days_until_expiry: calcDaysUntilExpiry(item.expiry_date),
        status: resolveStatus(calcDaysUntilExpiry(item.expiry_date)),
      } as InventoryItem;
    });

    const atRiskItems: InventoryItem[] = [];
    const recommendations: string[] = [];

    for (const item of refreshed) {
      const isAtRisk =
        // Will expire before last use
        (item.consumption_estimate.will_expire_before_use &&
          item.used_in_upcoming_meals.length > 0) ||
        // No planned use and perishable
        (item.used_in_upcoming_meals.length === 0 &&
          (item.status === "EXPIRING_SOON" || item.status === "EXPIRED"));

      if (isAtRisk) {
        atRiskItems.push(item);

        if (
          item.consumption_estimate.will_expire_before_use &&
          item.used_in_upcoming_meals.length > 0
        ) {
          // Find the last usage date
          const lastUsageDate = item.used_in_upcoming_meals
            .map((u) => u.meal_date)
            .sort((a, b) => (a > b ? 1 : -1))
            .pop();

          recommendations.push(
            `Move meals using "${item.canonical_name}" (last: ${lastUsageDate}) before its expiry on ${item.expiry_date}.`
          );
        } else if (item.used_in_upcoming_meals.length === 0) {
          recommendations.push(
            `"${item.canonical_name}" expires on ${item.expiry_date} and has no planned use. Consume, freeze, or discard.`
          );
        }
      }
    }

    // total_waste_risk_value = sum of quantity_remaining for at-risk items
    const totalWasteRiskValue = atRiskItems.reduce(
      (sum, item) => sum + item.quantity_remaining,
      0
    );

    // Global recommendation when there are many at-risk items
    if (atRiskItems.length > 3) {
      recommendations.push(
        `${atRiskItems.length} items are at waste risk. Consider a batch-cook session to consume perishables before they expire.`
      );
    }

    return {
      at_risk_items: atRiskItems,
      total_waste_risk_value: totalWasteRiskValue,
      recommendations,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`inventoryTracker.predictWaste failed: ${message}`);
  }
}
