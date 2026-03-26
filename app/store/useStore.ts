import { create } from 'zustand';
import {
  ParsedMealDay,
  InventoryItem,
  ShoppingList,
  CookingSession,
  UserPreferences,
  MobileScreenData,
  MealTemplate,
  RotationConfig,
  RotationDay,
  Purchase,
} from '../types/index';

interface DietStore {
  // State
  mealDays: ParsedMealDay[];
  inventory: InventoryItem[];
  shoppingLists: ShoppingList[];
  cookingSession: CookingSession | null;
  userPreferences: UserPreferences;
  screenData: MobileScreenData | null;
  templates: MealTemplate[];
  rotationConfig: RotationConfig | null;
  rotationPreview: RotationDay[];
  isLoading: boolean;
  error: string | null;
  apiBaseUrl: string;

  // Actions
  setMealDays: (days: ParsedMealDay[]) => void;
  setInventory: (items: InventoryItem[]) => void;
  setShoppingLists: (lists: ShoppingList[]) => void;
  setCookingSession: (session: CookingSession | null) => void;
  setScreenData: (data: MobileScreenData | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setApiBaseUrl: (url: string) => void;

  // Async actions
  fetchScreenData: (date?: string) => Promise<void>;
  fetchMealDays: () => Promise<void>;
  purchaseItem: (purchase: Purchase) => Promise<void>;
  uploadPDFs: (uris: string[]) => Promise<void>;
}

export const useStore = create<DietStore>((set, get) => ({
  // Initial state
  mealDays: [],
  inventory: [],
  shoppingLists: [],
  cookingSession: null,
  userPreferences: {
    show_macros: false,
    show_costs: true,
    theme: 'light',
  },
  screenData: null,
  templates: [],
  rotationConfig: null,
  rotationPreview: [],
  isLoading: false,
  error: null,
  apiBaseUrl: 'https://diet-z4vm.onrender.com',

  // Synchronous actions
  setMealDays: (days) => set({ mealDays: days }),
  setInventory: (items) => set({ inventory: items }),
  setShoppingLists: (lists) => set({ shoppingLists: lists }),
  setCookingSession: (session) => set({ cookingSession: session }),
  setScreenData: (data) => set({ screenData: data }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setApiBaseUrl: (url) => set({ apiBaseUrl: url }),

  // Async: fetch consolidated screen data from backend
  fetchScreenData: async (date?: string) => {
    const { apiBaseUrl } = get();
    set({ isLoading: true, error: null });

    try {
      const params = date ? `?date=${encodeURIComponent(date)}` : '';
      const response = await fetch(`${apiBaseUrl}/api/screen-data${params}`);

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }

      const data: MobileScreenData = await response.json();
      set({ screenData: data, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error fetching screen data';
      set({ error: message, isLoading: false });
    }
  },

  // Async: fetch templates, rotation, and meal days from backend
  fetchMealDays: async () => {
    const { apiBaseUrl } = get();
    try {
      const response = await fetch(`${apiBaseUrl}/api/meals`);
      if (!response.ok) return;
      const data = await response.json();
      set({
        mealDays: data.meal_days ?? [],
        templates: data.templates ?? [],
        rotationConfig: data.rotation_config ?? null,
        rotationPreview: data.rotation_preview ?? [],
      });
    } catch {
      // silently fail — screen data is the primary source
    }
  },

  // Async: record a purchase and refresh inventory
  purchaseItem: async (purchase: Purchase) => {
    const { apiBaseUrl } = get();
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${apiBaseUrl}/api/inventory/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(purchase),
      });
      if (!response.ok) {
        throw new Error(`Purchase failed with status ${response.status}`);
      }
      await get().fetchScreenData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error registrando compra';
      set({ error: message, isLoading: false });
    }
  },

  // Async: upload one or more PDF files via multipart form
  uploadPDFs: async (uris: string[]) => {
    const { apiBaseUrl } = get();
    set({ isLoading: true, error: null });

    try {
      const formData = new FormData();

      for (const uri of uris) {
        const filename = uri.split('/').pop() ?? 'upload.pdf';
        // React Native / Expo FormData accepts the object form for file blobs
        formData.append('pdfs', {
          uri,
          name: filename,
          type: 'application/pdf',
        } as unknown as Blob);
      }

      const response = await fetch(`${apiBaseUrl}/api/upload-pdf`, {
        method: 'POST',
        body: formData,
        headers: {
          // Let fetch set Content-Type with boundary automatically
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      // After a successful upload, refresh all data
      await Promise.all([get().fetchScreenData(), get().fetchMealDays()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error uploading PDFs';
      set({ error: message, isLoading: false });
    }
  },
}));
