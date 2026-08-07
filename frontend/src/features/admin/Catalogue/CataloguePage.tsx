import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Building2, Layers, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import * as catalogueService from '@/lib/api/catalogue';
import { sectionsService } from '@/lib/api/organizations';
import type { ServiceCategory, ServiceItem } from '@/types/catalogue';
import type { SectionType, CategoryWithPriority } from './types';
import { useCatalogueData } from './useCatalogueData';
import { SectionTypeForm } from './SectionTypeForm';
import { CategoryForm } from './CategoryForm';
import { ItemForm } from './ItemForm';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { fmtMins } from './format';

type DeleteTarget = { type: 'category' | 'item'; id: number; name: string };

export default function CataloguePage() {
  // Navigation
  const [activeDeptCode, setActiveDeptCode] = useState<string | null>(null);
  const [activeTypeId, setActiveTypeId] = useState<number | null>(null);

  // Dialogs — null = closed; the forms mount only while open so their state
  // resets naturally between opens.
  const [stForm, setStForm] = useState<{ editing: SectionType | null } | null>(null);
  const [catForm, setCatForm] = useState<{ editing: ServiceCategory | null } | null>(null);
  const [itemForm, setItemForm] = useState<{ editing: ServiceItem | null; categoryId?: number } | null>(null);
  const [deletingST, setDeletingST] = useState<SectionType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // First department / first section type auto-select is derived, not stored.
  const {
    sectionTypes, departments, priorities, categories: activeTypeCategories,
    loading, catsLoading, invalidateStructure, invalidateCategories,
  } = useCatalogueData(activeTypeId);

  const effectiveDeptCode = activeDeptCode ?? departments[0]?.code ?? null;
  const typesInDept = sectionTypes.filter(st => st.department_code === effectiveDeptCode);
  const selectedDept = departments.find(d => d.code === effectiveDeptCode);
  const effectiveTypeId = activeTypeId ?? typesInDept[0]?.id ?? null;
  const selectedType = typesInDept.find(st => st.id === effectiveTypeId);

  const selectDepartment = (code: string) => {
    setActiveDeptCode(code);
    setActiveTypeId(null);
  };

  const handleDeleteST = async () => {
    if (!deletingST) return;
    try {
      await sectionsService.deleteSectionType(deletingST.id);
      toast.success(`"${deletingST.name}" deleted`);
      setDeletingST(null);
      if (activeTypeId === deletingST.id) setActiveTypeId(null);
      invalidateStructure();
    } catch {
      toast.error('Failed to delete — it may have categories or sections attached');
    }
  };

  const handleDeleteCategoryOrItem = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'category') {
        await catalogueService.deleteCategory(deleteTarget.id);
        toast.success('Category deleted');
      } else {
        await catalogueService.deleteServiceItem(deleteTarget.id);
        toast.success('Service item deleted');
      }
      setDeleteTarget(null);
      invalidateCategories();
    } catch {
      toast.error(deleteTarget.type === 'category' ? 'Failed to delete category' : 'Failed to delete item');
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Single unified card — Department row + T-separator + Section Types | Categories */}
      <Card className="overflow-hidden">

        {/* ── Department row — same 1/4 + 3/4 split as the grid below ──── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 px-6 py-4">
          <div className="lg:col-span-1 flex items-start gap-2">
            <Building2 className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-base font-semibold text-gray-800">Department</p>
              <p className="text-xs text-gray-400 mt-0.5">Global across all campuses</p>
            </div>
          </div>
          <div className="lg:col-span-3 flex items-center gap-3">
            <Select value={effectiveDeptCode || ''} onValueChange={selectDepartment}>
              <SelectTrigger className="h-8 w-72 text-sm">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map(dept => (
                  <SelectItem key={dept.id} value={dept.code}>{dept.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedDept && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full" />
                {selectedDept.code}
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200" />

        {/* ── Section Types | Categories grid ───────────────────────────── */}
        {selectedDept ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 min-h-[480px]">

            {/* Left column — Section Types with inline CRUD */}
            <div className="lg:col-span-1 lg:border-r border-gray-200 border-b lg:border-b-0 flex flex-col">
              <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-semibold text-gray-700">Section Types</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Select a type to manage its categories</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStForm({ editing: null })}
                  className="gap-1.5 text-xs flex-shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Section Type
                </Button>
              </div>
              <div className="px-5 pb-5 flex-1">
                {typesInDept.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-xs text-gray-400 leading-relaxed mb-3">
                      No section types for this department yet.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setStForm({ editing: null })}
                      className="gap-1.5 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New Section Type
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {typesInDept.map(type => (
                      <div
                        key={type.id}
                        className={`group flex items-center gap-1 rounded-lg transition-all duration-150 ${
                          effectiveTypeId === type.id
                            ? 'bg-blue-50 border border-blue-200 shadow-sm'
                            : 'border border-transparent hover:bg-gray-50 hover:border-gray-200'
                        }`}
                      >
                        <button
                          onClick={() => setActiveTypeId(type.id)}
                          className="flex-1 text-left px-3 py-2 text-sm min-w-0"
                        >
                          <div className={`font-medium leading-tight truncate ${effectiveTypeId === type.id ? 'text-blue-900' : 'text-gray-700'}`}>
                            {type.name}
                          </div>
                          <div className="text-xs opacity-50 mt-0.5">{type.code}</div>
                        </button>
                        <div className="flex gap-0.5 pr-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setStForm({ editing: type })}
                            className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingST(type)}
                            className="h-6 w-6 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right column — Service Categories & Items */}
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between px-6 pt-5 pb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-700">
                    {selectedType ? selectedType.name : 'Service Categories'}
                  </p>
                  {selectedType ? (
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 bg-gray-300 rounded-full" />
                      <span>{selectedType.code}</span>
                      <span className="text-gray-200">·</span>
                      <span>service categories and items</span>
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5">Choose a section type on the left</p>
                  )}
                </div>
                {selectedType && (
                  <Button size="sm" onClick={() => setCatForm({ editing: null })} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    New Service Category
                  </Button>
                )}
              </div>

              <div className="px-6 pb-6">
                {!selectedType ? (
                  <div className="text-center py-16">
                    <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-gray-100 mb-3">
                      <Layers className="h-6 w-6 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-500 font-medium">Select a section type</p>
                    <p className="text-xs text-gray-400 mt-1">Choose from the list on the left to view and manage service categories</p>
                  </div>
                ) : catsLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                ) : activeTypeCategories.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="inline-flex items-center justify-center h-12 w-12 rounded-lg bg-gray-100 mb-3">
                      <Plus className="h-6 w-6 text-gray-300" />
                    </div>
                    <p className="text-sm text-gray-500 font-medium">No service categories yet</p>
                    <p className="text-xs text-gray-400 mt-1 max-w-xs mx-auto">
                      Add the first category for <span className="font-medium text-gray-600">{selectedType.name}</span>.
                      Each category groups related service items users can request.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCatForm({ editing: null })}
                      className="mt-4 gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Service Category
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeTypeCategories.map(cat => {
                      const catWithPriority = cat as CategoryWithPriority & { items?: ServiceItem[] };
                      const items: ServiceItem[] = catWithPriority.items ?? cat.service_items ?? [];
                      return (
                        <div key={cat.id} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                          {/* Category header */}
                          <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-medium text-sm text-gray-900">{cat.name}</h3>
                                {!cat.is_active && (
                                  <Badge variant="secondary" className="text-xs text-orange-600 bg-orange-50 border-orange-200">
                                    Inactive
                                  </Badge>
                                )}
                                {cat.location_details && (
                                  <Badge variant="secondary" className="text-xs">Location Required</Badge>
                                )}
                                {catWithPriority.default_priority && (
                                  <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                                    <Clock className="h-3 w-3" />
                                    {catWithPriority.default_priority.name}
                                    <span className="text-gray-300 mx-0.5">·</span>
                                    {fmtMins(catWithPriority.default_priority.response_minutes)} response
                                  </span>
                                )}
                              </div>
                              {cat.description && (
                                <p className="text-xs text-gray-500 mt-1">{cat.description}</p>
                              )}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCatForm({ editing: cat })}
                                className="h-8 w-8 p-0 hover:bg-blue-50 text-gray-400 hover:text-blue-600"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteTarget({ type: 'category', id: cat.id, name: cat.name })}
                                className="h-8 w-8 p-0 hover:bg-red-50 text-gray-400 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* Service Items */}
                          <div className="mt-3 space-y-1.5">
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Service Items</p>
                            {items.length > 0 ? (
                              items.map(item => (
                                <div key={item.id} className="flex items-start justify-between gap-3 p-2.5 rounded-md bg-gray-50 hover:bg-gray-100 transition-colors">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                                      {item.default_priority && (
                                        <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                                          <Clock className="h-3 w-3" />
                                          {item.default_priority.name} override
                                        </span>
                                      )}
                                    </div>
                                    {item.description && (
                                      <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                                    )}
                                  </div>
                                  <div className="flex gap-1 flex-shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setItemForm({ editing: item, categoryId: cat.id })}
                                      className="h-7 w-7 p-0 hover:bg-blue-100 text-gray-400 hover:text-blue-600"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setDeleteTarget({ type: 'item', id: item.id, name: item.name })}
                                      className="h-7 w-7 p-0 hover:bg-red-100 text-gray-400 hover:text-red-600"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="text-xs text-gray-400 italic py-1">No service items yet — add the specific requests users can raise under this category.</p>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setItemForm({ editing: null, categoryId: cat.id })}
                              className="w-full text-xs mt-2 gap-1.5 text-gray-600 hover:text-gray-900"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add Service Item to {cat.name}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        ) : (
          <div className="px-6 py-12 text-center text-sm text-gray-400">
            Select a department above to get started.
          </div>
        )}

      </Card>

      {/* ── Dialogs (mounted only while open) ─────────────────────────────── */}

      {stForm && (
        <SectionTypeForm
          departments={departments}
          sectionTypes={sectionTypes}
          activeDeptCode={effectiveDeptCode}
          editing={stForm.editing}
          onSaved={() => { setStForm(null); invalidateStructure(); }}
          onClose={() => setStForm(null)}
        />
      )}

      <DeleteConfirmDialog
        open={!!deletingST}
        title={`Delete "${deletingST?.name}"?`}
        description={
          <>
            This section type and all its service categories will be permanently deleted.
            Physical sections that reference it will also be affected.
          </>
        }
        onCancel={() => setDeletingST(null)}
        onConfirm={handleDeleteST}
      />

      {selectedType && catForm && (
        <CategoryForm
          sectionTypeId={selectedType.id}
          sectionTypeName={selectedType.name}
          sectionTypeOptions={typesInDept}
          priorities={priorities}
          editing={catForm.editing}
          onSaved={() => { setCatForm(null); invalidateCategories(); }}
          onClose={() => setCatForm(null)}
        />
      )}

      {selectedType && itemForm && (
        <ItemForm
          categoryId={itemForm.categoryId}
          categories={activeTypeCategories}
          priorities={priorities}
          editing={itemForm.editing}
          onSaved={() => { setItemForm(null); invalidateCategories(); }}
          onClose={() => setItemForm(null)}
        />
      )}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.type === 'category' ? 'Category' : 'Item'}?`}
        description={
          <>
            Are you sure you want to delete{' '}
            <span className="font-medium text-gray-900">"{deleteTarget?.name}"</span>?
            This cannot be undone.
          </>
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteCategoryOrItem}
      />
    </div>
  );
}
