import { CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ReactNode } from "react";

interface TableHeaderProps {
  title?: string;
  subtitle?: string;
  handleSearch: (value: string) => void;
  searchValue: string;
  searchPlaceholder: string;
  filters: ReactNode;
  columnVisibilityDropdown: ReactNode;
}

export const DefaultTableHeader = ({
  title,
  subtitle,
  handleSearch,
  searchValue,
  searchPlaceholder,
  filters,
  columnVisibilityDropdown,
}: TableHeaderProps) => {
  return (
    <>
      {title && (
        <CardHeader className="px-0 pt-0 pb-2 flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-semibold">{title}</CardTitle>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
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
          {filters}
        </div>
        {columnVisibilityDropdown}
      </div>
    </>
  );
};
