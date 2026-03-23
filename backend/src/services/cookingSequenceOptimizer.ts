// ============================================================
// cookingSequenceOptimizer.ts — Dieta App
// Analyzes a day's meals and generates an optimized cooking
// sequence with parallel scheduling, equipment constraints,
// and efficiency metrics.
// ============================================================

import { v4 as uuidv4 } from "uuid";
import {
  ParsedMealDay,
  CookingSession,
  CookingStep,
  CleanupAction,
  MealAssignment,
  EfficiencyMetrics,
  EquipmentConstraints,
  CookingPreferences,
  TimelineView,
  ActivityType,
  MealType,
  RawIngredient,
  Meal,
} from "../types/index";

// ─── Internal enums & helpers ───────────────────────────────

type CookTechnique =
  | "BOIL"
  | "SEAR"
  | "GRILL"
  | "FRY"
  | "HEAT"
  | "CHOP"
  | "PREP";

interface TechniqueProfile {
  technique: CookTechnique;
  durationMinutes: number;
  activityType: ActivityType;
  equipment: string[];
  usesBurner: boolean;
}

interface IngredientTask {
  ingredientName: string;
  mealType: MealType;
  dishName: string;
  profile: TechniqueProfile;
}

const TECHNIQUE_PROFILES: Record<CookTechnique, TechniqueProfile> = {
  BOIL: {
    technique: "BOIL",
    durationMinutes: 20,
    activityType: "PASSIVE",
    equipment: ["olla", "estufa"],
    usesBurner: true,
  },
  SEAR: {
    technique: "SEAR",
    durationMinutes: 15,
    activityType: "ACTIVE",
    equipment: ["sartén", "estufa"],
    usesBurner: true,
  },
  GRILL: {
    technique: "GRILL",
    durationMinutes: 15,
    activityType: "ACTIVE",
    equipment: ["sartén grill", "estufa"],
    usesBurner: true,
  },
  FRY: {
    technique: "FRY",
    durationMinutes: 10,
    activityType: "ACTIVE",
    equipment: ["sartén", "estufa"],
    usesBurner: true,
  },
  HEAT: {
    technique: "HEAT",
    durationMinutes: 3,
    activityType: "ACTIVE",
    equipment: ["comal", "estufa"],
    usesBurner: true,
  },
  CHOP: {
    technique: "CHOP",
    durationMinutes: 0, // included in PREP step
    activityType: "ACTIVE",
    equipment: ["tabla de cortar", "cuchillo"],
    usesBurner: false,
  },
  PREP: {
    technique: "PREP",
    durationMinutes: 5,
    activityType: "ACTIVE",
    equipment: ["tabla de cortar"],
    usesBurner: false,
  },
};

// ─── Technique identification ────────────────────────────────

function identifyTechnique(ingredientName: string): CookTechnique {
  const name = ingredientName.toLowerCase().trim();

  // Raw vegetables/fruits → CHOP (handled in PREP group)
  if (
    /aguacate|tomate|lechuga|pepino|cebolla|chile|limón|naranja|mango|kiwi|fresa/.test(
      name
    )
  ) {
    return "CHOP";
  }

  // Starchy vegetables → BOIL (20 min passive)
  if (/papa|zanahoria|brócoli|brocoli|espinaca|chayote|ejote|betabel/.test(name)) {
    return "BOIL";
  }

  // Grains → BOIL (override duration later)
  if (/arroz/.test(name)) {
    return "BOIL";
  }

  // Protein: meat/poultry → SEAR/GRILL
  if (/filete|carne|pollo|pechuga|muslo|bistec|res|cerdo|salmon|atun|atún/.test(name)) {
    return "SEAR";
  }

  // Eggs → FRY
  if (/huevo/.test(name)) {
    return "FRY";
  }

  // Tortillas → HEAT
  if (/tortilla/.test(name)) {
    return "HEAT";
  }

  // Default → PREP
  return "PREP";
}

function getDurationOverride(
  ingredientName: string,
  technique: CookTechnique
): number {
  const name = ingredientName.toLowerCase();
  if (technique === "BOIL" && /arroz/.test(name)) return 25;
  return TECHNIQUE_PROFILES[technique].durationMinutes;
}

