import { supabase } from "./supabaseClient";
import type {
  MealTemplate,
  RotationConfig,
  Meal,
  Dish,
  RawIngredient,
  MealType,
} from "../types/index";

// ─── Templates ───────────────────────────────────────────────

export async function saveTemplate(template: MealTemplate): Promise<MealTemplate | null> {
  if (!supabase) return null;

  // 1. Insert template row
  const { data: tpl, error: tplErr } = await supabase
    .from("meal_templates")
    .insert({
      id: template.id,
      label: template.label,
      source_pdf_name: template.source_pdf_name,
      raw_date_str: template.raw_date_str,
      confidence: template.confidence,
      warnings: template.warnings,
      is_active: template.is_active,
      sort_order: template.sort_order,
    })
    .select()
    .single();

  if (tplErr) {
    console.error("Error saving template:", tplErr.message);
    return null;
  }

  // 2. Insert meals, dishes, ingredients
  for (const meal of template.meals) {
    const { data: mealRow, error: mealErr } = await supabase
      .from("meals")
      .insert({
        template_id: template.id,
        meal_type: meal.mealType,
      })
      .select()
      .single();

    if (mealErr || !mealRow) {
      console.error("Error saving meal:", mealErr?.message);
      continue;
    }

    for (const dish of meal.dishes) {
      const { data: dishRow, error: dishErr } = await supabase
        .from("dishes")
        .insert({
          meal_id: mealRow.id,
          name: dish.name,
        })
        .select()
        .single();

      if (dishErr || !dishRow) {
        console.error("Error saving dish:", dishErr?.message);
        continue;
      }

      if (dish.ingredients.length > 0) {
        const ingRows = dish.ingredients.map((ing) => ({
          dish_id: dishRow.id,
          raw_name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit || "unknown",
          quantity_alt: ing.quantity_alt,
          notes: ing.notes,
        }));

        const { error: ingErr } = await supabase
          .from("dish_ingredients")
          .insert(ingRows);

        if (ingErr) {
          console.error("Error saving ingredients:", ingErr.message);
        }
      }
    }
  }

  return template;
}

export async function getAllTemplates(): Promise<MealTemplate[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("meal_templates")
    .select(`
      *,
      meals (
        id, meal_type,
        dishes (
          id, name,
          dish_ingredients (
            raw_name, quantity, unit, quantity_alt, notes
          )
        )
      )
    `)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error loading templates:", error.message);
    return [];
  }

  return (data ?? []).map((row: any): MealTemplate => ({
    id: row.id,
    label: row.label,
    source_pdf_name: row.source_pdf_name ?? "",
    raw_date_str: row.raw_date_str ?? "",
    confidence: parseFloat(row.confidence) || 0,
    warnings: row.warnings ?? [],
    uploaded_at: row.uploaded_at ?? row.created_at,
    is_active: row.is_active,
    sort_order: row.sort_order,
    meals: (row.meals ?? []).map((m: any): Meal => ({
      mealType: m.meal_type as MealType,
      dishes: (m.dishes ?? []).map((d: any): Dish => ({
        name: d.name,
        ingredients: (d.dish_ingredients ?? []).map((i: any): RawIngredient => ({
          name: i.raw_name,
          quantity: i.quantity != null ? parseFloat(i.quantity) : null,
          unit: i.unit,
          quantity_alt: i.quantity_alt,
          notes: i.notes,
        })),
      })),
    })),
  }));
}

export async function updateTemplate(
  id: string,
  changes: { label?: string; is_active?: boolean }
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("meal_templates")
    .update(changes)
    .eq("id", id);
  if (error) console.error("Error updating template:", error.message);
}

export async function deleteTemplate(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("meal_templates")
    .delete()
    .eq("id", id);
  if (error) console.error("Error deleting template:", error.message);
}

// ─── Rotation Config ─────────────────────────────────────────

export async function getRotationConfig(): Promise<RotationConfig | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("rotation_config")
    .select("*")
    .limit(1)
    .single();

  if (error || !data) return null;

  return {
    template_order: data.template_order ?? [],
    start_date: data.start_date,
    rest_days: data.rest_days ?? [6],
  };
}

export async function saveRotationConfig(config: RotationConfig): Promise<void> {
  if (!supabase) return;

  // Upsert the single row
  const { data: existing } = await supabase
    .from("rotation_config")
    .select("id")
    .limit(1)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("rotation_config")
      .update({
        template_order: config.template_order,
        start_date: config.start_date,
        rest_days: config.rest_days,
      })
      .eq("id", existing.id);
    if (error) console.error("Error updating rotation config:", error.message);
  } else {
    const { error } = await supabase
      .from("rotation_config")
      .insert({
        template_order: config.template_order,
        start_date: config.start_date,
        rest_days: config.rest_days,
      });
    if (error) console.error("Error inserting rotation config:", error.message);
  }
}

// ─── Inventory ───────────────────────────────────────────────

export async function saveInventoryPurchase(purchase: {
  ingredient_id: string;
  canonical_name: string;
  quantity: number;
  unit: string;
  purchase_date: string;
  expiry_date: string;
}): Promise<void> {
  if (!supabase) return;

  // Check if item exists
  const { data: existing } = await supabase
    .from("user_inventory")
    .select("id, quantity_remaining")
    .eq("ingredient_id", purchase.ingredient_id)
    .limit(1)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("user_inventory")
      .update({
        quantity_remaining: existing.quantity_remaining + purchase.quantity,
        expiry_date: purchase.expiry_date,
        purchase_date: purchase.purchase_date,
      })
      .eq("id", existing.id);
    if (error) console.error("Error updating inventory:", error.message);
  } else {
    const { error } = await supabase
      .from("user_inventory")
      .insert({
        ingredient_id: purchase.ingredient_id,
        canonical_name: purchase.canonical_name,
        quantity_remaining: purchase.quantity,
        unit: purchase.unit,
        purchase_date: purchase.purchase_date,
        expiry_date: purchase.expiry_date,
      });
    if (error) console.error("Error inserting inventory:", error.message);
  }
}
