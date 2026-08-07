import { UnifiedDetailsSheet } from '@/components/shared/ticket/UnifiedDetailsSheet';
import type { Section } from '@/types';

interface SectionDetailsProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  section: Section | null;
  onUpdated?: () => void;
}

export default function SectionDetails({ isOpen, onOpenChange, section, onUpdated }: SectionDetailsProps) {
  return (
    <UnifiedDetailsSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      entity={section}
      entityType="section"
      onUpdated={onUpdated}
    />
  );
}
