import type { MealTemplate, RotationConfig, RotationDay, ParsedMealDay } from "../types/index";

/**
 * Resolve rotation: assign templates to calendar dates round-robin.
 * Skips rest days (default: Sunday = 6).
 * Returns RotationDay[] for the given date range.
 */
export function resolveRotation(
  templates: MealTemplate[],
  config: RotationConfig,
  startDate: string,
  endDate: string
): RotationDay[] {
  const active = templates.filter((t) => t.is_active);

  // Order by config.template_order, then by sort_order for any not in the list
  const ordered: MealTemplate[] = [];
  for (const id of config.template_order) {
    const found = active.find((t) => t.id === id);
    if (found) ordered.push(found);
  }
  // Add any active templates not in template_order
  for (const t of active) {
    if (!ordered.find((o) => o.id === t.id)) {
      ordered.push(t);
    }
  }

  if (ordered.length === 0) return [];

  const restDays = new Set(config.rest_days);
  const result: RotationDay[] = [];

  // Count non-rest days from config.start_date to assign consistent rotation
  const configStart = new Date(config.start_date + "T12:00:00Z");
  const rangeStart = new Date(startDate + "T12:00:00Z");
  const rangeEnd = new Date(endDate + "T12:00:00Z");

  // Calculate the rotation index offset from config start to range start
  let rotationIndex = 0;
  const cursor = new Date(configStart);
  while (cursor < rangeStart) {
    const dow = (cursor.getUTCDay() + 6) % 7; // Convert to 0=Mon..6=Sun
    if (!restDays.has(dow)) {
      rotationIndex++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Now iterate through the requested range
  const current = new Date(rangeStart);
  while (current <= rangeEnd) {
    const dateStr = current.toISOString().split("T")[0];
    const dow = (current.getUTCDay() + 6) % 7; // 0=Mon..6=Sun

    if (!restDays.has(dow)) {
      const template = ordered[rotationIndex % ordered.length];
      result.push({
        date: dateStr,
        template_id: template.id,
        template_label: template.label,
        meals: template.meals,
      });
      rotationIndex++;
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result;
}

/**
 * Convert rotation days to ParsedMealDay[] for compatibility with existing services.
 */
export function rotationToMealDays(rotation: RotationDay[]): ParsedMealDay[] {
  return rotation.map((day) => ({
    date: day.date,
    raw_date_str: `Plantilla ${day.template_label}`,
    meals: day.meals,
    parsed_at: new Date().toISOString(),
    confidence: 1,
    warnings: [],
  }));
}

/**
 * Get the next available label (A, B, C, ..., AA, AB, ...)
 */
export function getNextLabel(existingLabels: string[]): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const used = new Set(existingLabels.map((l) => l.toUpperCase()));

  // Try single letters first
  for (const ch of alphabet) {
    if (!used.has(ch)) return ch;
  }

  // Then double letters
  for (const a of alphabet) {
    for (const b of alphabet) {
      const label = a + b;
      if (!used.has(label)) return label;
    }
  }

  return `T${existingLabels.length + 1}`;
}
