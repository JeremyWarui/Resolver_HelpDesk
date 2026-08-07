import { useState, useEffect, useCallback } from 'react'
import { departmentsService } from '@/lib/api/organizations'
import type { Department } from '@/types'

export function useDepartments(campusId?: number) {
  const [data, setData] = useState<Department[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    try {
      setIsLoading(true)
      const departments = campusId != null
        ? await departmentsService.getCampusDepartments(campusId)
        : await departmentsService.getDepartments()
      setData(departments)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load departments')
    } finally {
      setIsLoading(false)
    }
  }, [campusId])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard async data-fetch pattern; setIsLoading inside fetch() is not a derived-state synchronous call
  useEffect(() => { fetch() }, [fetch])

  return { data, isLoading, error, refetch: fetch }
}
