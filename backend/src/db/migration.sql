-- ============================================================
-- Dieta App — Migration: Meal Templates + Rotation + RLS Fix
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

-- Enable UUID extension (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Drop old tables if they exist (no data yet) ────────────
DROP TABLE IF EXISTS dish_ingredients CASCADE;
DROP TABLE IF EXISTS dishes CASCADE;
DROP TABLE IF EXISTS meals CASCADE;
DROP TABLE IF EXISTS meal_days CASCADE;
DROP TABLE IF EXISTS consumption_logs CASCADE;
DROP TABLE IF EXISTS cooking_steps CASCADE;
DROP TABLE IF EXISTS cooking_sessions CASCADE;
DROP TABLE IF EXISTS shopping_list_items CASCADE;
DROP TABLE IF EXISTS shopping_lists CASCADE;
DROP TABLE IF EXISTS user_inventory CASCADE;
DROP TABLE IF EXISTS ingredients_master CASCADE;

-- ─── Master ingredient registry ──────────────────────────────
CREATE TABLE ingredients_master (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_name      TEXT NOT NULL UNIQUE,
  category            TEXT NOT NULL CHECK (category IN ('Granos','Proteínas','Verduras','Frutas','Lácteos','Bebidas','Otros')),
  aliases             TEXT[] DEFAULT '{}',
  unit_standard       TEXT NOT NULL CHECK (unit_standard IN ('g','ml','unidad','pieza','taza')),
  shelf_life_fridge   INTEGER,
  shelf_life_freezer  INTEGER,
  shelf_life_pantry   INTEGER,
  storage_location    TEXT NOT NULL CHECK (storage_location IN ('Nevera','Congelador','Despensa')),
  perishable          BOOLEAN NOT NULL DEFAULT true,
  nutrition_notes     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Meal templates (replaces meal_days) ─────────────────────
CREATE TABLE meal_templates (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label             TEXT NOT NULL,
  source_pdf_name   TEXT,
  raw_date_str      TEXT,
  confidence        NUMERIC(4,3) CHECK (confidence >= 0 AND confidence <= 1),
  warnings          TEXT[] DEFAULT '{}',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Rotation config (single-row) ───────────────────────────
CREATE TABLE rotation_config (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_order   UUID[] DEFAULT '{}',
  start_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  rest_days        INTEGER[] DEFAULT '{6}',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default rotation config row
INSERT INTO rotation_config (start_date, rest_days) VALUES (CURRENT_DATE, '{6}');

-- ─── Meals per template ──────────────────────────────────────
CREATE TABLE meals (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id   UUID NOT NULL REFERENCES meal_templates(id) ON DELETE CASCADE,
  meal_type     TEXT NOT NULL CHECK (meal_type IN ('Al despertar','Desayuno','Medio día','Comida','Media tarde','Cena')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Dishes per meal ─────────────────────────────────────────
CREATE TABLE dishes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meal_id     UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Ingredients per dish ────────────────────────────────────
CREATE TABLE dish_ingredients (
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

-- ─── User inventory ──────────────────────────────────────────
CREATE TABLE user_inventory (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id       TEXT NOT NULL,
  canonical_name      TEXT NOT NULL,
  quantity_remaining  NUMERIC NOT NULL DEFAULT 0 CHECK (quantity_remaining >= 0),
  unit                TEXT NOT NULL,
  purchase_date       DATE NOT NULL,
  expiry_date         DATE NOT NULL,
  storage_location    TEXT NOT NULL DEFAULT 'Despensa' CHECK (storage_location IN ('Nevera','Congelador','Despensa')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Shopping sessions ───────────────────────────────────────
CREATE TABLE shopping_lists (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      UUID NOT NULL DEFAULT uuid_generate_v4(),
  shopping_date   DATE NOT NULL,
  days_covered    INTEGER[] DEFAULT '{}',
  total_cost      NUMERIC,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Shopping list items ─────────────────────────────────────
CREATE TABLE shopping_list_items (
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

-- ─── Cooking sessions ────────────────────────────────────────
CREATE TABLE cooking_sessions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_date            DATE NOT NULL,
  estimated_total_minutes INTEGER,
  estimated_active_minutes INTEGER,
  efficiency_score        NUMERIC(4,3),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Cooking steps ───────────────────────────────────────────
CREATE TABLE cooking_steps (
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

-- ─── Consumption logs ────────────────────────────────────────
CREATE TABLE consumption_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ingredient_id   TEXT NOT NULL,
  quantity_used   NUMERIC NOT NULL,
  unit            TEXT NOT NULL,
  consumed_date   DATE NOT NULL,
  meal_date       DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX idx_meal_templates_active ON meal_templates(is_active);
CREATE INDEX idx_meals_template_id ON meals(template_id);
CREATE INDEX idx_dishes_meal_id ON dishes(meal_id);
CREATE INDEX idx_dish_ingredients_dish_id ON dish_ingredients(dish_id);
CREATE INDEX idx_dish_ingredients_master ON dish_ingredients(master_id);
CREATE INDEX idx_user_inventory_expiry ON user_inventory(expiry_date);
CREATE INDEX idx_shopping_list_items_list ON shopping_list_items(list_id);
CREATE INDEX idx_cooking_steps_session ON cooking_steps(session_id);
CREATE INDEX idx_consumption_logs_dates ON consumption_logs(consumed_date, meal_date);

-- ─── Updated_at trigger ──────────────────────────────────────
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

CREATE TRIGGER trg_rotation_config_updated_at
  BEFORE UPDATE ON rotation_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Row Level Security (using anon key) ─────────────────────
-- Since this app uses the anon key (not authenticated users),
-- we enable RLS and allow all operations for the anon role.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ingredients_master','meal_templates','rotation_config',
    'meals','dishes','dish_ingredients',
    'user_inventory','shopping_lists','shopping_list_items',
    'cooking_sessions','cooking_steps','consumption_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
      'allow_anon_' || t, t
    );
  END LOOP;
END $$;
