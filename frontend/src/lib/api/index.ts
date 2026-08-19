// Barrel — re-export everything from domain modules
export { default as apiClient } from './client';

export * from './auth';

export * from './tickets';
export { default as ticketsService } from './tickets';

export * from './users';
export { default as usersService } from './users';

export * from './analytics';

export * from './organizations';
export { default as organizationsService } from './organizations';

export * from './catalogue';

export * from './reports';
export { default as reportsService } from './reports';

export * from './notifications';

export * from './admin';

export * from './sla';
