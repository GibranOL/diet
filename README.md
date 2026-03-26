# Dieta - Smart Diet Management App

A full-stack mobile application that transforms nutritionist-prescribed PDF meal plans into reusable **meal templates** with automatic rotation, optimized cooking sequences, smart shopping lists, and real-time inventory tracking.

Built as a personal tool to streamline meal plan cycles from [Mundo Nutrition](https://www.mundonutrition.com/).

**Live backend:** [https://diet-z4vm.onrender.com](https://diet-z4vm.onrender.com/health)

---

## The Problem

Every 3 weeks I receive 3 PDF meal plans from my nutritionist. Managing these manually meant:

- Manually reading each PDF and figuring out what to buy
- Forgetting ingredients or buying duplicates
- Wasting perishable items that expired before use
- Spending more time planning meals than actually cooking
- No visibility into what's in the fridge vs. what's needed
- **PDFs are not tied to specific dates** — they're reusable templates that rotate throughout the week

## The Solution

**Dieta** automates the entire workflow:

```
PDF Upload → Parse → Create Template (A, B, C...)
                          ↓
              Rotation Engine (Mon=A, Tue=B, Wed=C, Thu=A... Sun=Rest)
                          ↓
   Shopping Lists ← Inventory Tracker ← Cooking Optimizer → Mobile App
```

Upload the PDFs once, and they become permanent templates that rotate automatically. The app handles what to buy, when to buy it, how to cook it efficiently, and what to use before it expires. Data persists in Supabase — no data loss on server restarts.

---

## Features

### Meal Template System
- PDFs are parsed into **reusable templates** labeled A, B, C, etc.
- Templates accumulate over time (3 new ones every 3 weeks, old ones remain available)
- Each template can be toggled active/inactive
- Auto-labeling: first upload = A, second = B, etc.

### Automatic Rotation
- Round-robin assignment: Mon=A, Tue=B, Wed=C, Thu=A, Fri=B, Sat=C
- **Sundays are rest days** (configurable)
- Calendar view shows which template is assigned to each day
- Color-coded badges per template for quick visual identification
- Rotation configuration is fully customizable via API

### PDF Parsing
- Extracts structured meal data from Mundo Nutrition PDF format
- Recognizes 6 daily meal types: Al despertar, Desayuno, Medio dia, Comida, Media tarde, Cena
- Parses ingredients with quantities, units, and alternative measurements
- Handles multiple date formats in Spanish
- Confidence scoring and warning system for parse quality

### Smart Shopping Lists
- Aggregates ingredients across rotated meal days
- Deducts current inventory to avoid buying what you already have
- Groups items by category (Proteinas, Verduras, Frutas, Lacteos, Granos, Bebidas)
- Warns about shelf-life risks (items that may expire before use)
- Suggests buy strategies: bulk for non-perishables, last-minute for perishables

### Cooking Sequence Optimizer
- Analyzes each day's meals and generates a step-by-step cooking plan
- Parallelizes tasks (e.g., boil rice while chopping vegetables)
- Respects equipment constraints (configurable burners, pots, pans)
- Estimates total cooking time with active vs. passive breakdown
- Timer indicators for passive steps (boiling, marinating, etc.)

### Inventory Tracking
- Tracks quantities, purchase dates, and expiry
- Status indicators: OK, Use Next, Expiring Soon, Expired
- **Purchase form** in the app to register new items
- Waste prediction: flags items at risk of expiring before planned use
- Consumption logging to keep stock levels accurate
- Smart alerts with actionable recommendations (consume, freeze, reorganize, discard)

### Data Persistence (Supabase)
- All templates, rotation config, and inventory persist in PostgreSQL
- Survives server restarts (Render free tier spins down after ~15 min idle)
- Row-level security policies for the `anon` role
- Falls back gracefully to in-memory mode if Supabase is unavailable

### Mobile App (5 screens)
- **Today**: Daily cooking plan with step-by-step instructions, meal list, template badge, and inventory alerts
- **Shopping**: Categorized shopping list with checkboxes, cost estimates, and waste-risk badges
- **Inventory**: Current stock with expiry status, recommended actions, and purchase form (FAB + modal)
- **Meals**: Interactive calendar with color-coded template labels, rest days, template list, and day detail view
- **Upload**: PDF upload interface with drag-and-drop for new meal plan cycles

---

## Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| **Node.js + TypeScript** | Server runtime with full type safety |
| **Express.js** | REST API framework |
| **Supabase (PostgreSQL)** | Persistent database with RLS |
| **pdf-parse** | PDF text extraction |
| **Fuse.js** | Fuzzy matching for ingredient deduplication |
| **Multer** | Multipart file upload handling |
| **Render.com** | Cloud deployment (free tier) |

### Mobile App
| Technology | Purpose |
|---|---|
| **React Native** | Cross-platform mobile framework |
| **Expo SDK 54** | Development toolchain and build service |
| **React Navigation** | Tab and stack navigation |
| **Zustand** | Lightweight state management |
| **EAS Build** | Android APK generation |

---

## Architecture

```
dieta/
├── backend/
│   └── src/
│       ├── services/
│       │   ├── pdfParser.ts                  # PDF → structured meal data
│       │   ├── ingredientNormalizer.ts        # Fuzzy dedup + categorization
│       │   ├── shoppingListGenerator.ts       # Optimized shopping lists
│       │   ├── inventoryTracker.ts            # Stock, expiry, waste prediction
│       │   ├── cookingSequenceOptimizer.ts    # Parallel cooking plans
│       │   ├── rotationResolver.ts            # Round-robin template rotation
│       │   └── mobileUIDataGenerator.ts       # Mobile-ready screen data
│       ├── db/
│       │   ├── migration.sql                  # Full schema (12 tables with RLS)
│       │   ├── repository.ts                  # Supabase CRUD with fallback
│       │   └── supabaseClient.ts              # Database connection
│       ├── api.ts                             # Express REST endpoints
│       └── types/index.ts                     # Shared TypeScript interfaces
│
└── app/
    ├── screens/
    │   ├── Today.tsx          # Daily cooking plan + alerts + template badge
    │   ├── Shopping.tsx       # Categorized shopping list
    │   ├── Inventory.tsx      # Stock management + purchase form
    │   ├── Meals.tsx          # Calendar with template rotation
    │   ├── MealDetail.tsx     # Full meal/template detail view
    │   └── UploadPDF.tsx      # PDF upload interface
    ├── store/
    │   └── useStore.ts        # Zustand state (templates, rotation, screen data)
    ├── types/
    │   └── index.ts           # Mobile-specific types
    └── App.tsx                # Tab + stack navigation entry point
```

### Service Pipeline

Each service is a pure function that feeds into the next:

1. **pdfParser** — Extracts dates, meals, dishes, and ingredients from PDF files
2. **ingredientNormalizer** — Deduplicates ingredient names using fuzzy matching (Fuse.js) and assigns categories, shelf life, and storage info
3. **rotationResolver** — Assigns templates to dates using round-robin, skipping rest days. Outputs `RotationDay[]` which converts to `ParsedMealDay[]` for backward compatibility with all downstream services
4. **shoppingListGenerator** — Aggregates needs across rotated days, deducts inventory, splits into shopping sessions, and flags shelf-life risks
5. **inventoryTracker** — Manages stock levels, tracks expiry dates, predicts waste, and generates prioritized alerts
6. **cookingSequenceOptimizer** — Identifies cooking techniques, parallelizes steps, respects equipment limits, and generates a timeline
7. **mobileUIDataGenerator** — Transforms all service outputs into React Native-ready screen data with formatting, emojis, and caching metadata

### Repository Layer

The `repository.ts` module provides a thin persistence layer over Supabase:

- **saveTemplate()** — Cascading insert: `meal_templates` → `meals` → `dishes` → `dish_ingredients`
- **getAllTemplates()** — Embedded select with nested joins, reconstructs full `MealTemplate` objects
- **updateTemplate() / deleteTemplate()** — CRUD with cascade deletes
- **getRotationConfig() / saveRotationConfig()** — Single-row upsert pattern
- **saveInventoryPurchase()** — Merge-or-insert inventory items

All functions gracefully no-op when Supabase is unavailable.

---

## API Endpoints

### Templates & Rotation
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload-pdf` | Upload PDFs → auto-create templates (A, B, C...) |
| `GET` | `/api/templates` | List all templates with metadata |
| `PATCH` | `/api/templates/:id` | Update template label or active status |
| `DELETE` | `/api/templates/:id` | Delete a template and remove from rotation |
| `GET` | `/api/rotation` | Get current rotation configuration |
| `PUT` | `/api/rotation` | Update rotation (template order, start date, rest days) |
| `GET` | `/api/rotation/calendar` | Get rotation calendar for date range |
| `GET` | `/api/meals` | Get templates + rotation preview + resolved meal days |

### Services
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/screen-data` | Consolidated data for all mobile screens |
| `GET` | `/api/ingredients/normalize` | Normalize and deduplicate ingredients |
| `POST` | `/api/shopping/generate` | Generate optimized shopping lists |
| `POST` | `/api/cooking/optimize` | Generate cooking sequence for a date |

### Inventory
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/inventory` | Get current inventory with alerts |
| `POST` | `/api/inventory/purchase` | Record a purchase |
| `POST` | `/api/inventory/consume` | Log ingredient consumption |
| `GET` | `/api/inventory/waste-prediction` | Predict waste risk |

### System
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check with template count |

---

## Database Schema

12 PostgreSQL tables with UUID primary keys, cascading deletes, row-level security, and auto-updating timestamps:

| Table | Purpose |
|---|---|
| `meal_templates` | Reusable meal plan templates (A, B, C...) |
| `rotation_config` | Single-row rotation settings (template order, rest days) |
| `meals` | Meals per template (references `meal_templates`) |
| `dishes` | Dishes per meal |
| `dish_ingredients` | Ingredients per dish with quantities |
| `ingredients_master` | Canonical ingredient registry with shelf life data |
| `user_inventory` | Current kitchen stock with expiry tracking |
| `shopping_lists` | Shopping sessions |
| `shopping_list_items` | Items per shopping session |
| `cooking_sessions` | Cooking plans per date |
| `cooking_steps` | Steps per cooking session |
| `consumption_logs` | Usage tracking |

All tables have RLS enabled with policies allowing the `anon` role (app uses Supabase anon key).

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`) for building APK
- Supabase project (free tier) — optional but recommended for persistence

### Backend

```bash
cd backend
npm install
npm run build
npm start          # Runs on http://localhost:3000
```

Environment variables (create `backend/.env`):
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
PORT=3000
```

### Database Setup

Run `backend/src/db/migration.sql` in the Supabase SQL Editor to create all tables with RLS policies.

### Mobile App

```bash
cd app
npm install
npx expo start     # Development server
```

Build APK:
```bash
cd app
eas build --platform android --profile preview
```

---

## How It Works in Practice

1. **Receive PDFs** from nutritionist (3 new ones every 3 weeks)
2. **Upload** through the app's Upload tab
3. **Templates created** automatically (A, B, C) and added to rotation
4. **Rotation resolves** which template to use each day (Mon-Sat, Sunday rest)
5. **Today tab**: See exactly what to cook and in what order, with the template badge
6. **Shopping tab**: Check off items at the grocery store, grouped by category
7. **Inventory tab**: Track what's in the fridge, register purchases, get expiry alerts
8. **Meals tab**: Browse the calendar with color-coded template assignments
9. **Data persists** in Supabase — survives server restarts and idle timeouts

---

## Deployment

- **Backend**: [Render.com](https://render.com) free tier (Oregon region, auto-deploy from GitHub)
- **Database**: [Supabase](https://supabase.com) free tier (PostgreSQL + RLS)
- **Mobile**: [EAS Build](https://expo.dev) for Android APK distribution

---

## Built With

This project was built using **Claude Code** (Anthropic's AI coding assistant) as a pair programming partner for architecture design, service implementation, and deployment configuration.

---

## License

This is a personal project. Not intended for redistribution.
