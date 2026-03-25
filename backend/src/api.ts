import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import * as dotenv from "dotenv";

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
import type {
  ParsedMealDay,
  InventoryItem,
  Purchase,
  ConsumptionLog,
  EquipmentConstraints,
  UserPreferences,
} from "./types/index";

dotenv.config();

const app = express();
const port = process.env.PORT ?? 3000;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Multer: store uploads in /tmp
const upload = multer({ dest: path.join(process.cwd(), "tmp") });

// ─── In-memory state (replace with Supabase persistence later) ──
let mealDays: ParsedMealDay[] = [];
let inventory: InventoryItem[] = [];

// ─── Health check ─────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── PDF Upload & Parse ───────────────────────────────────────
app.post("/api/upload-pdf", upload.array("pdfs", 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No PDF files uploaded" });
      return;
    }

    const parsed = await Promise.all(
      files.map((f) => parseMealPDF(f.path))
    );

    // Merge with existing meal days (deduplicate by date)
    for (const day of parsed) {
      const idx = mealDays.findIndex((d) => d.date === day.date);
      if (idx >= 0) mealDays[idx] = day;
      else mealDays.push(day);
    }
    mealDays.sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      parsed_count: parsed.length,
      total_days: mealDays.length,
      days: parsed.map((d) => ({ date: d.date, confidence: d.confidence, warnings: d.warnings })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Normalize ingredients ────────────────────────────────────
app.get("/api/ingredients/normalize", (_req, res) => {
  try {
    if (mealDays.length === 0) {
      res.status(400).json({ error: "No meal days loaded. Upload PDFs first." });
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

app.post("/api/inventory/purchase", (req, res) => {
  try {
    const purchase = req.body as Purchase;
    inventory = updateInventory(purchase, inventory);
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
    const mealDay = mealDays.find((d) => d.date === date);
    if (!mealDay) {
      res.status(404).json({ error: `No meal plan found for date ${date}` });
      return;
    }
    const defaultConstraints: EquipmentConstraints = {
      num_burners: 2,
      num_pots: 2,
      num_pans: 2,
      has_oven: true,
    };
    const session = optimizeCookingSequence(mealDay, constraints ?? defaultConstraints);
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
    let mealDay = mealDays.find((d) => d.date === requestedDate);

    // Fallback: if no plan for the requested date, use the first available day
    if (!mealDay && mealDays.length > 0) {
      mealDay = mealDays[0];
    }
    if (!mealDay) {
      res.status(404).json({ error: "No meal plans loaded. Upload PDFs first." });
      return;
    }

    const date = mealDay.date;

    const defaultConstraints: EquipmentConstraints = {
      num_burners: 2,
      num_pots: 2,
      num_pans: 2,
      has_oven: true,
    };
    const cookingSession = optimizeCookingSequence(mealDay, defaultConstraints);
    const currentInv = getCurrentInventory(inventory);
    const alerts = getAlerts(currentInv);
    const shoppingLists = generateShoppingLists(mealDays, currentInv, [date]);

    const userPreferences: UserPreferences = {
      show_macros: false,
      show_costs: true,
      theme: "light",
    };

    const screenData = generateScreenData(
      {
        cooking_session: cookingSession,
        shopping_lists: shoppingLists.shopping_lists,
        current_inventory: { current_inventory: currentInv, alerts, summary: {
          total_items_tracked: currentInv.length,
          items_expiring_soon: alerts.filter(a => a.type === "EXPIRING").length,
          items_at_risk: alerts.filter(a => a.severity === "HIGH").length,
          storage_efficiency: `${Math.round((currentInv.filter(i => i.status !== "EXPIRED").length / Math.max(currentInv.length, 1)) * 100)}%`,
        }},
        meal_days_21: mealDays,
        user_preferences: userPreferences,
      },
      date
    );
    res.json(screenData);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ─── Raw meal days ────────────────────────────────────────────
app.get("/api/meals", (_req, res) => {
  res.json({ count: mealDays.length, meal_days: mealDays });
});

// ─── Start ────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`Dieta backend running on http://localhost:${port}`);
});

export default app;
