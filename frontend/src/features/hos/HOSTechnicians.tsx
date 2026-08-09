import TechniciansPage from '@/features/admin/Technicians/TechniciansPage';

/**
 * The shared technicians roster, read-only. See `HODTechnicians` — the HOS page
 * was the same names-and-usernames list, and the same scoped component answers
 * it: their section's technicians grouped by trade, with live open counts.
 */
const HOSTechnicians = () => <TechniciansPage manage={false} />;

export default HOSTechnicians;
