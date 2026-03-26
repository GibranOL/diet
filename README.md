# Dieta - Smart Diet Management App

A full-stack mobile application that transforms nutritionist-prescribed PDF meal plans into an automated kitchen management system — from parsing and shopping lists to optimized cooking sequences and inventory tracking.

Built as a personal tool to streamline a 21-day meal plan cycle from [Mundo Nutrition](https://www.mundonutrition.com/).

---

## The Problem

Every 21 days I receive 3 PDF meal plans from my nutritionist. Managing these manually meant:

- Manually reading each PDF and figuring out what to buy
- Forgetting ingredients or buying duplicates
- Wasting perishable items that expired before use
- Spending more time planning meals than actually cooking
- No visibility into what's in the fridge vs. what's needed

## The Solution

**Dieta** automates the entire workflow:

```
PDF Upload → Parse Meals → Normalize Ingredients → Generate Shopping Lists
                                                          ↓
                    Mobile App ← Screen Data ← Cooking Optimizer ← Inventory Tracker
```

Upload the PDFs, and the app handles everything else — what to buy, when to buy it, how to cook it efficiently, and what to use before it expires.

---

## Features

### PDF Parsing
- Extracts structured meal data from Mundo Nutrition PDF format
- Recognizes 6 daily meal types (Al despertar, Desayuno, Medio día, Comida, Media tarde, Cena)
- Parses ingredients with quantities, units, and alternative measurements
- Handles multiple date formats in Spanish

### Smart Shopping Lists
- Aggregates ingredients across the full 21-day plan
- Deducts current inventory to avoid buying what you already have
- Groups items by category (Proteínas, Verduras, Frutas, Lácteos, Granos, Bebidas)
- Warns about shelf-life risks (items that may expire before use)
- Suggests buy strategies: bulk for non-perishables, last-minute for perishables

### Cooking Sequence Optimizer
- Analyzes each day's meals and generates a step-by-step cooking plan
- Parallelizes tasks (e.g., boil rice while chopping vegetables)
- Respects equipment constraints (max 2 burners/pots/pans simultaneously)
- Estimates total cooking time with efficiency metrics
- Includes cleanup steps between tasks

### Inventory Tracking
- Tracks quantities, purchase dates, and expiry
- Status indicators: OK, Use Next, Expiring Soon, Expired
- Waste prediction: flags items at risk of expiring before planned use
- Consumption logging to keep stock levels accurate
- Smart alerts with actionable recommendations

### Mobile App
- **Today**: Today's cooking plan with step-by-step instructions and alerts
- **Shopping**: Categorized shopping list with checkboxes and shelf-life badges
- **Inventory**: Current stock with expiry status and recommendations
- **Meals**: Full 21-day meal plan overview
- **Upload**: PDF upload interface for new meal plan cycles

---

## Tech Stack

### Backend
| Technology | Purpose |
|---|---|
| **Node.js + TypeScript** | Server runtime |
| **Express.js** | REST API framework |
| **pdf-parse** | PDF text extraction |
| **Fuse.js** | Fuzzy matching for ingredient deduplication |
| **Supabase** | PostgreSQL database (optional, falls back to in-memory) |
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
│       │   └── mobileUIDataGenerator.ts       # Mobile-ready screen data
│       ├── db/
│       │   ├── schema.sql                     # 11 tables with RLS
│       │   └── supabaseClient.ts              # Optional Supabase connection
│       ├── api.ts                             # Express REST endpoints
│       └── types/index.ts                     # Shared TypeScript interfaces
│
└── app/
    ├── screens/
    │   ├── Today.tsx          # Daily cooking plan + alerts
    │   ├── Shopping.tsx       # Categorized shopping list
    │   ├── Inventory.tsx      # Stock management
    │   ├── Meals.tsx          # 21-day plan overview
    │   └── UploadPDF.tsx      # PDF upload interface
    ├── store/
    │   └── useStore.ts        # Zustand global state
    ├── types/
    │   └── index.ts           # Mobile-specific types
    └── App.tsx                # Tab navigation entry point
```

### Service Pipeline

Each service feeds into the next, forming a data pipeline:

1. **pdfParser** — Extracts dates, meals, dishes, and ingredients from PDF files
2. **ingredientNormalizer** — Deduplicates ingredient names using fuzzy matching (Fuse.js) and assigns categories, shelf life, and storage info
3. **shoppingListGenerator** — Aggregates needs across all days, deducts inventory, splits into shopping sessions, and flags shelf-life risks
4. **inventoryTracker** — Manages stock levels, tracks expiry dates, predicts waste, and generates prioritized alerts
5. **cookingSequenceOptimizer** — Identifies cooking techniques, parallelizes steps, respects equipment limits, and generates a timeline
6. **mobileUIDataGenerator** — Transforms all service outputs into React Native-ready screen data with formatting, emojis, and caching metadata

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/upload-pdf` | Upload meal plan PDFs (multipart, up to 10 files) |
| `GET` | `/api/meals` | Get all parsed meal days |
| `GET` | `/api/ingredients/normalize` | Normalize and deduplicate ingredients |
| `POST` | `/api/shopping/generate` | Generate optimized shopping lists |
| `GET` | `/api/inventory` | Get current inventory with alerts |
| `POST` | `/api/inventory/purchase` | Record a purchase |
| `POST` | `/api/inventory/consume` | Log ingredient consumption |
| `GET` | `/api/inventory/waste-prediction` | Predict waste risk |
| `POST` | `/api/cooking/optimize` | Generate cooking sequence for a date |
| `GET` | `/api/screen-data` | Consolidated data for all mobile screens |

---

## Database Schema

11 PostgreSQL tables with UUID primary keys, cascading deletes, and row-level security:

- `ingredients_master` — Canonical ingredient registry
- `meal_days` / `meals` / `dishes` / `dish_ingredients` — Parsed meal plan hierarchy
- `user_inventory` — Current kitchen stock
- `shopping_lists` / `shopping_list_items` — Shopping sessions
- `cooking_sessions` / `cooking_steps` — Cooking plans
- `consumption_logs` — Usage tracking

---

## Getting Started

### Backend

```bash
cd backend
npm install
npm run build
npm start          # Runs on http://localhost:3000
```

Environment variables (optional):
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
```

### Mobile App

```bash
cd app
npm install
npx expo start     # Development server
```

Build APK:
```bash
eas build --platform android --profile preview
```

---

## How It Works in Practice

1. Receive 3 PDF meal plans from nutritionist (every 21 days)
2. Upload PDFs through the app's Upload tab
3. Backend parses meals, normalizes ingredients, and generates all data
4. **Today tab**: See exactly what to cook and in what order
5. **Shopping tab**: Check off items at the grocery store
6. **Inventory tab**: Track what's in the fridge, get alerts before things expire
7. **Meals tab**: Browse the full 21-day plan

---

## Deployment

- **Backend**: Deployed on [Render.com](https://render.com) (free tier, Oregon region)
- **Mobile**: Built with [EAS Build](https://expo.dev) and distributed as Android APK

---

## Built With

This project was built using **Claude Code** (Anthropic's AI coding assistant) as a pair programming partner for architecture design, service implementation, and deployment configuration.

---

## License

This is a personal project. Not intended for redistribution.
