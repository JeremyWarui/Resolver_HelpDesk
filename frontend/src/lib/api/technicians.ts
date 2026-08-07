export interface TechnicianFilters {
  campus_department_id?: number;
  section_ids?: string;
  section_id?: number;
  campus_id?: number;
}

/**
 * ⚠️ DEPRECATED: /technicians/ endpoint does not exist
 * Use /sections/{id}/technicians/ or role-assignments with role='technician'.
 * @deprecated
 */
export async function getTechnicians(
  _filters?: TechnicianFilters
): Promise<never[]> {
  throw new Error(
    'Technicians endpoint (/technicians/) does not exist. ' +
    'Use /sections/{id}/technicians/ for section-scoped technician lists, ' +
    'or query role-assignments with role="technician" for global technician data.'
  );
}

const techniciansService = { getTechnicians };
export default techniciansService;
