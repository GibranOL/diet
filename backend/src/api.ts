import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import * as dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

import { parseMealPDF } from "./services/pdfParser";
import { normalizeIngredients } from "./services/ingredientNormalizer";
import {
  generateShoppingLists,
  optimizeShoppingOrder,
} from "./services/shoppingListGenerator";
import {
  updateInventory,
  logConsumption,
  getCurrentInventory,
  getAlerts,
  predictWaste,
} from "./services/inventoryTracker";
import { optimizeCookingSequence } from "./services/cookingSequenceOptimizer";
import { generateScreenData } from "./services/mobileUIDataGenerator";
import {
  resolveRotation,
  rotationToMealDays,
  getNextLabel,
} from "./services/rotationResolver";
import {
  saveTemplate,
  getAllTemplates,
  updateTemplate as updateTemplateDB,
  deleteTemplate as deleteTemplateDB,
  getRotationConfig,
  saveRotationConfig,
  saveInventoryPurchase,
} from "./db/repository";
import type {
  MealTemplate,
  RotationConfig,
  InventoryItem,
  Purchase,
  ConsumptionLog,
  EquipmentConstraints,
  UserPreferences,
  ParsedMealDay,
} from "./types/index";

dotenv.config();

const app = express();
const port = process.env.PORT ?? 3000;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Multer: store uploads in /tmp
const upload = multer({ dest: path.join(process.cwd(), "tmp") });

// ─── In-memory state (hydrated from Supabase on startup) ────
let templates: MealTemplate[] = [];
let rotationConfig: RotationConfig = {
  template_order: [],
  start_date: new Date().toISOString().split("T")[0],
  rest_days: [6], // Sunday
};
let inventory: InventoryItem[] = [];

const DEFAULT_CONSTRAINTS: EquipmentConstraints = {
  num_burners: 2,
  num_pots: 2,
  num_pans: 2,
  has_oven: true,
};

// ─── Startup: load from Supabase ─────────────────────────────
async function loadState() {
  try {
    const dbTemplates = await getAllTemplates();
    if (dbTemplates.length > 0) {
      templates = dbTemplates;
      console.log(`Loaded ${templates.length} templates from Supabase`);
    }

    const dbConfig = await getRotationConfig();
    if (dbConfig) {
      rotationConfig = dbConfig;
      console.log("Loaded rotation config from Supabase");
    }
  } catch (err) {
    console.error("Error loading state from Supabase:", err);
  }
}

// ─── Helper: resolve today's meal from rotation ──────────────
function getTodaysMealDay(date: string): ParsedMealDay | null {
  if (templates.length === 0) return null;
  const rotation = resolveRotation(templates, rotationConfig, date, date);
  if (rotation.length === 0) return null; // rest day
  const days = rotationToMealDays(rotation);
  return days[0];
}

// ─── Health check ─────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), templates: templates.length });
});

