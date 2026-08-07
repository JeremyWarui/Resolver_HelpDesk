export type FormFieldType = 'text' | 'textarea' | 'select' | 'multiselect' | 'number' | 'date'

export interface FormSchemaField {
  name: string
  label: string
  type: FormFieldType
  required: boolean
  options?: string[]
  placeholder?: string
  help_text?: string
}

export interface ServiceCategory {
  id: number
  section_type: number
  section_type_name: string
  name: string
  description: string
  icon: string
  order: number
  is_active: boolean
  location_details: boolean
  service_items?: ServiceItem[]
}

export interface ServiceItem {
  id: number
  category: number
  category_name: string
  name: string
  description: string
  default_priority?: { id: number; name: string; rank: number; response_minutes: number; resolution_minutes: number } | null
  is_active: boolean
  order: number
  request_count: number
  section_type_code?: string | null
}

export type RequestData = Record<string, string | string[] | number | null>
