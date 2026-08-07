// Service catalogue domain module
// Re-exports all catalogue functions under the "services" name used in the plan.
// The underlying implementation lives in catalogue.ts.
export {
  getCategoriesBySectionType,
  getAllCategories,
  getServiceItemsByCategory,
  getAllServiceItems,
  getServiceItemDetail,
  createCategory,
  updateCategory,
  deleteCategory,
  createServiceItem,
  updateServiceItem,
  deleteServiceItem,
} from './catalogue';
