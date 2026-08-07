import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { campusesService, departmentsService, sectionsService } from '@/lib/api/organizations';
import type { UserRole, Campus, Department } from '@/types';
import {
  ROLE_LABELS,
  ROLES_REQUIRING_SECTION,
  ROLES_REQUIRING_CAMPUS_DEPT,
  ROLES_REQUIRING_DEPARTMENT,
  type RoleScopeValue,
} from './constants';

/** Role + Campus/Department/Section cascading selects, shared by the role-assignment
 * modal and the Add/Edit User dialog so both stay in sync with what the backend accepts. */
export function RoleScopeSelectFields({
  value,
  onChange,
  compact = false,
}: {
  value: RoleScopeValue;
  onChange: (next: RoleScopeValue) => void;
  compact?: boolean;
}) {
  const { role, campus_id, department_id, section_id } = value;
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sections, setSections] = useState<{ id: number; name: string }[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);

  const needsSection = ROLES_REQUIRING_SECTION.includes(role);
  const needsCampusDept = ROLES_REQUIRING_CAMPUS_DEPT.includes(role);
  const needsDepartment = ROLES_REQUIRING_DEPARTMENT.includes(role);
  const needsCampus = needsSection || needsCampusDept;

  useEffect(() => {
    campusesService.getCampuses().then(setCampuses).catch(() => {});
  }, []);

  // Load departments when campus changes (also runs on mount to hydrate an edit-mode value)
  useEffect(() => {
    if (!campus_id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDepartments([]);
      return;
    }
    setLoadingDepts(true);
    departmentsService
      .getDepartments({ campus: Number(campus_id) })
      .then(setDepartments)
      .catch(() => {})
      .finally(() => setLoadingDepts(false));
  }, [campus_id]);

  // Load sections when campus or department changes (for technician/HOS)
  useEffect(() => {
    if (!campus_id || !department_id || !needsSection) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSections([]);
      return;
    }
    setLoadingSections(true);
    sectionsService
      .getSections({ campus: Number(campus_id), department: Number(department_id) })
      .then(setSections)
      .catch(() => {})
      .finally(() => setLoadingSections(false));
  }, [campus_id, department_id, needsSection]);

  const triggerClass = compact ? 'h-8 text-sm' : '';
  const labelClass = compact ? 'text-xs' : '';

  return (
    <>
      <div className="space-y-1.5">
        <Label className={labelClass}>Role</Label>
        <Select
          value={role}
          onValueChange={v => onChange({ role: v as UserRole, campus_id: '', department_id: '', section_id: '' })}
        >
          <SelectTrigger className={triggerClass}><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
              <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Campus — shown for roles that need it */}
      {(needsCampus || needsDepartment) && (
        <div className="space-y-1.5">
          <Label className={labelClass}>Campus {needsCampus ? '' : '(optional)'}</Label>
          <Select value={campus_id} onValueChange={v => onChange({ ...value, campus_id: v, department_id: '', section_id: '' })}>
            <SelectTrigger className={triggerClass}><SelectValue placeholder="Select campus" /></SelectTrigger>
            <SelectContent>
              {campuses.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Department — shown when campus is selected */}
      {(needsCampus || needsDepartment) && (
        <div className="space-y-1.5">
          <Label className={labelClass}>Department</Label>
          <Select
            value={department_id}
            onValueChange={v => onChange({ ...value, department_id: v, section_id: '' })}
            disabled={!campus_id || loadingDepts}
          >
            <SelectTrigger className={triggerClass}>
              <SelectValue placeholder={!campus_id ? 'Select campus first' : loadingDepts ? 'Loading…' : 'Select department'} />
            </SelectTrigger>
            <SelectContent>
              {departments.map(d => (
                <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Section — only for technician / HOS */}
      {needsSection && (
        <div className="space-y-1.5">
          <Label className={labelClass}>Section</Label>
          <Select
            value={section_id}
            onValueChange={v => onChange({ ...value, section_id: v })}
            disabled={!department_id || loadingSections}
          >
            <SelectTrigger className={triggerClass}>
              <SelectValue placeholder={!department_id ? 'Select department first' : loadingSections ? 'Loading…' : 'Select section'} />
            </SelectTrigger>
            <SelectContent>
              {sections.map(s => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}