function getTechniqueAction(technique: CookTechnique, ingredientName: string): string {
  const name = ingredientName.toLowerCase();
  switch (technique) {
    case "BOIL":
      return /arroz/.test(name) ? "Cocer arroz" : "Hervir";
    case "SEAR":
      return /pollo|pechuga|muslo/.test(name) ? "Sellar pollo" : "Sellar proteína";
    case "GRILL":
      return "Asar a la plancha";
    case "FRY":
      return "Freír huevo";
    case "HEAT":
      return "Calentar tortillas";
    case "CHOP":
      return "Picar y lavar";
    case "PREP":
      return "Preparar";
  }
}

// ─── Build ingredient task list ──────────────────────────────

function buildIngredientTasks(mealDay: ParsedMealDay): IngredientTask[] {
  const tasks: IngredientTask[] = [];

  for (const meal of mealDay.meals) {
    for (const dish of meal.dishes) {
      for (const ingredient of dish.ingredients) {
        const technique = identifyTechnique(ingredient.name);
        const duration = getDurationOverride(ingredient.name, technique);
        const baseProfile = TECHNIQUE_PROFILES[technique];
        const profile: TechniqueProfile = { ...baseProfile, durationMinutes: duration };

        tasks.push({
          ingredientName: ingredient.name,
          mealType: meal.mealType,
          dishName: dish.name,
          profile,
        });
      }
    }
  }

  return tasks;
}

// ─── Group tasks into cooking step buckets ───────────────────

interface StepBucket {
  technique: CookTechnique;
  ingredients: string[];
  mealTypes: MealType[];
  dishes: string[];
  profile: TechniqueProfile;
}

function groupTasksIntoBuckets(tasks: IngredientTask[]): StepBucket[] {
  const chopIngredients: string[] = [];
  const chopMealTypes = new Set<MealType>();
  const chopDishes = new Set<string>();

  // Non-chop groups keyed by "technique|equipment[0]"
  const cookingBuckets = new Map<string, StepBucket>();

  for (const task of tasks) {
    if (task.profile.technique === "CHOP") {
      chopIngredients.push(task.ingredientName);
      chopMealTypes.add(task.mealType);
      chopDishes.add(task.dishName);
      continue;
    }

    const key = `${task.profile.technique}|${task.profile.equipment[0]}`;
    if (!cookingBuckets.has(key)) {
      cookingBuckets.set(key, {
        technique: task.profile.technique,
        ingredients: [],
        mealTypes: [],
        dishes: [],
        profile: { ...task.profile },
      });
    }
    const bucket = cookingBuckets.get(key)!;
    if (!bucket.ingredients.includes(task.ingredientName)) {
      bucket.ingredients.push(task.ingredientName);
    }
    if (!bucket.mealTypes.includes(task.mealType)) {
      bucket.mealTypes.push(task.mealType);
    }
    if (!bucket.dishes.includes(task.dishName)) {
      bucket.dishes.push(task.dishName);
    }

    // Take the max duration among ingredients in this bucket
    if (task.profile.durationMinutes > bucket.profile.durationMinutes) {
      bucket.profile = { ...task.profile };
    }
  }

  const buckets: StepBucket[] = [];

  // PREP/CHOP step always comes first if there are any chop ingredients
  if (chopIngredients.length > 0) {
    // Estimate 3 min per ingredient, minimum 5
    const prepDuration = Math.max(5, chopIngredients.length * 3);
    buckets.push({
      technique: "CHOP",
      ingredients: chopIngredients,
      mealTypes: Array.from(chopMealTypes),
      dishes: Array.from(chopDishes),
      profile: {
        technique: "CHOP",
        durationMinutes: prepDuration,
        activityType: "ACTIVE",
        equipment: ["tabla de cortar", "cuchillo"],
        usesBurner: false,
      },
    });
  }

  // Add all other cooking buckets
  for (const bucket of cookingBuckets.values()) {
    buckets.push(bucket);
  }

  return buckets;
}

// ─── Build CookingStep list with dependencies & parallelism ──

interface ScheduledStep {
  step: CookingStep;
  startMinute: number;
  endMinute: number;
}

