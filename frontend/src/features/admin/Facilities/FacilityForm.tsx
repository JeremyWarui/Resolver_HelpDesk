import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormDialog } from '@/components/shared/forms/FormDialog';
import { useCampuses } from '@/hooks/campuses/useCampuses';
import useManageFacilities from '@/hooks/facilities/useManageFacilities';
import { createFacilitySchema, type CreateFacilityFormValues } from '@/utils/entityValidation';

interface FacilityFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const FACILITY_TYPES: { value: string; label: string }[] = [
  { value: 'office_block', label: 'Office Block' },
  { value: 'building',     label: 'Building' },
  { value: 'equipment',    label: 'Facility / Equipment' },
  { value: 'residential',  label: 'Residential' },
  { value: 'grounds',      label: 'Grounds' },
];

const FacilityForm = ({ isOpen, onOpenChange, onSuccess }: FacilityFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { createFacility } = useManageFacilities();
  const { campuses } = useCampuses();

  const form = useForm<CreateFacilityFormValues>({
    resolver: zodResolver(createFacilitySchema) as unknown as Resolver<CreateFacilityFormValues>,
    defaultValues: { name: '', facility_code: '', campus: undefined, type: '', status: 'active', location: '' },
  });

  const onSubmit = async (values: CreateFacilityFormValues) => {
    setIsSubmitting(true);
    try {
      await createFacility(values);
      toast.success('Facility created');
      form.reset();
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to create facility');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="New Facility"
      description="Provide facility details."
      form={form}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      submitLabel="Create Facility"
      size="lg"
    >
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. Admin Block A" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <FormField control={form.control} name="facility_code" render={({ field }) => (
          <FormItem>
            <FormLabel>Code</FormLabel>
            <FormControl>
              <Input {...field} placeholder="e.g. AB01" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>

      <FormField control={form.control} name="campus" render={({ field }) => (
        <FormItem>
          <FormLabel>Campus</FormLabel>
          <Select onValueChange={(val) => field.onChange(Number(val))} value={String(field.value ?? '')}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select campus" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {campuses.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="type" render={({ field }) => (
        <FormItem>
          <FormLabel>Type</FormLabel>
          <Select onValueChange={field.onChange} defaultValue={field.value}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {FACILITY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="location" render={({ field }) => (
        <FormItem>
          <FormLabel>Location</FormLabel>
          <FormControl>
            <Input {...field} placeholder="Location (optional)" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />
    </FormDialog>
  );
};

export default FacilityForm;
