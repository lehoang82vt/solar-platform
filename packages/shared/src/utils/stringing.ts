/**
 * Calculate optimal stringing configuration
 * Returns panels per string and string count
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

  const panelsPerString = Math.floor(totalPanels / mpptInputs);

  if (panelsPerString > maxPanelsPerString) {
    const stringCount = Math.ceil(totalPanels / maxPanelsPerString);
    if (stringCount > mpptInputs) {
      return null;
    }
    return {
      panels_per_string: maxPanelsPerString,
      string_count: stringCount,
      total_panels: maxPanelsPerString * stringCount,
    };
  }

  return {
    panels_per_string: panelsPerString,
    string_count: mpptInputs,
    total_panels: panelsPerString * mpptInputs,
  };
}