function buildSteps(
  buckets: StepBucket[],
  constraints: EquipmentConstraints,
  preferences: CookingPreferences
): { steps: CookingStep[]; schedule: ScheduledStep[] } {
  const steps: CookingStep[] = [];
  let stepId = 1;

  // Separate passive (burner, long) from active
  // PREP/CHOP always goes first as step 1
  const prepBucket = buckets.find((b) => b.technique === "CHOP");
  const cookBuckets = buckets.filter((b) => b.technique !== "CHOP");

  // Sort: passive steps first so they can overlap with active
  const passiveBuckets = cookBuckets.filter(
    (b) => b.profile.activityType === "PASSIVE"
  );
  const activeBuckets = cookBuckets.filter(
    (b) => b.profile.activityType === "ACTIVE"
  );

  const orderedBuckets: StepBucket[] = [];
  if (prepBucket) orderedBuckets.push(prepBucket);
  orderedBuckets.push(...passiveBuckets, ...activeBuckets);

  // Build raw steps
  for (let i = 0; i < orderedBuckets.length; i++) {
    const bucket = orderedBuckets[i];
    const action = getTechniqueAction(bucket.technique, bucket.ingredients[0] ?? "");
    const ingredientList = bucket.ingredients.join(", ");

    const step: CookingStep = {
      step_id: stepId,
      order: stepId,
      action,
      description: `${action}: ${ingredientList}`,
      ingredients_involved: bucket.ingredients,
      equipment: bucket.profile.equipment,
      duration_minutes: bucket.profile.durationMinutes,
      activity_type: bucket.profile.activityType,
      can_parallelize_with: [],
      dependencies: [],
      notes: "",
    };

    // Timer alert for passive steps (1 min before end)
    if (bucket.profile.activityType === "PASSIVE") {
      step.timer_alert_at_minute = bucket.profile.durationMinutes - 1;
      step.timer_alert_message = `¡1 minuto para que termine: ${action}!`;
    }

    steps.push(step);
    stepId++;
  }

  // Assembly/plating step
  const allMealTypes = Array.from(
    new Set(orderedBuckets.flatMap((b) => b.mealTypes))
  );
  const allDishes = Array.from(new Set(orderedBuckets.flatMap((b) => b.dishes)));
  const assemblyStep: CookingStep = {
    step_id: stepId,
    order: stepId,
    action: "Emplatar y servir",
    description: `Montar y servir: ${allDishes.slice(0, 4).join(", ")}${allDishes.length > 4 ? " y más" : ""}`,
    ingredients_involved: [],
    equipment: ["platos", "utensilios"],
    duration_minutes: 5,
    activity_type: "ACTIVE",
    can_parallelize_with: [],
    dependencies: steps.map((s) => s.step_id),
    notes: "Último paso — todos los componentes deben estar listos.",
  };
  steps.push(assemblyStep);

  // ── Compute parallelize_with ─────────────────────────────
  // PASSIVE steps can run concurrently with ACTIVE steps (and with each other
  // up to burner limits). ACTIVE non-burner steps can overlap with passive ones.
  if (preferences.parallel_operations) {
    const burnerSteps = steps.filter(
      (s) =>
        s.step_id !== assemblyStep.step_id &&
        orderedBuckets.find(
          (b) =>
            b.ingredients.join(",") === s.ingredients_involved.join(",") &&
            b.profile.usesBurner
        )
    );

    for (let i = 0; i < steps.length - 1; i++) {
      for (let j = i + 1; j < steps.length - 1; j++) {
        const a = steps[i];
        const b = steps[j];

        // Don't mark assembly as parallelizable
        if (
          a.step_id === assemblyStep.step_id ||
          b.step_id === assemblyStep.step_id
        )
          continue;

        // One PASSIVE + one ACTIVE (non-assembly) can overlap
        const aPassive = a.activity_type === "PASSIVE";
        const bPassive = b.activity_type === "PASSIVE";

        if (aPassive !== bPassive) {
          // Check burner capacity
          const aUsesBurner =
            orderedBuckets[i]?.profile.usesBurner ?? false;
          const bUsesBurner =
            orderedBuckets[j]?.profile.usesBurner ?? false;

          const concurrentBurners =
            (aUsesBurner ? 1 : 0) + (bUsesBurner ? 1 : 0);
          if (concurrentBurners <= constraints.num_burners) {
            if (!a.can_parallelize_with.includes(b.step_id)) {
              a.can_parallelize_with.push(b.step_id);
            }
            if (!b.can_parallelize_with.includes(a.step_id)) {
              b.can_parallelize_with.push(a.step_id);
            }
          }
        }
      }
    }
  }

  // ── Schedule start/end minutes ───────────────────────────
  const schedule: ScheduledStep[] = [];
  const scheduled = new Set<number>();
  let cursor = 0;

  // Greedy scheduling: place steps as early as possible respecting
  // dependencies and burner limits
  const remainingSteps = [...steps];

  while (remainingSteps.length > 0) {
    let placed = false;

    for (let idx = 0; idx < remainingSteps.length; idx++) {
      const step = remainingSteps[idx];

      // Check all dependencies are satisfied
      const depsOk = step.dependencies.every((dep) => scheduled.has(dep));
      if (!depsOk) continue;

      // Count burners in use at current cursor
      const bucketForStep = orderedBuckets.find(
        (b) =>
          JSON.stringify(b.ingredients) ===
          JSON.stringify(step.ingredients_involved)
      );
      const stepUsesBurner = bucketForStep?.profile.usesBurner ?? false;

      const burnersInUse = schedule.filter(
        (s) =>
          s.startMinute <= cursor &&
          s.endMinute > cursor &&
          orderedBuckets.find(
            (b) =>
              JSON.stringify(b.ingredients) ===
              JSON.stringify(s.step.ingredients_involved)
          )?.profile.usesBurner
      ).length;

      if (stepUsesBurner && burnersInUse >= constraints.num_burners) {
        continue; // Can't place now — not enough burners
      }

      // Respect max cooking time preference
      const endAt = cursor + step.duration_minutes;
      if (
        preferences.max_cooking_time_minutes > 0 &&
        endAt > preferences.max_cooking_time_minutes + 30 // allow 30 min buffer
      ) {
        continue;
      }

      const ss: ScheduledStep = {
        step,
        startMinute: cursor,
        endMinute: cursor + step.duration_minutes,
      };
      schedule.push(ss);
      scheduled.add(step.step_id);
      remainingSteps.splice(idx, 1);
      placed = true;

      // Advance cursor only for ACTIVE steps (passive steps don't block)
      if (step.activity_type === "ACTIVE") {
        cursor += step.duration_minutes;
      }

      break;
    }

    // If nothing was placed, advance cursor to next passive step completion
    if (!placed) {
      const nextPassiveEnd = schedule
        .filter((s) => !scheduled.has(s.step.step_id) || s.endMinute > cursor)
        .map((s) => s.endMinute)
        .filter((e) => e > cursor)
        .sort((a, b) => a - b)[0];

      if (nextPassiveEnd !== undefined) {
        cursor = nextPassiveEnd;
      } else {
        // Fallback: advance by 1 to avoid infinite loop
        cursor += 1;
      }
    }
  }

  return { steps, schedule };
}

