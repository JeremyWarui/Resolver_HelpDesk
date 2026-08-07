import apiClient from './client';
import type {
  User,
  CreateUserPayload,
  UpdateUserPayload,
  UsersResponse,
  RoleAssignment,
  CreateRoleAssignmentPayload,
  UpdateRoleAssignmentPayload,
} from '@/types';

export interface UserListParams {
  role?: string;
  page?: number;
  page_size?: number;
}

export async function getUsers(_params?: UserListParams): Promise<UsersResponse> {
  const { data } = await apiClient.get<UsersResponse>('/users/');
  return data;
}

export async function getUserById(id: number): Promise<User> {
  const { data } = await apiClient.get<User>(`/users/${id}/`);
  return data;
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const { data } = await apiClient.post<User>('/users/', payload);
  return data;
}

export async function updateUser(id: number, payload: UpdateUserPayload): Promise<User> {
  const { data } = await apiClient.patch<User>(`/users/${id}/`, payload);
  return data;
}

export async function deleteUser(id: number): Promise<void> {
  await apiClient.delete(`/users/${id}/`);
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

export async function updateRoleAssignment(
  userId: number,
  raId: number,
  payload: UpdateRoleAssignmentPayload
): Promise<RoleAssignment> {
  const { data } = await apiClient.patch<RoleAssignment>(
    `/users/${userId}/role-assignments/${raId}/`,
    payload
  );
  return data;
}

export async function deleteRoleAssignment(userId: number, raId: number): Promise<void> {
  await apiClient.delete(`/users/${userId}/role-assignments/${raId}/`);
}

const usersService = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getRoleAssignments,
  createRoleAssignment,
  updateRoleAssignment,
  deleteRoleAssignment,
};

export default usersService;
