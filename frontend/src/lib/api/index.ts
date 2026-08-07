// Barrel — re-export everything from domain modules
export { default as apiClient } from './client';

export * from './auth';
//export { default as authService } from './auth';

export * from './tickets';
export { default as ticketsService } from './tickets';

export * from './users';
export { default as usersService } from './users';

export * from './analytics';
export { default as analyticsService } from './analytics';

export * from './technicians';
export { default as techniciansService } from './technicians';

export * from './organizations';
export { default as organizationsService } from './organizations';
export {
  campusesService,
  departmentsService,
  campusDepartmentsService,
  sectionsService,
  facilitiesService,
} from './organizations';

export * from './catalogue';

export * from './reports';
export { default as reportsService } from './reports';

//export * from './dashboard';
// dashboard.ts exports {} only — no default service to re-export

export * from './notifications';
export { default as notificationsService } from './notifications';

export * from './services';

export * from './admin';

export * from './sla';
