/**
 * Format a section for display with campus context: "NRB-ICT Support"
 * Works with both NestedSectionRef (from ticket API) and full Section objects.
 */

export function formatSectionDisplay(
  section: { name: string; campus_code?: string | null } | null | undefined
): string {
  if (!section) return '—'
  if (section.campus_code) return `${section.campus_code}-${section.name}`
  return section.name
}

/** For full Section objects from SectionSerializer (campus is a nested NestedRef). */
export function formatSectionObj(
  section: { name: string; campus?: { code: string } | null } | null | undefined
): string {
  if (!section) return '—'
  if (section.campus?.code) return `${section.campus.code}-${section.name}`
  return section.name
}
