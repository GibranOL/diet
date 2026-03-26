// ============================================================
// Mobile UI Data Generator Service — Dieta App
// Aggregates all service outputs into React Native-ready screen data
// ============================================================

import type {
  AllServiceOutputs,
  MobileScreenData,
  TodayScreenData,
  ShoppingScreenData,
  InventoryScreenData,
  MealsScreenData,
  UploadPDFScreenData,
  CookingSession,
  CookingStep,
  InventoryAlert,
  InventoryOutput,
  InventoryItem,
  ShoppingList,
  ShoppingCategory,
  ShoppingItem,
  ParsedMealDay,
  Meal,
  MealType,
  MobileStep,
  MobileMeal,
  MobileAlert,
  QuickAction,
  MobileShoppingCategory,
  MobileShoppingItem,
  MobileInventoryItem,
  WeekDaySummary,
  DaySummary,
  ActivityType,
  AlertSeverity,
  AlertAction,
  InventoryStatus,
  IngredientCategory,
  TemplateSummary,
  RotationDay,
} from "../types/index";

// ─── Meal Time Lookup ────────────────────────────────────────

const MEAL_TIMES: Record<MealType, string> = {
  "Al despertar": "6:30 AM",
  Desayuno: "8:00 AM",
  "Medio día": "11:00 AM",
  Comida: "2:00 PM",
  "Media tarde": "5:00 PM",
  Cena: "8:00 PM",
};

// ─── Category Emoji Lookup ───────────────────────────────────

const CATEGORY_EMOJI: Record<IngredientCategory, string> = {
  Verduras: "🥬",
  Frutas: "🍎",
  "Proteínas": "🥩",
  "Lácteos": "🧀",
  Granos: "🌾",
  Bebidas: "💧",
  Otros: "📦",
};

// ─── Inventory Status Emoji Lookup ──────────────────────────

const STATUS_EMOJI: Record<InventoryStatus, string> = {
  OK: "✅",
  USE_NEXT: "🟡",
  EXPIRING_SOON: "⚠️",
  EXPIRED: "❌",
};

// ─── Alert Severity Mapping ──────────────────────────────────

const ALERT_SEVERITY_MAP: Record<
  AlertSeverity,
  { severity: "high" | "medium" | "low"; emoji: string }
> = {
  HIGH: { severity: "high", emoji: "⚠️" },
  MEDIUM: { severity: "medium", emoji: "🔔" },
  LOW: { severity: "low", emoji: "ℹ️" },
};

// ─── Alert Action → Human-readable ──────────────────────────

const ALERT_ACTION_LABELS: Record<AlertAction, string> = {
  CONSUME_IMMEDIATELY: "Consumir de inmediato",
  REORGANIZE_MEALS: "Reorganizar comidas",
  FREEZE: "Congelar",
  DISCARD: "Descartar",
};

// ─── Helpers ─────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function formatExpiryDisplay(daysUntilExpiry: number): string {
  if (daysUntilExpiry < 0) {
    return "Expired";
  }
  if (daysUntilExpiry === 0) {
    return "Today";
  }
  return `${daysUntilExpiry} days`;
}

function formatQuantityString(quantity: number, unit: string): string {
  const unitLower = unit.toLowerCase();
  if (unitLower === "g" || unitLower === "ml" || unitLower === "kg" || unitLower === "l") {
    return `${quantity}${unit}`;
  }
  const label = quantity === 1 ? "unidad" : "unidades";
  return `${quantity} ${label}`;
}

function formatInventoryQuantity(quantity: number, unit: string): string {
  const unitLower = unit.toLowerCase();
  if (unitLower === "g" || unitLower === "ml" || unitLower === "kg" || unitLower === "l") {
    return `${quantity}${unit}`;
  }
  return `${quantity} ${unit}`;
}

