import { UnifiedDetailsSheet } from '@/components/shared/ticket/UnifiedDetailsSheet';
import type { Facility } from '@/types';

interface FacilityDetailsProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  facility: Facility | null;
  onUpdated?: () => void;
}

export default function FacilityDetails({ isOpen, onOpenChange, facility, onUpdated }: FacilityDetailsProps) {
  return (
    <UnifiedDetailsSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      entity={facility}
      entityType="facility"
      onUpdated={onUpdated}
    />
  );
}
