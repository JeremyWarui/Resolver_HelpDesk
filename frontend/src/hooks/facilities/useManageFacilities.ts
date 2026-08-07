import { useState } from 'react';
import { facilitiesService } from '@/lib/api/organizations';
import type { Facility } from '@/types';

interface UseManageFacilitiesResult {
  createFacility: (data: { name: string; campus: number; type?: string }) => Promise<Facility>;
  updateFacility: (id: number, data: Partial<Facility>) => Promise<Facility>;
  deleteFacility: (id: number) => Promise<void>;
  loading: boolean;
  error: Error | null;
}

export const useManageFacilities = (): UseManageFacilitiesResult => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createFacility = async (data: { name: string; campus: number; type?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await facilitiesService.createFacility(data);
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to create facility');
      setError(e);
      console.error('createFacility error', err);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const updateFacility = async (id: number, data: Partial<Facility>) => {
    setLoading(true);
    setError(null);
    try {
      const result = await facilitiesService.updateFacility(id, data);
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update facility');
      setError(e);
      console.error('updateFacility error', err);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const deleteFacility = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      await facilitiesService.deleteFacility(id);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to delete facility');
      setError(e);
      console.error('deleteFacility error', err);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  return {
    createFacility,
    updateFacility,
    deleteFacility,
    loading,
    error,
  };
};

export default useManageFacilities;
