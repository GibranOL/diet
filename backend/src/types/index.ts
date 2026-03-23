// ============================================================
// SHARED TYPES — Dieta App
// All services import from here for type consistency
// ============================================================

// ─── PDF Parser Types ───────────────────────────────────────

export type MealType =
  | "Al despertar"
  | "Desayuno"
  | "Medio día"
  | "Comida"
  | "Media tarde"
  | "Cena";

export interface RawIngredient {
  name: string;
  quantity: number | null;
  unit: string;
  quantity_alt: string | null;
  notes: string | null;
}

export interface Dish {
  name: string;
  ingredients: RawIngredient[];
}

export interface Meal {
  mealType: MealType;
  dishes: Dish[];
}

export interface ParsedMealDay {
  date: string; // YYYY-MM-DD
  raw_date_str: string;
  meals: Meal[];
  parsed_at: string;
  confidence: number;
  warnings: string[];
}

// ─── Ingredient Normalizer Types ────────────────────────────

export type IngredientCategory =
  | "Granos"
  | "Proteínas"
  | "Verduras"
  | "Frutas"
  | "Lácteos"
  | "Bebidas"
  | "Otros";

export type UnitStandard = "g" | "ml" | "unidad" | "pieza" | "taza";

export type StorageLocation = "Nevera" | "Congelador" | "Despensa";

export interface ShelfLife {
  fridge_days: number | null;
  freezer_days: number | null;
  pantry_days: number | null;
}

export interface MasterIngredient {
  id: string;
  canonical_name: string;
  category: IngredientCategory;
  aliases: string[];
  unit_standard: UnitStandard;
  shelf_life: ShelfLife;
  storage_location: StorageLocation;
  perishable: boolean;
  nutrition_notes: string | null;
  last_updated: string;
}

export interface NormalizedIngredientRegistry {
  master_ingredients: MasterIngredient[];
  ingredient_mapping: Record<string, string>; // raw name → ingredient id
  new_ingredients_found: number;
  standardization_confidence: number;
}

// ─── Inventory Types ────────────────────────────────────────

export type InventoryStatus = "OK" | "USE_NEXT" | "EXPIRING_SOON" | "EXPIRED";

export type AlertSeverity = "HIGH" | "MEDIUM" | "LOW";
export type AlertType = "EXPIRING" | "WASTE_RISK" | "LOW_STOCK" | "NOT_IN_USE";
export type AlertAction =
  | "CONSUME_IMMEDIATELY"
  | "REORGANIZE_MEALS"
  | "FREEZE"
  | "DISCARD";

export interface UpcomingMealUsage {
  meal_date: string;
  meal_type: MealType;
  quantity_needed: number;
  unit: string;
}

export interface ConsumptionEstimate {
  days_of_supply: number;
  will_expire_before_use: boolean;
  recommendation: string;
}

export interface InventoryItem {
  ingredient_id: string;
  canonical_name: string;
  quantity_remaining: number;
  unit: string;
  purchase_date: string;
  expiry_date: string;
  days_until_expiry: number;
  status: InventoryStatus;
  used_in_upcoming_meals: UpcomingMealUsage[];
  consumption_estimate: ConsumptionEstimate;
  storage_location: StorageLocation;
}

export interface InventoryAlert {
  severity: AlertSeverity;
  type: AlertType;
  ingredient: string;
  message: string;
  action: AlertAction;
}

export interface InventoryOutput {
  current_inventory: InventoryItem[];
  alerts: InventoryAlert[];
  summary: {
    total_items_tracked: number;
    items_expiring_soon: number;
    items_at_risk: number;
    storage_efficiency: string;
  };
}

export interface Purchase {
  ingredient_id: string;
  canonical_name: string;
  quantity_purchased: number;
  unit: string;
  purchase_date: string;
  shelf_life_days: number;
}

export interface ConsumptionLog {
  ingredient_id: string;
  quantity_used: number;
  unit: string;
  consumed_date: string;
  meal_date: string;
}

export interface WastePrediction {
  at_risk_items: InventoryItem[];
  total_waste_risk_value: number;
  recommendations: string[];
}

// ─── Shopping List Types ─────────────────────────────────────

export type BuyStrategy =
  | "Compra cuando vayas a cocinar (perecedero)"
  | "Compra en cantidad (no perecedero)"
  | "Compra con anticipación";

export interface ShoppingItem {
  ingredient_id: string;
  canonical_name: string;
  quantity_needed_total: number;
  quantity_in_inventory: number;
  quantity_to_buy: number;
  unit: string;
  frequency: string;
  buy_strategy: BuyStrategy;
  estimated_cost_per_unit?: number;
  estimated_total_cost?: number;
  notes: string | null;
  badge?: "EXPIRING_SOON" | "EARLY_BUY_WARNING" | "WASTE_RISK" | null;
}

export interface ShoppingCategory {
  category: IngredientCategory;
  items: ShoppingItem[];
  subtotal?: number;
}

export interface ShoppingList {
  shopping_session_id: string;
  shopping_date: string;
  days_covered: number[];
  by_category: ShoppingCategory[];
  summary: {
    total_items: number;
    total_cost_estimated?: number;
    critical_items: number;
    warnings: string[];
  };
}

export interface InventoryGap {
  ingredient: string;
  reason: string;
  action: "MUST_BUY" | "OPTIONAL";
}