// ─── Build timeline map ──────────────────────────────────────

function buildTimeline(
  schedule: ScheduledStep[]
): Record<string, string[]> {
  const timeline: Record<string, string[]> = {};

  for (const ss of schedule) {
    for (let m = ss.startMinute; m < ss.endMinute; m++) {
      const key = `min_${m.toString().padStart(3, "0")}`;
      if (!timeline[key]) timeline[key] = [];
      timeline[key].push(ss.step.action);
    }
  }

  return timeline;
}

// ─── Build cleanup plan ──────────────────────────────────────

function buildCleanupPlan(
  steps: CookingStep[],
  schedule: ScheduledStep[]
): CleanupAction[] {
  const cleanupActions: CleanupAction[] = [];

  for (const step of steps) {
    if (step.activity_type !== "PASSIVE") continue;

    const equipment = step.equipment.filter(
      (e) => e !== "estufa" && e !== "tabla de cortar"
    );
    if (equipment.length === 0) continue;

    cleanupActions.push({
      after_step: step.step_id,
      action: `Lavar ${equipment.join(", ")} tras completar paso ${step.step_id}`,
      equipment,
      duration_minutes: 3,
      is_optional: false,
    });
  }

  // Final cleanup: all equipment used
  const allEquipment = Array.from(
    new Set(steps.flatMap((s) => s.equipment).filter((e) => e !== "estufa"))
  );
  cleanupActions.push({
    after_step: steps[steps.length - 1]?.step_id ?? 0,
    action: "Limpieza general de utensilios y área de trabajo",
    equipment: allEquipment,
    duration_minutes: 10,
    is_optional: false,
  });

  return cleanupActions;
}

