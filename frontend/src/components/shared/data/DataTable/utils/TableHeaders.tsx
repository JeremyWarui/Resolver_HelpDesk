import { CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ReactElement, ReactNode } from "react";

export interface TableHeaderProps {
  title?: string;
  subtitle?: string;
  handleSearch: (value: string) => void;
  searchValue: string;
  searchPlaceholder: string;
  renderFilters: () => ReactNode;
  renderColumnVisibilityDropdown: () => ReactElement;
  isAdminVariant: boolean;
  isUserVariant: boolean;
  isTechVariant: boolean;
}

export const DefaultTableHeader = ({
  title,
  subtitle,
  handleSearch,
  searchValue,
  searchPlaceholder,
  renderFilters,
  renderColumnVisibilityDropdown,
  isAdminVariant,
}: TableHeaderProps) => {
  return (
    <>
      {title && (
        <CardHeader className={isAdminVariant ? "px-0 pt-0 pb-2" : "px-0 pb-2"}>
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </CardHeader>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-center py-2">
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(event) => handleSearch(event.target.value)}
          className="max-w-sm"
        />
        <div className="flex flex-col gap-4 md:flex-row">
          {renderFilters()}
        </div>
        {renderColumnVisibilityDropdown()}
      </div>
    </>
  );
};

export const AdminTableHeader = ({
  title,
  handleSearch,
  searchValue,
  searchPlaceholder,
  renderFilters,
  renderColumnVisibilityDropdown,
}: TableHeaderProps) => {
  return (
    <>
      {title && (
        <CardHeader className="px-0 pt-0 pb-2">
          <CardTitle className="text-2xl">{title}</CardTitle>
        </CardHeader>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-center py-2">
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(event) => handleSearch(event.target.value)}
          className="max-w-sm"
        />
        <div className="flex flex-col gap-4 md:flex-row">
          {renderFilters()}
        </div>
        {renderColumnVisibilityDropdown()}
      </div>
    </>
  );
};

export const UserTableHeader = ({
  title,
  handleSearch,
  searchValue,
  searchPlaceholder,
  renderFilters,
  renderColumnVisibilityDropdown,
}: TableHeaderProps) => {
  return (
    <>
      {title && (
        <CardHeader className="px-0">
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-center py-4">
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(event) => handleSearch(event.target.value)}
          className="max-w-sm"
        />
        <div className="flex flex-col gap-4 md:flex-row">
          {renderFilters()}
        </div>
        {renderColumnVisibilityDropdown()}
      </div>
    </>
  );
};

export const TechTableHeader = ({
  title,
  handleSearch,
  searchValue,
  searchPlaceholder,
  renderFilters,
  renderColumnVisibilityDropdown,
}: TableHeaderProps) => {
  return (
    <>
      {title && (
        <CardHeader className="px-0 pt-0 pb-2">
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        </CardHeader>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-center py-2">
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(event) => handleSearch(event.target.value)}
          className="max-w-sm"
        />
        <div className="flex flex-col gap-4 md:flex-row">
          {renderFilters()}
        </div>
        {renderColumnVisibilityDropdown()}
      </div>
    </>
  );
};
