/**
 * Confronto shallow ottimizzato per oggetti
 * Molto più veloce di JSON.stringify per oggetti semplici
 */
export function shallowEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  if (!obj1 || !obj2) return false;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) {
      // Se sono oggetti, confronta shallow
      if (typeof obj1[key] === 'object' && typeof obj2[key] === 'object') {
        if (!shallowEqual(obj1[key], obj2[key])) return false;
      } else {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Confronto deep ottimizzato per oggetti complessi
 * Usa shallowEqual quando possibile, JSON.stringify solo se necessario
 */
export function deepEqual(obj1: any, obj2: any, maxDepth = 3): boolean {
  if (obj1 === obj2) return true;
  if (!obj1 || !obj2) return false;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;
  
  // Per oggetti semplici, usa shallowEqual
  if (maxDepth > 0) {
    try {
      return shallowEqual(obj1, obj2);
    } catch {
      // Se fallisce, usa JSON.stringify come fallback
    }
  }
  
  // Fallback a JSON.stringify solo se necessario
  try {
    return JSON.stringify(obj1) === JSON.stringify(obj2);
  } catch {
    return false;
  }
}

