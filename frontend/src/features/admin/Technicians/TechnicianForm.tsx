import { useState, useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, X } from 'lucide-react';
import { FormDialog } from '@/components/shared/forms/FormDialog';
import { MultiSelectCheckboxGroup } from '@/components/shared/forms/MultiSelectCheckboxGroup';
import useCreateUser from '@/hooks/users/useCreateUser';
import { useSections } from '@/hooks/sections/useSections';
import { useDepartments } from '@/hooks/useDepartments';
import useUpdateUser from '@/hooks/users/useUpdateUser';
import { createTechnicianSchema, type CreateTechnicianFormValues } from '@/utils/entityValidation';
import { sectionsService } from '@/lib/api/organizations';
import { createRoleAssignment } from '@/lib/api/users';
import { handleDRFError } from '@/utils/handleDRFError';
import type { Technician, CreateUserPayload, User } from '@/types';

interface TechnicianFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  technician?: Technician | null;
}

const TechnicianForm = ({ isOpen, onOpenChange, onSuccess, technician = null }: TechnicianFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set when the user account was created but the role assignment failed —
  // the next submit retries only the role step instead of re-creating the user.
  const [pendingRoleUserId, setPendingRoleUserId] = useState<number | null>(null);
  const [sectionInputs, setSectionInputs] = useState<number[]>([0]);
  const [specialtyInputs, setSpecialtyInputs] = useState<number[][]>([[]]);
  const [campusFilter, setCampusFilter] = useState<string>('__all__');
  const [departmentFilter, setDepartmentFilter] = useState<string>('__all__');
  const [departmentSections, setDepartmentSections] = useState<Array<{ id: number; name: string; section_type: number | null }>>([]);
  const [loadingDepartmentSections, setLoadingDepartmentSections] = useState(false);
  const [sectionTypes, setSectionTypes] = useState<Array<{ id: number; parent_id?: number | null; name: string }>>([]);
  const { createUser } = useCreateUser();
  const { updateUser } = useUpdateUser();
  const { sections } = useSections();
  const selectedCampusId = campusFilter !== '__all__' ? Number(campusFilter) : undefined;
  const { data: departments } = useDepartments(selectedCampusId);
  const departmentOptions = Array.isArray(departments) ? departments : [];

  // Unique campuses derived from sections
  const campuses = useMemo(() => {
    const map = new Map<number, { id: number; code: string; name: string }>();
    sections.forEach(s => {
      if (s.campus?.id) map.set(s.campus.id, { id: s.campus.id, code: s.campus.code, name: s.campus.name });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sections]);

  // Section types are fetched once (small, org-wide reference data) so the
  // specialty picker can resolve each section's children (R18) without a
  // per-row round trip.
  useEffect(() => {
    sectionsService.getSectionTypes()
      .then((types) => setSectionTypes(types as unknown as Array<{ id: number; parent_id?: number | null; name: string }>))
      .catch(() => setSectionTypes([]));
  }, []);

  const childrenByType = useMemo(() => {
    const map = new Map<number, { id: number; name: string }[]>();
    sectionTypes.forEach((st) => {
      if (st.parent_id) {
        const arr = map.get(st.parent_id) ?? [];
        arr.push({ id: st.id, name: st.name });
        map.set(st.parent_id, arr);
      }
    });
    return map;
  }, [sectionTypes]);

  const specialtyOptionsForSection = (sectionId: number | undefined) => {
    if (!sectionId) return [];
    const sectionType = departmentSections.find((s) => s.id === sectionId)?.section_type;
    if (!sectionType) return [];
    return childrenByType.get(sectionType) ?? [];
  };

  // Pre-fill each section row's specialty tags when editing an existing
  // technician — the roster endpoint is the only place these live server-side.
  useEffect(() => {
    if (!isOpen || !technician) return;
    const techSections = technician.sections || [];
    if (techSections.length === 0) return;
    let active = true;
    Promise.all(
      techSections.map((sectionId) =>
        sectionsService.getSectionTechnicians(sectionId)
          .then((roster) => roster.find((r) => r.user === technician.id)?.specialty_ids ?? [])
          .catch(() => [] as number[])
      )
    ).then((results) => {
      if (active) setSpecialtyInputs(results);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, technician?.id]);

  const [prevDeptFilter, setPrevDeptFilter] = useState(departmentFilter);

  if (prevDeptFilter !== departmentFilter) {
    setPrevDeptFilter(departmentFilter);
    const deptId = departmentFilter !== '__all__' ? Number(departmentFilter) : null;
    if (!deptId || Number.isNaN(deptId)) {
      setDepartmentSections([]);
      setSectionInputs([0]);
    } else {
      setLoadingDepartmentSections(true);
    }
  }

  useEffect(() => {
    const departmentId = departmentFilter !== '__all__' ? Number(departmentFilter) : null;
    const campusId = campusFilter !== '__all__' ? Number(campusFilter) : null;
    if (!departmentId || Number.isNaN(departmentId) || !campusId || Number.isNaN(campusId)) {
      setDepartmentSections([]);
      return;
    }

    let active = true;

    sectionsService.getSections({ department: departmentId, campus: campusId })
      .then((sections) => {
        if (!active) return;
        // Section.section_type is typed as a nested SectionType object, but
        // SectionSerializer actually returns it as a plain FK id at runtime.
        setDepartmentSections(sections as unknown as Array<{ id: number; name: string; section_type: number | null }>);
        setSectionInputs(prev => (prev.length > 0 ? prev : [0]));
      })
      .catch(() => {
        if (!active) return;
        setDepartmentSections([]);
      })
      .finally(() => {
        if (active) setLoadingDepartmentSections(false);
      });

    return () => {
      active = false;
    };
  }, [campusFilter, departmentFilter]);

  const form = useForm<CreateTechnicianFormValues>({
    resolver: zodResolver(createTechnicianSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      sections: [],
      primary_department_id: null,
    },
  });

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevTechnicianId, setPrevTechnicianId] = useState(technician?.id);

  if (prevIsOpen !== isOpen || prevTechnicianId !== technician?.id) {
    setPrevIsOpen(isOpen);
    setPrevTechnicianId(technician?.id);
    setPendingRoleUserId(null);
    if (isOpen) {
      if (technician) {
        const techSections = technician.sections || [];
        setSectionInputs(techSections.length > 0 ? techSections : [0]);
        setSpecialtyInputs(techSections.length > 0 ? techSections.map(() => []) : [[]]);
        setCampusFilter(technician.primary_campus_id ? String(technician.primary_campus_id) : '__all__');
        setDepartmentFilter(technician.primary_department_id ? String(technician.primary_department_id) : '__all__');
        form.reset({
          first_name: technician.first_name || '',
          last_name: technician.last_name || '',
          email: technician.email || '',
          password: '',
          sections: techSections,
          primary_department_id: technician.primary_department_id ?? null,
        });
      } else {
        setSectionInputs([0]);
        setSpecialtyInputs([[]]);
        setCampusFilter('__all__');
        setDepartmentFilter('__all__');
        setDepartmentSections([]);
        form.reset({
          first_name: '',
          last_name: '',
          email: '',
          password: '',
          sections: [],
          primary_department_id: null,
        });
      }
    }
  }

  // Handle adding a new section input
  const addSectionInput = () => {
    setSectionInputs(prev => [...prev, 0]);
    setSpecialtyInputs(prev => [...prev, []]);
  };

  // Handle removing a section input
  const removeSectionInput = (index: number) => {
    if (sectionInputs.length > 1) {
      setSectionInputs(prev => prev.filter((_, i) => i !== index));
      setSpecialtyInputs(prev => prev.filter((_, i) => i !== index));
      // Update form sections array
      const currentSections = form.getValues('sections') || [];
      const newSections = currentSections.filter((_, i) => i !== index);
      form.setValue('sections', newSections);
    }
  };

  // Handle section selection change
  const handleSectionChange = (index: number, sectionId: string) => {
    const id = parseInt(sectionId);
    const currentSections = form.getValues('sections') || [];
    const newSections = [...currentSections];
    newSections[index] = id;
    form.setValue('sections', newSections);
    // Specialty options are section-type-specific — a stale selection from
    // the previous section would silently point at the wrong SectionType.
    setSpecialtyInputs(prev => {
      const next = [...prev];
      next[index] = [];
      return next;
    });
  };

  const updateSpecialtyInput = (index: number, next: number[]) => {
    setSpecialtyInputs(prev => {
      const copy = [...prev];
      copy[index] = next;
      return copy;
    });
  };

  const onSubmit = async (values: CreateTechnicianFormValues) => {
    setIsSubmitting(true);
    try {
      // Pair each section with its row's specialty selections BEFORE filtering
      // out empty rows, so index alignment with specialtyInputs holds even if
      // an earlier row was left blank.
      const sectionSpecialtyPairs = (values.sections || [])
        .map((sectionId, index) => ({ sectionId, specialtyIds: specialtyInputs[index] ?? [] }))
        .filter((p) => p.sectionId && p.sectionId > 0);
      const filteredSections = sectionSpecialtyPairs.map((p) => p.sectionId);
      // Section rows are campus-scoped, so the account's campus is derived from
      // whichever section was picked — same resolution used for create and edit.
      const campusId = sections.find(s => filteredSections.includes(s.id))?.campus?.id ?? null;

      let userId: number;

      if (pendingRoleUserId != null) {
        // Previous attempt created the account but the role step failed —
        // retry the role assignment for that account instead of duplicating it.
        userId = pendingRoleUserId;
      } else if (technician) {
        const updatePayload: Partial<User> & { password?: string } = {
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email,
        };
        if (values.password) {
          updatePayload.password = values.password;
        }
        const res = await updateUser(technician.id, updatePayload);
        if (!res) {
          toast.error('Failed to update technician');
          setIsSubmitting(false);
          return;
        }
        userId = technician.id;
      } else {
        if (!campusId) {
          toast.error('Select at least one section so the campus can be determined');
          setIsSubmitting(false);
          return;
        }
        const createPayload: CreateUserPayload = {
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email,
          password: values.password,
          campus_id: campusId,
        };
        const created = await createUser(createPayload);
        userId = created.id;
      }

      if (filteredSections.length > 0) {
        try {
          await createRoleAssignment(userId, {
            role: 'technician',
            is_primary: true,
            section_id: filteredSections[0],
            campus_id: campusId,
            department_id: values.primary_department_id ?? null,
          });

          // The role-assignment endpoint only syncs the primary/first section into
          // SectionTechnician as a side effect; link any additional sections
          // explicitly. Additive-only: on edit, sections removed from the form
          // are not unlinked here.
          const additionalResults = filteredSections.length > 1
            ? await Promise.allSettled(
                filteredSections.slice(1).map(sectionId =>
                  sectionsService.addSectionTechnician(sectionId, userId)
                )
              )
            : [];

          // Specialty tags (R18) are best-effort, non-blocking: the technician
          // account and section links above are the load-bearing part of this
          // save. Resolve each section's SectionTechnician link id — additional
          // sections already have it from addSectionTechnician's response;
          // the primary section doesn't (createRoleAssignment doesn't return
          // it), so it needs a roster lookup.
          const pairsWithSpecialties = sectionSpecialtyPairs.filter(p => p.specialtyIds.length > 0);
          if (pairsWithSpecialties.length > 0) {
            const linkIdBySection = new Map<number, number>();
            additionalResults.forEach((res, i) => {
              if (res.status === 'fulfilled') linkIdBySection.set(filteredSections[i + 1], res.value.id);
            });
            const primarySectionId = filteredSections[0];
            if (pairsWithSpecialties.some(p => p.sectionId === primarySectionId)) {
              try {
                const roster = await sectionsService.getSectionTechnicians(primarySectionId);
                const link = roster.find(r => r.user === userId);
                if (link) linkIdBySection.set(primarySectionId, link.id);
              } catch { /* best-effort — specialty tagging, not the account save */ }
            }
            await Promise.allSettled(
              pairsWithSpecialties
                .filter(p => linkIdBySection.has(p.sectionId))
                .map(p => sectionsService.setTechnicianSpecialties(
                  p.sectionId, linkIdBySection.get(p.sectionId)!, p.specialtyIds
                ))
            );
          }
        } catch (roleError) {
          // Loud failure (QA A1): without the role assignment the account is
          // not a technician (it won't appear in the Technicians table or the
          // Assign dialog). Keep the dialog open so the admin can retry.
          setPendingRoleUserId(userId);
          handleDRFError(roleError, {
            fallbackMessage:
              'The account was saved but assigning the technician role failed. Fix the selection and press save to retry.',
          });
          return;
        }
      }

      toast.success(technician ? 'Technician updated' : 'Technician created');
      setPendingRoleUserId(null);
      if (!technician) form.reset();
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      const anyErr = err as { response?: { data?: Record<string, unknown> } };
      if (anyErr?.response?.data && typeof anyErr.response.data === 'object') {
        const data = anyErr.response.data;
        let foundField = false;
        Object.keys(data).forEach((key) => {
          const val = data[key];
          const message = Array.isArray(val) ? val.join(' ') : String(val);
          if (key === 'non_field_errors' || key === 'detail') {
            toast.error(message);
          } else {
            try {
              form.setError(key as keyof CreateTechnicianFormValues, { type: 'server', message });
              foundField = true;
            } catch { /* ignore */ }
          }
        });
        if (!foundField) toast.error('Failed to save technician');
      } else {
        toast.error('Failed to save technician');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={technician ? 'Edit Technician' : 'New Technician'}
      description={technician ? 'Update technician details.' : 'Create a new technician account.'}
      form={form}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      submitLabel={technician ? 'Save Changes' : 'Create Technician'}
      size="lg"
    >
      <FormField control={form.control} name='first_name' render={({ field }) => (
        <FormItem>
          <FormLabel>First name</FormLabel>
          <FormControl>
            <Input {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name='last_name' render={({ field }) => (
        <FormItem>
          <FormLabel>Last name</FormLabel>
          <FormControl>
            <Input {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name='email' render={({ field }) => (
        <FormItem>
          <FormLabel>Email</FormLabel>
          <FormControl>
            <Input {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name='password' render={({ field }) => (
        <FormItem>
          <FormLabel>Password</FormLabel>
          <FormControl>
            <PasswordInput {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )} />

      <FormItem>
        <FormLabel>Campus</FormLabel>
        <Select
          value={campusFilter}
          onValueChange={val => {
            setCampusFilter(val);
            setDepartmentFilter('__all__');
            setDepartmentSections([]);
            form.setValue('primary_department_id', null);
            form.setValue('sections', []);
            setSectionInputs([0]);
            setSpecialtyInputs([[]]);
            const validIds = sections
              .filter(s => val === '__all__' || String(s.campus?.id) === val)
              .map(s => s.id);
            const current = form.getValues('sections') || [];
            const kept = current.filter(id => validIds.includes(id));
            if (kept.length > 0) {
              form.setValue('sections', kept);
              setSectionInputs(kept.length > 0 ? kept : [0]);
              setSpecialtyInputs(kept.map(() => []));
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder='All campuses' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='__all__'>All campuses</SelectItem>
            {campuses.map(c => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name} ({c.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormItem>

      <FormField control={form.control} name='primary_department_id' render={({ field }) => (
        <FormItem>
          <FormLabel>Department</FormLabel>
          <Select
            value={field.value != null ? String(field.value) : '__none__'}
            onValueChange={(value) => {
              const next = value === '__none__' ? null : Number(value);
              field.onChange(next);
              setDepartmentFilter(value === '__none__' ? '__all__' : value);
              setSectionInputs([0]);
              setSpecialtyInputs([[]]);
              form.setValue('sections', []);
            }}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder='Select department' />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value='__none__'>No department</SelectItem>
              {departmentOptions.map((department) => (
                <SelectItem key={department.id} value={String(department.id)}>
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name='sections' render={({ field }) => (
        <FormItem>
          <FormLabel>Sections</FormLabel>
          <div className='space-y-2'>
            {campusFilter === '__all__' || departmentFilter === '__all__' ? (
              <p className='text-sm text-muted-foreground'>Select a campus and department first to see its sections.</p>
            ) : loadingDepartmentSections ? (
              <p className='text-sm text-muted-foreground'>Loading sections...</p>
            ) : departmentSections.length === 0 ? (
              <p className='text-sm text-muted-foreground'>No sections found for this department.</p>
            ) : null}
            {sectionInputs.map((_, index) => {
              const selectedSectionId = field.value?.[index];
              const specialtyOptions = specialtyOptionsForSection(selectedSectionId);
              return (
                <div key={index} className='space-y-1.5'>
                  <div className='flex items-center gap-2'>
                    <Select
                      value={selectedSectionId?.toString() || ''}
                      onValueChange={(value) => handleSectionChange(index, value)}
                      disabled={campusFilter === '__all__' || departmentFilter === '__all__' || loadingDepartmentSections || departmentSections.length === 0}
                    >
                      <SelectTrigger className='flex-1'>
                        <SelectValue placeholder='Select a section' />
                      </SelectTrigger>
                      <SelectContent>
                        {departmentSections.map((section) => (
                          <SelectItem key={section.id} value={section.id.toString()}>
                            {section.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {sectionInputs.length > 1 && (
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => removeSectionInput(index)}
                        className='px-2'
                      >
                        <X className='h-4 w-4' />
                      </Button>
                    )}
                  </div>
                  {specialtyOptions.length > 0 && (
                    <div className='pl-1'>
                      <Label className='text-xs text-muted-foreground'>Specialties (optional)</Label>
                      <MultiSelectCheckboxGroup
                        options={specialtyOptions.map((opt) => ({ value: opt.id, label: opt.name }))}
                        selected={specialtyInputs[index] ?? []}
                        onChange={(next) => updateSpecialtyInput(index, next)}
                        className='mt-1'
                      />
                    </div>
                  )}
                </div>
              );
            })}
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={addSectionInput}
              className='w-full'
            >
              <Plus className='h-4 w-4 mr-2' />
              Add Section
            </Button>
          </div>
          <FormMessage />
        </FormItem>
      )} />
    </FormDialog>
  );
};

export default TechnicianForm;
