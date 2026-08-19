import { useState, useEffect, useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormDialog } from '@/components/shared/forms/FormDialog';
import { MultiSelectCheckboxGroup } from '@/components/shared/forms/MultiSelectCheckboxGroup';
import { useCreateUser } from '@/hooks/users/useCreateUser';
import { useSections } from '@/hooks/sections/useSections';
import { useDepartments } from '@/hooks/departments/useDepartments';
import { useUpdateUser } from '@/hooks/users/useUpdateUser';
import { createTechnicianSchema, type CreateTechnicianFormValues } from '@/utils/entityValidation';
import { sectionsService } from '@/lib/api/organizations';
import { getSubSections } from '@/lib/api/catalogue';
import { createRoleAssignment, getRoleAssignments } from '@/lib/api/users';
import { handleDRFError } from '@/utils/handleDRFError';
import { deriveIdentity } from '@/utils/identity';
import type { Technician, CreateUserPayload } from '@/types';

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
  const [campusFilter, setCampusFilter] = useState<string>('__all__');
  const [departmentFilter, setDepartmentFilter] = useState<string>('__all__');
  const [departmentSections, setDepartmentSections] = useState<Array<{ id: number; name: string; section_type: number | null }>>([]);
  const [loadingDepartmentSections, setLoadingDepartmentSections] = useState(false);
  const [trades, setTrades] = useState<Array<{ id: number; name: string }>>([]);
  const { createUser } = useCreateUser();
  const { updateUser } = useUpdateUser();
  const { sections } = useSections();
  const selectedCampusId = campusFilter !== '__all__' ? Number(campusFilter) : undefined;
  const { departments: departmentOptions } = useDepartments(selectedCampusId);

  // Unique campuses derived from sections
  const campuses = useMemo(() => {
    const map = new Map<number, { id: number; code: string; name: string }>();
    sections.forEach(s => {
      if (s.campus?.id) map.set(s.campus.id, { id: s.campus.id, code: s.campus.code, name: s.campus.name });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sections]);

  const [prevDeptFilter, setPrevDeptFilter] = useState(departmentFilter);

  if (prevDeptFilter !== departmentFilter) {
    setPrevDeptFilter(departmentFilter);
    const deptId = departmentFilter !== '__all__' ? Number(departmentFilter) : null;
    if (!deptId || Number.isNaN(deptId)) {
      setDepartmentSections([]);
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
      email: '',
      password: '',
      sub_section_ids: [],
      primary_department_id: null,
    },
  });

  const selectedSectionId = form.watch('section_id');

  // The trades on offer are the ones defined under the chosen section's type.
  // Fetched per section rather than all at once: which trades exist is a
  // property of the section type, and picking a different section must not
  // leave a stale list the server would then reject.
  useEffect(() => {
    const sectionType = departmentSections.find((sec) => sec.id === selectedSectionId)?.section_type;
    if (!sectionType) { setTrades([]); return; }
    let active = true;
    getSubSections({ section_type: sectionType, is_active: true })
      .then((res) => {
        if (!active) return;
        const raw = res.data as unknown;
        const rows = Array.isArray(raw) ? raw : ((raw as { results?: unknown[] }).results ?? []);
        setTrades(rows as Array<{ id: number; name: string }>);
      })
      .catch(() => { if (active) setTrades([]); });
    return () => { active = false; };
  }, [selectedSectionId, departmentSections]);

  // Pre-fill the existing assignment when editing. The role assignment is the
  // single source of truth for both the section and the trades — the roster
  // rows are derived from it server-side, so there is nothing else to read.
  useEffect(() => {
    if (!isOpen || !technician) return;
    let active = true;
    getRoleAssignments(technician.id)
      .then(([ra]) => {
        if (!active || !ra?.section_id) return;
        form.setValue('section_id', ra.section_id);
        form.setValue('sub_section_ids', ra.sub_section_ids ?? []);
      })
      .catch(() => { /* the form still opens; the admin re-picks */ });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, technician?.id]);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevTechnicianId, setPrevTechnicianId] = useState(technician?.id);

  if (prevIsOpen !== isOpen || prevTechnicianId !== technician?.id) {
    setPrevIsOpen(isOpen);
    setPrevTechnicianId(technician?.id);
    setPendingRoleUserId(null);
    if (isOpen) {
      if (technician) {
        setCampusFilter(technician.primary_campus_id ? String(technician.primary_campus_id) : '__all__');
        setDepartmentFilter(technician.primary_department_id ? String(technician.primary_department_id) : '__all__');
        form.reset({
          email: technician.email || '',
          password: '',
          // section_id and sub_section_ids arrive from getRoleAssignments below.
          sub_section_ids: [],
          primary_department_id: null,
        });
      } else {
        setCampusFilter('__all__');
        setDepartmentFilter('__all__');
        setDepartmentSections([]);
        form.reset({
          email: '',
          password: '',
          sub_section_ids: [],
          primary_department_id: null,
        });
      }
    }
  }

  const onSubmit = async (values: CreateTechnicianFormValues) => {
    setIsSubmitting(true);
    try {
      // Sections are campus-scoped, so the account's campus is derived from
      // whichever section was picked — same resolution for create and edit.
      const campusId = sections.find(s => s.id === values.section_id)?.campus?.id ?? null;

      let userId: number;

      if (pendingRoleUserId != null) {
        // Previous attempt created the account but the role step failed —
        // retry the role assignment for that account instead of duplicating it.
        userId = pendingRoleUserId;
      } else if (technician) {
        // Email only — name and username follow it. (Password is not settable
        // through this endpoint; it never was.)
        const res = await updateUser(technician.id, { email: values.email });
        if (!res) {
          toast.error('Failed to update technician');
          setIsSubmitting(false);
          return;
        }
        userId = technician.id;
      } else {
        if (!campusId) {
          toast.error('Select a section so the campus can be determined');
          setIsSubmitting(false);
          return;
        }
        const createPayload: CreateUserPayload = {
          email: values.email,
          password: values.password,
          campus_id: campusId,
        };
        const created = await createUser(createPayload);
        userId = created.id;
      }

      try {
        // One call does the whole job: the server writes the RoleAssignment and
        // syncs the SectionTechnician rows from sub_section_ids. It also
        // refuses a technician with no trades, so there is no path to an
        // account that holds the role but can see no tickets.
        await createRoleAssignment(userId, {
          role: 'technician',
          section_id: values.section_id,
          sub_section_ids: values.sub_section_ids,
          campus_id: campusId,
          department_id: values.primary_department_id ?? null,
        });
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
      <FormField control={form.control} name='email' render={({ field }) => {
        const derived = deriveIdentity(field.value ?? '');
        return (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input type='email' placeholder='you@ksg.ac.ke' {...field} />
            </FormControl>
            <p className='text-xs text-muted-foreground'>
              {derived
                ? <>Appears as <span className='font-medium text-foreground'>{derived.name}</span>, username <span className='font-mono'>{derived.username}</span>.</>
                : <>Name and username come from the part before the @.</>}
            </p>
            <FormMessage />
          </FormItem>
        );
      }} />

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
            // Sections are campus-scoped and trades are section-scoped, so
            // changing campus invalidates both — clearing them beats leaving a
            // stale pair the server would reject on save.
            form.resetField('section_id');
            form.setValue('sub_section_ids', []);
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
              form.resetField('section_id');
              form.setValue('sub_section_ids', []);
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

      <FormField control={form.control} name='section_id' render={({ field }) => (
        <FormItem>
          <FormLabel>Section</FormLabel>
          {campusFilter === '__all__' || departmentFilter === '__all__' ? (
            <p className='text-sm text-muted-foreground'>Select a campus and department first to see its sections.</p>
          ) : loadingDepartmentSections ? (
            <p className='text-sm text-muted-foreground'>Loading sections…</p>
          ) : departmentSections.length === 0 ? (
            <p className='text-sm text-muted-foreground'>No sections found for this department.</p>
          ) : (
            <Select
              value={field.value ? String(field.value) : ''}
              onValueChange={(value) => {
                field.onChange(Number(value));
                // Trades belong to the section's type, so a selection carried
                // over from another section would point at the wrong one.
                form.setValue('sub_section_ids', []);
              }}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder='Select a section' />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {departmentSections.map((section) => (
                  <SelectItem key={section.id} value={String(section.id)}>
                    {section.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <FormMessage />
        </FormItem>
      )} />

      <FormField control={form.control} name='sub_section_ids' render={({ field }) => (
        <FormItem>
          <FormLabel>Trades</FormLabel>
          {!selectedSectionId ? (
            <p className='text-sm text-muted-foreground'>Pick a section to see the trades it covers.</p>
          ) : trades.length === 0 ? (
            <p className='text-sm text-muted-foreground'>No trades defined for this section.</p>
          ) : (
            <MultiSelectCheckboxGroup
              options={trades.map((t) => ({ value: t.id, label: t.name }))}
              selected={field.value ?? []}
              onChange={field.onChange}
            />
          )}
          <p className='text-xs text-muted-foreground'>
            A technician only sees tickets in the trades they work — pick at least one,
            or the account will have the role but an empty queue.
          </p>
          <FormMessage />
        </FormItem>
      )} />

    </FormDialog>
  );
};

export default TechnicianForm;