// ─── Build meal assignments ───────────────────────────────────

function buildMealAssignments(
  mealDay: ParsedMealDay,
  steps: CookingStep[],
  schedule: ScheduledStep[]
): MealAssignment[] {
  const assignments: MealAssignment[] = [];

  for (const meal of mealDay.meals) {
    const involvedStepIds: number[] = [];
    let maxReadyAt = 0;
    const componentsReady: Record<string, string[]> = {};

    for (const dish of meal.dishes) {
      componentsReady[dish.name] = [];

      for (const ingredient of dish.ingredients) {
        // Find steps that involve this ingredient
        for (const step of steps) {
          if (step.ingredients_involved.includes(ingredient.name)) {
            if (!involvedStepIds.includes(step.step_id)) {
              involvedStepIds.push(step.step_id);
            }

            const ss = schedule.find((s) => s.step.step_id === step.step_id);
            if (ss && ss.endMinute > maxReadyAt) {
              maxReadyAt = ss.endMinute;
            }

            if (!componentsReady[dish.name].includes(ingredient.name)) {
              componentsReady[dish.name].push(ingredient.name);
            }
          }
        }
      }
    }

    assignments.push({
      meal_type: meal.mealType,
      dishes: meal.dishes.map((d) => d.name),
      ready_at_minute: maxReadyAt > 0 ? maxReadyAt : 5,
      components_ready: componentsReady,
    });
  }

  return assignments;
}

// ─── Compute efficiency metrics ──────────────────────────────

function computeEfficiencyMetrics(
  steps: CookingStep[],
  schedule: ScheduledStep[],
  constraints: EquipmentConstraints
): EfficiencyMetrics {
  const totalTime =
    schedule.length > 0
      ? Math.max(...schedule.map((s) => s.endMinute))
      : 0;

  const sequentialTime = steps.reduce(
    (sum, s) => sum + s.duration_minutes,
    0
  );

  const activeTime = steps
    .filter((s) => s.activity_type === "ACTIVE")
    .reduce((sum, s) => sum + s.duration_minutes, 0);

  const parallelizationScore =
    sequentialTime > 0
      ? Math.max(0, Math.min(1, 1 - activeTime / sequentialTime))
      : 0;

  // Equipment utilization: avg fraction of burners used across all minutes
  const allMinutes = Object.keys(buildTimeline(schedule));
  const burnerUsagePerMinute = allMinutes.map((minKey) => {
    const min = parseInt(minKey.replace("min_", ""), 10);
    const burnerCount = schedule.filter(
      (ss) =>
        ss.startMinute <= min &&
        ss.endMinute > min &&
        ss.step.equipment.includes("estufa")
    ).length;
    return burnerCount / Math.max(1, constraints.num_burners);
  });

  const equipmentUtilization =
    burnerUsagePerMinute.length > 0
      ? burnerUsagePerMinute.reduce((a, b) => a + b, 0) /
        burnerUsagePerMinute.length
      : 0;

  const savings = sequentialTime - totalTime;
  const savingsStr =
    savings > 0 ? `${savings} min ahorrados` : "Sin ahorro (ya secuencial)";

  return {
    parallelization_score: parseFloat(parallelizationScore.toFixed(2)),
    equipment_utilization: parseFloat(equipmentUtilization.toFixed(2)),
    estimated_savings_vs_sequential: savingsStr,
  };
}

// ─── Collect all equipment needed ────────────────────────────

