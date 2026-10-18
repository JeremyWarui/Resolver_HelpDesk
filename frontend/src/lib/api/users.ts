import apiClient, { fetchAll, rows } from './client';
import type {
  User,
  CreateUserPayload,
  UpdateUserPayload,
  RoleAssignment,
  CreateRoleAssignmentPayload,
  Technician,
} from '@/types';

/** Every account. The admin table filters and sorts the whole list in the page. */
export function getUsers(): Promise<User[]> {
  return fetchAll<User>('/users/');
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const { data } = await apiClient.post<User>('/users/', payload);
  return data;
}

export async function updateUser(id: number, payload: UpdateUserPayload): Promise<User> {
  const { data } = await apiClient.patch<User>(`/users/${id}/`, payload);
  return data;
}

/** Stop an account signing in, holding a post or being picked. Its history stays. */
export async function deactivateUser(id: number): Promise<User> {
  const { data } = await apiClient.post<User>(`/users/${id}/deactivate/`);
  return data;
}

export async function reactivateUser(id: number): Promise<User> {
  const { data } = await apiClient.post<User>(`/users/${id}/reactivate/`);
  return data;
}

export async function getRoleAssignments(userId: number): Promise<RoleAssignment[]> {
  const { data } = await apiClient.get<RoleAssignment[]>(`/users/${userId}/role-assignments/`);
  return data;
}

export async function createRoleAssignment(
  userId: number,
  payload: CreateRoleAssignmentPayload
): Promise<RoleAssignment> {
  const { data } = await apiClient.post<RoleAssignment>(
    `/users/${userId}/role-assignments/`,
    payload
  );
  return data;
}

/** The technicians in the caller's scope, idle ones included; `campus` and `trade` only narrow it. */
export async function getTechnicians(params: { campus?: number; trade?: number }): Promise<Technician[]> {
  const { data } = await apiClient.get('/technicians/', { params });
  return rows<Technician>(data);
}
