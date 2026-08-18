import apiClient from './client';
import type {
  User,
  CreateUserPayload,
  UpdateUserPayload,
  UsersResponse,
  RoleAssignment,
  CreateRoleAssignmentPayload,
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

const usersService = {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getRoleAssignments,
  createRoleAssignment,
};

export default usersService;
