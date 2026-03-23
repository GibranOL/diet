-- ============================================================
-- Dieta App — Supabase PostgreSQL Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Master ingredient registry ──────────────────────────────
CREATE TABLE IF NOT EXISTS ingredients_master (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_name      TEXT NOT NULL UNIQUE,
  category            TEXT NOT NULL CHECK (category IN ('Granos','Proteínas','Verduras','Frutas','Lácteos','Bebidas','Otros')),
  aliases             TEXT[] DEFAULT '{}',
  unit_standard       TEXT NOT NULL CHECK (unit_standard IN ('g','ml','unidad','pieza','taza')),
  shelf_life_fridge   INTEGER,   -- days
  shelf_life_freezer  INTEGER,   -- days
  shelf_life_pantry   INTEGER,   -- days
  storage_location    TEXT NOT NULL CHECK (storage_location IN ('Nevera','Congelador','Despensa')),
  perishable          BOOLEAN NOT NULL DEFAULT true,
  nutrition_notes     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Parsed meal days ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meal_days (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_date       DATE NOT NULL UNIQUE,
  raw_date_str    TEXT,
  confidence      NUMERIC(4,3) CHECK (confidence >= 0 AND confidence <= 1),
  warnings        TEXT[] DEFAULT '{}',
  parsed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Meals per day ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meals (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_id      UUID NOT NULL REFERENCES meal_days(id) ON DELETE CASCADE,
  meal_type   TEXT NOT NULL CHECK (meal_type IN ('Al despertar','Desayuno','Medio día','Comida','Media tarde','Cena')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Dishes per meal ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dishes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meal_id     UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Ingredients per dish ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS dish_ingredients (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dish_id           UUID NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  master_id         UUID REFERENCES ingredients_master(id),
  raw_name          TEXT NOT NULL,
  quantity          NUMERIC,
  unit              TEXT NOT NULL DEFAULT 'unknown',
  quantity_alt      TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── User inventory ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_inventory (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id       UUID NOT NULL REFERENCES ingredients_master(id),
  quantity_remaining  NUMERIC NOT NULL DEFAULT 0 CHECK (quantity_remaining >= 0),
  unit                TEXT NOT NULL,
  purchase_date       DATE NOT NULL,
  expiry_date         DATE NOT NULL,
  storage_location    TEXT NOT NULL CHECK (storage_location IN ('Nevera','Congelador','Despensa')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Shopping sessions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopping_lists (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL DEFAULT uuid_generate_v4(),
  shopping_date   DATE NOT NULL,
  days_covered    INTEGER[] DEFAULT '{}',
  total_cost      NUMERIC,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Shopping list items ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopping_list_items (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id               UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  ingredient_id         UUID REFERENCES ingredients_master(id),
  canonical_name        TEXT NOT NULL,
  quantity_to_buy       NUMERIC NOT NULL,
  unit                  TEXT NOT NULL,
  category              TEXT NOT NULL,
  estimated_cost        NUMERIC,
  buy_strategy          TEXT,
  badge                 TEXT,
  checked               BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Cooking sessions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cooking_sessions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_date            DATE NOT NULL,
  estimated_total_minutes INTEGER,
  estimated_active_minutes INTEGER,
  efficiency_score        NUMERIC(4,3),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Cooking steps ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cooking_steps (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id            UUID NOT NULL REFERENCES cooking_sessions(id) ON DELETE CASCADE,
  step_number           INTEGER NOT NULL,
  step_order            INTEGER NOT NULL,
  action                TEXT NOT NULL,
  description           TEXT,
  ingredients_involved  TEXT[] DEFAULT '{}',
  equipment             TEXT[] DEFAULT '{}',
  duration_minutes      INTEGER NOT NULL,
  activity_type         TEXT NOT NULL CHECK (activity_type IN ('ACTIVE','PASSIVE')),
  dependencies          INTEGER[] DEFAULT '{}',
  can_parallelize_with  INTEGER[] DEFAULT '{}',
  timer_alert_at_minute INTEGER,
  timer_alert_message   TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Consumption logs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consumption_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id   UUID NOT NULL REFERENCES ingredients_master(id),
  quantity_used   NUMERIC NOT NULL,
  unit            TEXT NOT NULL,
  consumed_date   DATE NOT NULL,
  meal_date       DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_meal_days_date ON meal_days(plan_date);
CREATE INDEX IF NOT EXISTS idx_meals_day_id ON meals(day_id);
CREATE INDEX IF NOT EXISTS idx_dishes_meal_id ON dishes(meal_id);
CREATE INDEX IF NOT EXISTS idx_dish_ingredients_dish_id ON dish_ingredients(dish_id);
CREATE INDEX IF NOT EXISTS idx_dish_ingredients_master ON dish_ingredients(master_id);
CREATE INDEX IF NOT EXISTS idx_user_inventory_ingredient ON user_inventory(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_user_inventory_expiry ON user_inventory(expiry_date);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list ON shopping_list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_cooking_steps_session ON cooking_steps(session_id);
CREATE INDEX IF NOT EXISTS idx_consumption_logs_ingredient ON consumption_logs(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_consumption_logs_dates ON consumption_logs(consumed_date, meal_date);

-- ─── Updated_at trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ingredients_master_updated_at
  BEFORE UPDATE ON ingredients_master
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_user_inventory_updated_at
  BEFORE UPDATE ON user_inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Row Level Security ───────────────────────────────────────
-- Single-user app: only authenticated users can access their data
ALTER TABLE ingredients_master   ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_days            ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals                ENABLE ROW LEVEL SECURITY;
ALTER TABLE dishes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE dish_ingredients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_inventory       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cooking_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cooking_steps        ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumption_logs     ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (single-user app)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ingredients_master','meal_days','meals','dishes','dish_ingredients',
    'user_inventory','shopping_lists','shopping_list_items',
    'cooking_sessions','cooking_steps','consumption_logs'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      'allow_authenticated_' || t, t
    );
  END LOOP;
END $$;
