import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DialogActions } from '@/components/shared/forms/DialogActions';
import { useCampuses } from '@/hooks/useOrganizations';
import { facilitiesService } from '@/lib/api/organizations';
import { createFacilitySchema, type CreateFacilityFormValues } from '@/utils/validation';
import { useFacilityTypes } from '@/hooks/useCatalogue';

interface FacilityFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const FacilityForm = ({ isOpen, onOpenChange, onSuccess }: FacilityFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { campuses } = useCampuses();
  const { facilityTypes } = useFacilityTypes();

  const form = useForm<CreateFacilityFormValues>({
    resolver: zodResolver(createFacilitySchema) as unknown as Resolver<CreateFacilityFormValues>,
    defaultValues: { name: '', campus: undefined, facility_type: undefined },
  });

  const onSubmit = async (values: CreateFacilityFormValues) => {
    setIsSubmitting(true);
    try {
      await facilitiesService.createFacility(values);
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
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Facility</DialogTitle>
          <DialogDescription>Provide facility details.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem>
          <FormLabel>Name</FormLabel>
          <FormControl>
            <Input {...field} placeholder="e.g. Admin Block A" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />

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

      <FormField control={form.control} name="facility_type" render={({ field }) => (
        <FormItem>
          <FormLabel>Type</FormLabel>
          <Select
            onValueChange={(val) => field.onChange(Number(val))}
            value={String(field.value ?? '')}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {facilityTypes.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )} />
            <DialogActions
              onCancel={() => { onOpenChange(false); form.reset(); }}
              pending={isSubmitting}
              submitLabel="Create Facility"
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default FacilityForm;