// ─── PDF Upload & Parse → Create Template ─────────────────────
app.post("/api/upload-pdf", upload.array("pdfs", 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No PDF files uploaded" });
      return;
    }

    const results: MealTemplate[] = [];

    for (const file of files) {
      const parsed = await parseMealPDF(file.path);

      // Auto-assign label
      const existingLabels = templates.map((t) => t.label);
      const label = getNextLabel(existingLabels);

      const template: MealTemplate = {
        id: uuidv4(),
        label,
        source_pdf_name: file.originalname ?? "unknown.pdf",
        raw_date_str: parsed.raw_date_str,
        meals: parsed.meals,
        confidence: parsed.confidence,
        warnings: parsed.warnings,
        uploaded_at: new Date().toISOString(),
        is_active: true,
        sort_order: templates.length,
      };

      // Save to Supabase
      await saveTemplate(template);

      // Add to in-memory
      templates.push(template);

      // Add to rotation
      rotationConfig.template_order.push(template.id);

      results.push(template);
    }

    // Persist rotation config
    await saveRotationConfig(rotationConfig);

    res.json({
      uploaded_count: results.length,
      total_templates: templates.length,
      templates: results.map((t) => ({
        id: t.id,
        label: t.label,
        source_pdf_name: t.source_pdf_name,
        confidence: t.confidence,
        warnings: t.warnings,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Templates CRUD ──────────────────────────────────────────
app.get("/api/templates", (_req, res) => {
  res.json({
    count: templates.length,
    templates: templates.map((t) => ({
      id: t.id,
      label: t.label,
      source_pdf_name: t.source_pdf_name,
      meals_count: t.meals.length,
      meals_summary: t.meals.map((m) => m.mealType).join(", "),
      confidence: t.confidence,
      is_active: t.is_active,
      uploaded_at: t.uploaded_at,
    })),
  });
});

app.patch("/api/templates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { label, is_active } = req.body as { label?: string; is_active?: boolean };

    const template = templates.find((t) => t.id === id);
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    if (label !== undefined) template.label = label;
    if (is_active !== undefined) template.is_active = is_active;

    await updateTemplateDB(id, { label, is_active });
    res.json({ success: true, template: { id, label: template.label, is_active: template.is_active } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.delete("/api/templates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const idx = templates.findIndex((t) => t.id === id);
    if (idx < 0) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    templates.splice(idx, 1);
    rotationConfig.template_order = rotationConfig.template_order.filter((tid) => tid !== id);

    await deleteTemplateDB(id);
    await saveRotationConfig(rotationConfig);

    res.json({ success: true, remaining: templates.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Rotation ────────────────────────────────────────────────
app.get("/api/rotation", (_req, res) => {
  res.json(rotationConfig);
});

app.put("/api/rotation", async (req, res) => {
  try {
    const config = req.body as Partial<RotationConfig>;
    if (config.template_order) rotationConfig.template_order = config.template_order;
    if (config.start_date) rotationConfig.start_date = config.start_date;
    if (config.rest_days) rotationConfig.rest_days = config.rest_days;

    await saveRotationConfig(rotationConfig);
    res.json({ success: true, config: rotationConfig });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.get("/api/rotation/calendar", (req, res) => {
  try {
    const start = (req.query.start as string) ?? new Date().toISOString().split("T")[0];
    const endDate = new Date(start);
    endDate.setDate(endDate.getDate() + 30);
    const end = (req.query.end as string) ?? endDate.toISOString().split("T")[0];

    const rotation = resolveRotation(templates, rotationConfig, start, end);
    res.json({ days: rotation, count: rotation.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Normalize ingredients ────────────────────────────────────
app.get("/api/ingredients/normalize", (_req, res) => {
  try {
    const mealDays = rotationToMealDays(
      resolveRotation(templates, rotationConfig,
        new Date().toISOString().split("T")[0],
        new Date(Date.now() + 21 * 86400000).toISOString().split("T")[0])
    );
    if (mealDays.length === 0) {
      res.status(400).json({ error: "No templates loaded. Upload PDFs first." });
      return;
    }
    const registry = normalizeIngredients(mealDays);
    res.json(registry);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Shopping lists ───────────────────────────────────────────
app.post("/api/shopping/generate", (req, res) => {
  try {
    const { shopping_dates } = req.body as { shopping_dates?: string[] };
    if (!shopping_dates || shopping_dates.length === 0) {
      res.status(400).json({ error: "Provide shopping_dates array (YYYY-MM-DD)" });
      return;
    }
    const mealDays = rotationToMealDays(
      resolveRotation(templates, rotationConfig, shopping_dates[0], shopping_dates[shopping_dates.length - 1])
    );
    const output = generateShoppingLists(mealDays, inventory, shopping_dates);
    output.shopping_lists = output.shopping_lists.map(optimizeShoppingOrder);
    res.json(output);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Inventory ────────────────────────────────────────────────
app.get("/api/inventory", (_req, res) => {
  try {
    const current = getCurrentInventory(inventory);
    const alerts = getAlerts(current);
    res.json({ current_inventory: current, alerts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.post("/api/inventory/purchase", async (req, res) => {
  try {
    const purchase = req.body as Purchase;
    inventory = updateInventory(purchase, inventory);

    // Persist to Supabase
    const expiryDate = new Date(purchase.purchase_date);
    expiryDate.setDate(expiryDate.getDate() + purchase.shelf_life_days);
    await saveInventoryPurchase({
      ingredient_id: purchase.ingredient_id,
      canonical_name: purchase.canonical_name,
      quantity: purchase.quantity_purchased,
      unit: purchase.unit,
      purchase_date: purchase.purchase_date,
      expiry_date: expiryDate.toISOString().split("T")[0],
    });

    res.json({ success: true, inventory_count: inventory.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.post("/api/inventory/consume", (req, res) => {
  try {
    const log = req.body as ConsumptionLog;
    inventory = logConsumption(log, inventory);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

app.get("/api/inventory/waste-prediction", (_req, res) => {
  try {
    const mealDays = rotationToMealDays(
      resolveRotation(templates, rotationConfig,
        new Date().toISOString().split("T")[0],
        new Date(Date.now() + 21 * 86400000).toISOString().split("T")[0])
    );
    const prediction = predictWaste(inventory, mealDays);
    res.json(prediction);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Cooking sequence ─────────────────────────────────────────
app.post("/api/cooking/optimize", (req, res) => {
  try {
    const { date, constraints } = req.body as {
      date: string;
      constraints?: EquipmentConstraints;
    };
    const mealDay = getTodaysMealDay(date);
    if (!mealDay) {
      res.status(404).json({ error: `No meal plan found for date ${date} (rest day or no templates)` });
      return;
    }
    const session = optimizeCookingSequence(mealDay, constraints ?? DEFAULT_CONSTRAINTS);
    res.json(session);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Mobile UI data ───────────────────────────────────────────
app.get("/api/screen-data", (req, res) => {
  try {
    const requestedDate = (req.query.date as string) ?? new Date().toISOString().split("T")[0];

    // Resolve today's meal from rotation
    let mealDay = getTodaysMealDay(requestedDate);

    if (!mealDay && templates.length === 0) {
      res.status(404).json({ error: "No templates loaded. Upload PDFs first." });
      return;
    }

    // If rest day, use first template as fallback for screen data
    if (!mealDay && templates.length > 0) {
      const firstActive = templates.find((t) => t.is_active) ?? templates[0];
      mealDay = {
        date: requestedDate,
        raw_date_str: `Día de descanso`,
        meals: firstActive.meals,
        parsed_at: new Date().toISOString(),
        confidence: 1,
        warnings: ["Día de descanso — mostrando plantilla por defecto"],
      };
    }

    if (!mealDay) {
      res.status(404).json({ error: "No meal plans available" });
      return;
    }

    const date = mealDay.date;

    // Resolve 30 days of rotation for the meals screen
    const endDate = new Date(requestedDate);
    endDate.setDate(endDate.getDate() + 30);
    const rotation = resolveRotation(templates, rotationConfig, requestedDate, endDate.toISOString().split("T")[0]);
    const allMealDays = rotationToMealDays(rotation);

    // Find today's template label
    const todayRotation = rotation.find((r) => r.date === requestedDate);
    const templateLabel = todayRotation?.template_label;

    const cookingSession = optimizeCookingSequence(mealDay, DEFAULT_CONSTRAINTS);
    const currentInv = getCurrentInventory(inventory);
    const alerts = getAlerts(currentInv);
    const shoppingLists = generateShoppingLists(allMealDays, currentInv, [date]);

    const userPreferences: UserPreferences = {
      show_macros: false,
      show_costs: true,
      theme: "light",
    };

    const screenData = generateScreenData(
      {
        cooking_session: cookingSession,
        shopping_lists: shoppingLists.shopping_lists,
        current_inventory: {
          current_inventory: currentInv,
          alerts,
          summary: {
            total_items_tracked: currentInv.length,
            items_expiring_soon: alerts.filter((a) => a.type === "EXPIRING").length,
            items_at_risk: alerts.filter((a) => a.severity === "HIGH").length,
            storage_efficiency: `${Math.round((currentInv.filter((i) => i.status !== "EXPIRED").length / Math.max(currentInv.length, 1)) * 100)}%`,
          },
        },
        meal_days_21: allMealDays,
        user_preferences: userPreferences,
      },
      date
    );

    // Inject template label into today screen
    if (templateLabel) {
      screenData.screens.today.template_label = templateLabel;
    }

    // Inject template summaries and rotation into meals screen
    screenData.screens.meals.all_templates = templates.map((t) => ({
      id: t.id,
      label: t.label,
      meals_summary: t.meals.map((m) => m.dishes.map((d) => d.name).join(", ")).join(" | "),
      is_active: t.is_active,
      uploaded_at: t.uploaded_at,
    }));
    screenData.screens.meals.rotation_preview = rotation;

    res.json(screenData);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Meals (templates + rotation) ─────────────────────────────
app.get("/api/meals", (req, res) => {
  const start = (req.query.start as string) ?? new Date().toISOString().split("T")[0];
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + 30);
  const end = (req.query.end as string) ?? endDate.toISOString().split("T")[0];

  const rotation = resolveRotation(templates, rotationConfig, start, end);

  res.json({
    templates: templates.map((t) => ({
      id: t.id,
      label: t.label,
      source_pdf_name: t.source_pdf_name,
      meals: t.meals,
      confidence: t.confidence,
      is_active: t.is_active,
      uploaded_at: t.uploaded_at,
    })),
    rotation_config: rotationConfig,
    rotation_preview: rotation,
    meal_days: rotationToMealDays(rotation),
  });
});

// ─── Start ────────────────────────────────────────────────────
loadState().then(() => {
  app.listen(port, () => {
    console.log(`Dieta backend running on http://localhost:${port}`);
  });
});

export default app;
