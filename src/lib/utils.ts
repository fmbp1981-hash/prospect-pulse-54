import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converte string para Title Case (primeira letra maiúscula de cada palavra)
 * Exemplo: "JOÃO SILVA" → "João Silva", "maria santos" → "Maria Santos"
 */
export function toTitleCase(str: string): string {
  if (!str) return str;
  
  return str
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Normaliza texto para busca (remove acentos, converte para minúsculas)
 * Exemplo: "São Paulo" → "sao paulo", "JOÃO" → "joao"
 */
export function normalizeForSearch(text: string): string {
  if (!text) return "";
  
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-z0-9\s]/g, "") // Remove caracteres especiais
    .trim();
}

/**
 * Verifica se um texto contém outro, ignorando acentos e case
 */
export function searchMatch(text: string, searchTerm: string): boolean {
  if (!text || !searchTerm) return false;
  
  const normalizedText = normalizeForSearch(text);
  const normalizedSearch = normalizeForSearch(searchTerm);
  
  return normalizedText.includes(normalizedSearch);
}