export interface ShoppingListOutput {
  shopping_lists: ShoppingList[];
  inventory_gaps: InventoryGap[];
  optimization_notes: string;
}

// ─── Cooking Sequence Types ──────────────────────────────────

export type ActivityType = "ACTIVE" | "PASSIVE";

export interface CookingStep {
  step_id: number;
  order: number;
  action: string;
  description: string;
  ingredients_involved: string[];
  equipment: string[];
  duration_minutes: number;
  activity_type: ActivityType;
  can_parallelize_with: number[];
  dependencies: number[];
  timer_alert_at_minute?: number;
  timer_alert_message?: string;
  notes: string;
}

export interface CleanupAction {
  after_step: number;
  action: string;
  equipment: string[];
  duration_minutes: number;
  is_optional: boolean;
}

export interface MealAssignment {
  meal_type: MealType;
  dishes: string[];
  ready_at_minute: number;
  components_ready: Record<string, string[]>;
}

export interface EfficiencyMetrics {
  parallelization_score: number;
  equipment_utilization: number;
  estimated_savings_vs_sequential: string;
}

export interface CookingSession {
  session_id: string;
  date: string;
  meals_to_prepare: MealType[];
  estimated_active_time_minutes: number;
  estimated_total_time_minutes: number;
  equipment_needed: string[];
  steps: CookingStep[];
  timeline: Record<string, string[]>;
  cleanup_plan: CleanupAction[];
  meal_assignments: MealAssignment[];
  efficiency_metrics: EfficiencyMetrics;
}

export interface EquipmentConstraints {
  num_burners: number;
  num_pots: number;
  num_pans: number;
  has_oven: boolean;
  prep_space_m2?: number;
}

export interface CookingPreferences {
  max_cooking_time_minutes: number;
  minimize_cleanup: boolean;
  parallel_operations: boolean;
}

export interface TimelineView {
  steps: CookingStep[];
  timeline: Record<string, string[]>;
  total_minutes: number;
}

// ─── Mobile UI Types ─────────────────────────────────────────

export interface UserPreferences {
  show_macros: boolean;
  show_costs: boolean;
  theme: "light" | "dark";
}

export interface AllServiceOutputs {
  cooking_session: CookingSession;
  shopping_lists: ShoppingList[];
  current_inventory: InventoryOutput;
  meal_days_21: ParsedMealDay[];
  user_preferences: UserPreferences;
}

export interface MobileScreenData {
  screens: {
    today: TodayScreenData;
    shopping: ShoppingScreenData;
    inventory: InventoryScreenData;
    meals: MealsScreenData;
    upload_pdf: UploadPDFScreenData;
  };
  meta: {
    generated_at: string;
    cache_valid_until: string;
    requires_refresh: boolean;
    offline_ready: boolean;
  };
}

export interface TodayScreenData {
  date: string;
  day_number: number;
  cooking_section: {
    estimated_time_minutes: number;
    start_button: boolean;
    steps: MobileStep[];
    current_step_highlight: number;
  };
  meals_today: MobileMeal[];
  inventory_alerts: MobileAlert[];
  quick_actions: QuickAction[];
}

export interface MobileStep {
  step_id: number;
  order: number;
  action: string;
  duration: string;
  timer_enabled: boolean;
  parallel?: boolean;
  parallel_text?: string;
  details?: string;
}

export interface MobileMeal {
  type: MealType;
  time: string;
  dishes: string[];
  ingredients_preview: string;
  ready_at: string;
}

export interface MobileAlert {
  severity: "high" | "medium" | "low";
  emoji: string;
  message: string;
  action: string;
}

export interface QuickAction {
  label: string;
  action: string;
}

export interface ShoppingScreenData {
  upcoming_session: {
    date: string;
    days_covered: number;
    total_cost_estimated?: number;
    items_count: number;
    by_category: MobileShoppingCategory[];
    warnings: string[];
  } | null;
  past_sessions: { date: string; total_spent?: number; items: number }[];
}

export interface MobileShoppingCategory {
  category: string;
  items: MobileShoppingItem[];
  subtotal?: number;
}

export interface MobileShoppingItem {
  name: string;
  quantity: string;
  cost?: string;
  checkbox: boolean;
  badge?: string | null;
}

export interface InventoryScreenData {
  items: MobileInventoryItem[];
  alerts_count: number;
  summary_text: string;
}

export interface MobileInventoryItem {
  name: string;
  quantity: string;
  expiry: string;
  status: InventoryStatus;
  emoji: string;
  used_in_next_meals: number;
  action: string;
}

export interface MealsScreenData {
  current_week: WeekDaySummary[];
  all_21_days: DaySummary[];
}

export interface WeekDaySummary {
  date: string;
  day: string;
  quick_meals: string[];
  cooking_time: string;
  view_detail: boolean;
}

export interface DaySummary {
  date: string;
  day_of_plan: number;
  meals_summary: string;
  cooking_estimated: string;
  tap_for_details: boolean;
}

export interface UploadPDFScreenData {
  status: "READY" | "UPLOADING" | "PROCESSING" | "SUCCESS" | "ERROR";
  progress_percent: number;
  current_plan_days_remaining: number;
  next_upload_recommended: string;
  instructions: string;
}
