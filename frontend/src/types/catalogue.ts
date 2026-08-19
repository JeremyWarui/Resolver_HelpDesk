/** A trade under the Maintenance section type — Carpentry, Plumbing, and so on.
 *  This is both the catalogue's top level and the technician scoping boundary,
 *  so its `code` is the one the seed and the roster share. */
export interface SubSection {
  id: number
  section_type: number
  section_type_name: string
  name: string
  code: string
  description: string
  is_active: boolean
  /** Whether raising against this trade must name a place — a leaking tap has
   *  a room, a policy question does not. */
  location_details: boolean
  items?: ServiceItem[]
}

export interface ServiceItem {
  id: number
  sub_section: number
  name: string
  description: string
  is_active: boolean
}

