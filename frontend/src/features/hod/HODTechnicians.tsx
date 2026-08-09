import TechniciansPage from '@/features/admin/Technicians/TechniciansPage';

/**
 * The shared technicians roster, read-only.
 *
 * This was a bespoke list of names and usernames — no trade, no open load, no
 * campus — which told a HOD nothing they could act on. `TechniciansPage` scopes
 * entirely server-side (JWT role), so rendering it here shows the HOD their own
 * campus's technicians grouped by trade, with live open counts. `manage` is off:
 * creating and editing technicians stays with the admin.
 */
const HODTechnicians = () => <TechniciansPage manage={false} />;

export default HODTechnicians;
