import { create } from 'zustand';
import {
  ParsedMealDay,
  InventoryItem,
  ShoppingList,
  CookingSession,
  UserPreferences,
  MobileScreenData,
} from '../types/index';

interface DietStore {
  // State
  mealDays: ParsedMealDay[];
  inventory: InventoryItem[];
  shoppingLists: ShoppingList[];
  cookingSession: CookingSession | null;
  userPreferences: UserPreferences;
  screenData: MobileScreenData | null;
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
  isLoading: false,
  error: null,
  apiBaseUrl: 'http://localhost:3000',

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

  // Async: upload one or more PDF files via multipart form
  uploadPDFs: async (uris: string[]) => {
    const { apiBaseUrl } = get();
    set({ isLoading: true, error: null });

    try {
      const formData = new FormData();

      for (const uri of uris) {
        const filename = uri.split('/').pop() ?? 'upload.pdf';
        // React Native / Expo FormData accepts the object form for file blobs
        formData.append('files', {
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

      // After a successful upload, refresh screen data so the UI reflects the new plan
      await get().fetchScreenData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error uploading PDFs';
      set({ error: message, isLoading: false });
    }
  },
}));
