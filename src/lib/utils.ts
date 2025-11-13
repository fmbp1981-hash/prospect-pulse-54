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
