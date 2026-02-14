/**
 * Calculate optimal stringing configuration
 * Returns panels per string and string count
 * 
 * Strategy: Try fewer strings first (more panels per string = higher voltage).
 * This maximizes voltage per string, which is better for MPPT range and start voltage checks.
 */
export interface StringingConfig {
  panels_per_string: number;
  string_count: number;
  total_panels: number;
}

export function calculateStringing(
  totalPanels: number,
  maxPanelsPerString: number,
  mpptInputs: number
): StringingConfig | null {
  if (totalPanels <= 0 || mpptInputs <= 0) {
    return null;
  }

  // Try from 1 string up to mpptInputs
  // Prefer fewer strings (more panels per string = higher voltage)
  for (let stringCount = 1; stringCount <= mpptInputs; stringCount++) {
    const panelsPerString = Math.floor(totalPanels / stringCount);
    const remainder = totalPanels % stringCount;

    // If we can fit all panels evenly or with minimal remainder
    if (panelsPerString > 0 && panelsPerString <= maxPanelsPerString) {
      // Check if we can distribute remainder panels
      if (remainder === 0) {
        // Perfect fit: all strings have same number of panels
        return {
          panels_per_string: panelsPerString,
          string_count: stringCount,
          total_panels: totalPanels,
        };
      } else {
        // Some strings will have 1 more panel
        // Check if max panels per string allows this
        if (panelsPerString + 1 <= maxPanelsPerString) {
          return {
            panels_per_string: panelsPerString + 1,
            string_count: stringCount,
            total_panels: totalPanels,
          };
        }
        // If remainder can't fit, try next string count
      }
    }
  }

  // If we can't fit with any string count, check if we exceed max panels per string
  const minStringCount = Math.ceil(totalPanels / maxPanelsPerString);
  if (minStringCount > mpptInputs) {
    return null; // Not enough MPPT inputs
  }

  // Use max panels per string, distribute across minimum strings needed
  return {
    panels_per_string: maxPanelsPerString,
    string_count: minStringCount,
    total_panels: maxPanelsPerString * minStringCount,
  };
}
