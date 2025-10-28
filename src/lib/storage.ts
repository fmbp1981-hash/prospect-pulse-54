import { ProspectionSearch } from "@/types/prospection";

const STORAGE_KEY = "prospectionSearches";

export const storage = {
  getSearches: (): ProspectionSearch[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Error loading searches:", error);
      return [];
    }
  },

  saveSearches: (searches: ProspectionSearch[]): void => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
    } catch (error) {
      console.error("Error saving searches:", error);
    }
  },

  addSearch: (search: ProspectionSearch): void => {
    const searches = storage.getSearches();
    storage.saveSearches([search, ...searches]);
  },

  clearSearches: (): void => {
    localStorage.removeItem(STORAGE_KEY);
  },
};
