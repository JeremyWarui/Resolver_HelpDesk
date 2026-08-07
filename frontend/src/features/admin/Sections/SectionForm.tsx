import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormDialog } from '@/components/shared/forms/FormDialog';
import { useSections } from '@/hooks/sections/useSections';
import organizationsService, { sectionsService } from '@/lib/api/organizations';
import { createSectionSchema, type CreateSectionFormValues } from '@/utils/entityValidation';
import type { SectionType, CampusDepartment } from '@/types';

interface SectionFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  section?: { id: number; name: string; description?: string } | null;
}

const SectionForm = ({ isOpen, onOpenChange, onSuccess, section = null }: SectionFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sectionTypes, setSectionTypes] = useState<SectionType[]>([]);
  const [campusDepts, setCampusDepts] = useState<CampusDepartment[]>([]);
  const { refetch: refetchSections } = useSections();

  const form = useForm<CreateSectionFormValues>({
    resolver: zodResolver(createSectionSchema) as unknown as Resolver<CreateSectionFormValues>,
    defaultValues: { name: '', description: '', campus_department: undefined, section_type: undefined },
  });

  useEffect(() => {
    if (!section && isOpen) {
      Promise.all([
        organizationsService.getSectionTypes(),
        organizationsService.campusDepartments.getCampusDepartments(),
      ])
        .then(([types, depts]) => {
          setSectionTypes(types);
          setCampusDepts(depts);
        });
    }
  }, [isOpen, section]);

  useEffect(() => {
    if (section) {
      form.reset({ name: section.name || '', description: section.description || '' });
    }
  }, [section, form]);

  const onSubmit = async (values: CreateSectionFormValues) => {
    setIsSubmitting(true);
    try {
      if (section) {
        // For updates, only send editable fields (exclude immutable section_type and campus_department)
        const updateData = { name: values.name, description: values.description, code: values.code };
        const res = await sectionsService.updateSection(section.id, updateData);
        if (res) {
          toast.success('Section updated');
          refetchSections();
          onSuccess?.();
          onOpenChange(false);
        } else {
          toast.error('Failed to update section');
        }
      } else {
        // For creation, send all fields including section_type and campus_department
        const createData = {
          name: values.name,
          description: values.description,
          code: values.code,
          campus_department: values.campus_department,
          section_type: values.section_type,
        };
        await sectionsService.createSection(createData);
        toast.success('Section created');
        refetchSections();
        form.reset();
        onSuccess?.();
        onOpenChange(false);
      }
    } catch (err) {
      console.error(err);
      const anyErr = err as { response?: { data?: Record<string, unknown> } };
      if (anyErr?.response?.data && typeof anyErr.response.data === 'object') {
        const data = anyErr.response.data;
        Object.keys(data).forEach((key) => {
          const val = data[key];
          const message = Array.isArray(val) ? val.join(' ') : String(val);
          if (key === 'non_field_errors' || key === 'detail') {
            toast.error(message);
          } else {
            try { form.setError(key as keyof CreateSectionFormValues, { type: 'server', message }); } catch { /* ignore */ }
          }
        });
      } else {
        toast.error('Failed to save section');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={section ? 'Edit Section' : 'New Section'}
      description={section ? 'Update the section.' : 'Create a new maintenance section.'}
      form={form}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      submitLabel={section ? 'Save Changes' : 'Create Section'}
      size="md"
    >
      <FormField control={form.control} name="name" render={({ field }) => (
        <FormItem>
          <FormLabel>Name</FormLabel>
          <FormControl>
            <Input {...field} placeholder="Section name (e.g., Electrical)" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name="description" render={({ field }) => (
        <FormItem>
          <FormLabel>Description</FormLabel>
          <FormControl>
            <Input {...field} placeholder="Short description (optional)" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />

      {!section && (
        <>
          <FormField control={form.control} name="campus_department" render={({ field }) => (
            <FormItem>
              <FormLabel>Campus / Department</FormLabel>
              <Select onValueChange={(val) => field.onChange(Number(val))} value={String(field.value ?? '')}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select campus and department" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {campusDepts.map((cd) => (
                    <SelectItem key={cd.id} value={String(cd.id)}>
                      {cd.campus.name} - {cd.department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="section_type" render={({ field }) => (
            <FormItem>
              <FormLabel>Section Type</FormLabel>
              <Select onValueChange={(val) => field.onChange(Number(val))} value={String(field.value ?? '')}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select section type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {sectionTypes.map((st) => (
                    <SelectItem key={st.id} value={String(st.id)}>{st.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
        </>
      )}
    </FormDialog>
  );
};

export default SectionForm;