function collectEquipmentNeeded(steps: CookingStep[]): string[] {
  return Array.from(new Set(steps.flatMap((s) => s.equipment)));
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Analyzes a day's meals and returns a fully optimized CookingSession,
 * including parallelized steps, timeline, cleanup plan, meal assignments,
 * and efficiency metrics.
 */
export function optimizeCookingSequence(
  mealDay: ParsedMealDay,
  constraints: EquipmentConstraints,
  preferences?: CookingPreferences
): CookingSession {
  try {
    const prefs: CookingPreferences = preferences ?? {
      max_cooking_time_minutes: 120,
      minimize_cleanup: false,
      parallel_operations: true,
    };

    // 1. Identify techniques per ingredient
    const tasks = buildIngredientTasks(mealDay);

    // 2. Group into step buckets
    const buckets = groupTasksIntoBuckets(tasks);

    if (buckets.length === 0) {
      // Empty day — return a minimal session
      return {
        session_id: uuidv4(),
        date: mealDay.date,
        meals_to_prepare: [],
        estimated_active_time_minutes: 0,
        estimated_total_time_minutes: 0,
        equipment_needed: [],
        steps: [],
        timeline: {},
        cleanup_plan: [],
        meal_assignments: [],
        efficiency_metrics: {
          parallelization_score: 0,
          equipment_utilization: 0,
          estimated_savings_vs_sequential: "Sin pasos de cocción",
        },
      };
    }

    // 3. Build steps with dependency & parallelism graph
    const { steps, schedule } = buildSteps(buckets, constraints, prefs);

    // 4. Build minute-by-minute timeline
    const timeline = buildTimeline(schedule);

    // 5. Build cleanup plan
    const cleanupPlan = prefs.minimize_cleanup
      ? buildCleanupPlan(steps, schedule).slice(-1) // only final cleanup
      : buildCleanupPlan(steps, schedule);

    // 6. Build meal assignments
    const mealAssignments = buildMealAssignments(mealDay, steps, schedule);

    // 7. Efficiency metrics
    const efficiencyMetrics = computeEfficiencyMetrics(
      steps,
      schedule,
      constraints
    );

    // Totals
    const totalTime =
      schedule.length > 0
        ? Math.max(...schedule.map((s) => s.endMinute))
        : 0;
    const activeTime = steps
      .filter((s) => s.activity_type === "ACTIVE")
      .reduce((sum, s) => sum + s.duration_minutes, 0);

    const mealsToPrep = Array.from(
      new Set(mealDay.meals.map((m) => m.mealType))
    );

    return {
      session_id: uuidv4(),
      date: mealDay.date,
      meals_to_prepare: mealsToPrep,
      estimated_active_time_minutes: activeTime,
      estimated_total_time_minutes: totalTime,
      equipment_needed: collectEquipmentNeeded(steps),
      steps,
      timeline,
      cleanup_plan: cleanupPlan,
      meal_assignments: mealAssignments,
      efficiency_metrics: efficiencyMetrics,
    };
  } catch (error) {
    throw new Error(
      `optimizeCookingSequence failed for date ${mealDay.date}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Estimates total cooking time in minutes for a meal day by summing
 * all technique durations with passive steps overlapping active ones.
 * Returns total wall-clock minutes (not sequential sum).
 */
export function estimateCookingTime(mealDay: ParsedMealDay): number {
  try {
    const tasks = buildIngredientTasks(mealDay);
    const buckets = groupTasksIntoBuckets(tasks);

    if (buckets.length === 0) return 0;

    // Sum ACTIVE durations; add only the excess of PASSIVE durations
    // beyond what ACTIVE steps already cover
    const activeDuration = buckets
      .filter((b) => b.profile.activityType === "ACTIVE")
      .reduce((sum, b) => sum + b.profile.durationMinutes, 0);

    const maxPassiveDuration = buckets
      .filter((b) => b.profile.activityType === "PASSIVE")
      .reduce((max, b) => Math.max(max, b.profile.durationMinutes), 0);

    // Assembly step (5 min)
    const assemblyTime = 5;

    // Wall-clock time = max(active chain, longest passive) + assembly
    return Math.max(activeDuration, maxPassiveDuration) + assemblyTime;
  } catch (error) {
    throw new Error(
      `estimateCookingTime failed for date ${mealDay.date}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Returns a simplified TimelineView from an existing CookingSession,
 * including all steps, the minute-by-minute timeline, and total duration.
 */
export function getTimelineView(session: CookingSession): TimelineView {
  try {
    const totalMinutes = session.estimated_total_time_minutes;

    return {
      steps: session.steps,
      timeline: session.timeline,
      total_minutes: totalMinutes,
    };
  } catch (error) {
    throw new Error(
      `getTimelineView failed for session ${session.session_id}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