function getDayName(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00Z`);
  return date.toLocaleDateString("es-MX", { weekday: "short", timeZone: "UTC" });
}

function estimateCookingTime(meals: Meal[]): string {
  // Rough heuristic: 10 min per dish, min 15 min total
  const dishCount = meals.reduce((sum, m) => sum + m.dishes.length, 0);
  const estimated = Math.max(15, dishCount * 10);
  return formatDuration(estimated);
}

function buildMealsSummary(meals: Meal[]): string {
  return meals.map((m) => m.mealType).join(", ");
}

// ─── generateTodayScreen ─────────────────────────────────────

export function generateTodayScreen(
  session: CookingSession,
  alerts: InventoryAlert[],
  mealDay: ParsedMealDay | undefined,
  dayNumber: number
): TodayScreenData {
  try {
    // Convert CookingSteps → MobileStep
    const mobileSteps: MobileStep[] = session.steps.map((step: CookingStep): MobileStep => {
      const prefix = step.activity_type === "ACTIVE" ? "🍳" : "⏱️";
      const hasParallel = step.can_parallelize_with.length > 0;
      const parallelText = hasParallel
        ? `Parallel with step${step.can_parallelize_with.length > 1 ? "s" : ""} ${step.can_parallelize_with.join(", ")}`
        : undefined;

      return {
        step_id: step.step_id,
        order: step.order,
        action: `${prefix} ${step.action}`,
        duration: formatDuration(step.duration_minutes),
        timer_enabled: step.activity_type === "PASSIVE" || !!step.timer_alert_at_minute,
        parallel: hasParallel || undefined,
        parallel_text: parallelText,
        details: step.description || undefined,
      };
    });

    // Convert meals → MobileMeal
    const mobileMeals: MobileMeal[] = (mealDay?.meals ?? []).map((meal: Meal): MobileMeal => {
      const dishNames = meal.dishes.map((d) => d.name);
      const allIngredients = meal.dishes
        .flatMap((d) => d.ingredients.map((i) => i.name))
        .slice(0, 3);
      const ingredientsPreview =
        allIngredients.length > 0 ? allIngredients.join(", ") : "Sin ingredientes";

      // Find ready_at from meal_assignments if available
      const assignment = session.meal_assignments.find(
        (a) => a.meal_type === meal.mealType
      );
      const readyAt =
        assignment != null
          ? formatDuration(assignment.ready_at_minute)
          : MEAL_TIMES[meal.mealType];

      return {
        type: meal.mealType,
        time: MEAL_TIMES[meal.mealType],
        dishes: dishNames,
        ingredients_preview: ingredientsPreview,
        ready_at: readyAt,
      };
    });

    // Convert InventoryAlerts → MobileAlert
    const mobileAlerts: MobileAlert[] = alerts.map((alert: InventoryAlert): MobileAlert => {
      const mapped = ALERT_SEVERITY_MAP[alert.severity];
      return {
        severity: mapped.severity,
        emoji: mapped.emoji,
        message: alert.message,
        action: ALERT_ACTION_LABELS[alert.action],
      };
    });

    const quickActions: QuickAction[] = [
      { label: "Ver compras", action: "NAVIGATE_SHOPPING" },
      { label: "Ver inventario", action: "NAVIGATE_INVENTORY" },
    ];

    return {
      date: session.date,
      day_number: dayNumber,
      cooking_section: {
        estimated_time_minutes: session.estimated_total_time_minutes,
        start_button: mobileSteps.length > 0,
        steps: mobileSteps,
        current_step_highlight: 1,
      },
      meals_today: mobileMeals,
      inventory_alerts: mobileAlerts,
      quick_actions: quickActions,
    };
  } catch (error) {
    throw new Error(
      `generateTodayScreen failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ─── generateShoppingScreen ──────────────────────────────────

export function generateShoppingScreen(shoppingLists: ShoppingList[]): ShoppingScreenData {
  try {
    if (shoppingLists.length === 0) {
      return {
        upcoming_session: null,
        past_sessions: [],
      };
    }

    const nextList = shoppingLists[0];

    const byCategory: MobileShoppingCategory[] = nextList.by_category.map(
      (cat: ShoppingCategory): MobileShoppingCategory => {
        const emoji = CATEGORY_EMOJI[cat.category] ?? "📦";
        const mobileItems: MobileShoppingItem[] = cat.items.map(
          (item: ShoppingItem): MobileShoppingItem => {
            const costStr =
              item.estimated_total_cost != null
                ? `$${item.estimated_total_cost.toFixed(2)}`
                : undefined;

            return {
              name: item.canonical_name,
              quantity: formatQuantityString(item.quantity_to_buy, item.unit),
              cost: costStr,
              checkbox: false,
              badge: item.badge ?? null,
            };
          }
        );

        return {
          category: `${emoji} ${cat.category}`,
          items: mobileItems,
          subtotal: cat.subtotal,
        };
      }
    );

    return {
      upcoming_session: {
        date: nextList.shopping_date,
        days_covered: nextList.days_covered.length,
        total_cost_estimated: nextList.summary.total_cost_estimated,
        items_count: nextList.summary.total_items,
        by_category: byCategory,
        warnings: nextList.summary.warnings,
      },
      past_sessions: [],
    };
  } catch (error) {
    throw new Error(
      `generateShoppingScreen failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ─── generateInventoryScreen ─────────────────────────────────

export function generateInventoryScreen(inventory: InventoryOutput): InventoryScreenData {
  try {
    const mobileItems: MobileInventoryItem[] = inventory.current_inventory.map(
      (item: InventoryItem): MobileInventoryItem => {
        const emoji = STATUS_EMOJI[item.status];
        const expiryDisplay = formatExpiryDisplay(item.days_until_expiry);

        // Determine recommended action based on status
        let action: string;
        switch (item.status) {
          case "EXPIRED":
            action = "Descartar";
            break;
          case "EXPIRING_SOON":
            action = "Usar pronto";
            break;
          case "USE_NEXT":
            action = "Usar en próxima comida";
            break;
          default:
            action = item.consumption_estimate.recommendation;
        }

        return {
          name: item.canonical_name,
          quantity: formatInventoryQuantity(item.quantity_remaining, item.unit),
          expiry: expiryDisplay,
          status: item.status,
          emoji,
          used_in_next_meals: item.used_in_upcoming_meals.length,
          action,
        };
      }
    );

    const { items_expiring_soon, items_at_risk } = inventory.summary;
    const parts: string[] = [];
    if (items_expiring_soon > 0) {
      parts.push(`${items_expiring_soon} item${items_expiring_soon !== 1 ? "s" : ""} expiring soon`);
    }
    if (items_at_risk > 0) {
      parts.push(`${items_at_risk} at risk`);
    }
    const summaryText =
      parts.length > 0 ? parts.join(" · ") : "All items in good condition";

    return {
      items: mobileItems,
      alerts_count: inventory.alerts.length,
      summary_text: summaryText,
    };
  } catch (error) {
    throw new Error(
      `generateInventoryScreen failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ─── generateMealsScreen ─────────────────────────────────────

export function generateMealsScreen(mealDays: ParsedMealDay[]): MealsScreenData {
  try {
    const currentWeek: WeekDaySummary[] = mealDays.slice(0, 7).map(
      (day: ParsedMealDay): WeekDaySummary => {
        const quickMeals = day.meals.flatMap((m) => m.dishes.map((d) => d.name)).slice(0, 3);
        return {
          date: day.date,
          day: getDayName(day.date),
          quick_meals: quickMeals,
          cooking_time: estimateCookingTime(day.meals),
          view_detail: true,
        };
      }
    );

    const all21Days: DaySummary[] = mealDays.map(
      (day: ParsedMealDay, index: number): DaySummary => ({
        date: day.date,
        day_of_plan: index + 1,
        meals_summary: buildMealsSummary(day.meals),
        cooking_estimated: estimateCookingTime(day.meals),
        tap_for_details: true,
      })
    );

    return {
      current_week: currentWeek,
      all_21_days: all21Days,
      all_templates: [], // populated by api.ts after generation
      rotation_preview: [], // populated by api.ts after generation
    };
  } catch (error) {
    throw new Error(
      `generateMealsScreen failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ─── generateScreenData ──────────────────────────────────────

export function generateScreenData(
  allServices: AllServiceOutputs,
  date: string
): MobileScreenData {
  try {
    const now = new Date();
    const cacheValidUntil = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    // Find today's meal day matching the given date
    const mealDay = allServices.meal_days_21.find((d) => d.date === date);

    // Determine day number in the 21-day plan (1-indexed)
    const dayIndex = allServices.meal_days_21.findIndex((d) => d.date === date);
    const dayNumber = dayIndex >= 0 ? dayIndex + 1 : 1;

    const todayScreen = generateTodayScreen(
      allServices.cooking_session,
      allServices.current_inventory.alerts,
      mealDay,
      dayNumber
    );

    const shoppingScreen = generateShoppingScreen(allServices.shopping_lists);

    const inventoryScreen = generateInventoryScreen(allServices.current_inventory);

    const mealsScreen = generateMealsScreen(allServices.meal_days_21);

    const uploadPDFScreen: UploadPDFScreenData = {
      status: "READY",
      progress_percent: 0,
      current_plan_days_remaining: Math.max(0, allServices.meal_days_21.length - dayNumber),
      next_upload_recommended:
        allServices.meal_days_21.length > 0
          ? allServices.meal_days_21[allServices.meal_days_21.length - 1].date
          : date,
      instructions:
        "Sube tu PDF de plan alimenticio para comenzar. Se aceptan planes de hasta 21 días.",
    };

    return {
      screens: {
        today: todayScreen,
        shopping: shoppingScreen,
        inventory: inventoryScreen,
        meals: mealsScreen,
        upload_pdf: uploadPDFScreen,
      },
      meta: {
        generated_at: now.toISOString(),
        cache_valid_until: cacheValidUntil.toISOString(),
        requires_refresh: false,
        offline_ready: true,
      },
    };
  } catch (error) {
    throw new Error(
      `generateScreenData failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
