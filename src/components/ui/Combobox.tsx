import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./Command";

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
  keywords?: string[];
  disabled?: boolean;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  id?: string;
  required?: boolean;
}

export const Combobox: React.FC<ComboboxProps> = ({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  disabled = false,
  className,
  triggerClassName,
  contentClassName,
  id,
}) => {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);

  const selectedOption = React.useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options;
    const query = search.toLowerCase().trim();
    return options.filter((opt) => {
      if (opt.label.toLowerCase().includes(query)) return true;
      if (opt.sublabel && opt.sublabel.toLowerCase().includes(query)) return true;
      if (opt.keywords && opt.keywords.some((k) => k.toLowerCase().includes(query)))
        return true;
      return false;
    });
  }, [options, search]);

  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredOptions]);

  const handleSelect = (optionValue: string) => {
    onValueChange(optionValue);
    setOpen(false);
    setSearch("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (
        filteredOptions.length > 0 &&
        highlightedIndex >= 0 &&
        highlightedIndex < filteredOptions.length
      ) {
        handleSelect(filteredOptions[highlightedIndex].value);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      );
    }
  };

  return (
    <div className={cn("w-full", className)}>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between h-9 px-3 font-normal text-sm border-slate-300 bg-white hover:bg-slate-50 focus-visible:ring-1 focus-visible:ring-teal-700",
              !selectedOption?.label && "text-slate-400",
              triggerClassName
            )}
          >
            <span className="truncate">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className={cn("w-full p-0 shadow-lg border-slate-200", contentClassName)}
          align="start"
        >
          <Command search={search} onSearchChange={setSearch}>
            <CommandInput
              placeholder={searchPlaceholder}
              autoFocus
              className="h-9 text-xs"
              onKeyDown={handleKeyDown}
            />
            <CommandList className="max-h-56">
              {filteredOptions.length === 0 ? (
                <CommandEmpty>{emptyText}</CommandEmpty>
              ) : (
                <CommandGroup>
                  {filteredOptions.map((opt, index) => {
                    const isSelected = opt.value === value;
                    const isHighlighted = highlightedIndex === index;
                    return (
                      <CommandItem
                        key={opt.value}
                        disabled={opt.disabled}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onSelect={() => handleSelect(opt.value)}
                        className={cn(
                          "flex items-center justify-between text-xs py-2 px-2.5",
                          isHighlighted && "bg-slate-100",
                          isSelected && "bg-teal-50 font-medium text-teal-900"
                        )}
                      >
                        <div className="flex flex-col gap-0.5 truncate pr-2">
                          <span className="truncate">{opt.label}</span>
                          {opt.sublabel && (
                            <span className="text-[11px] text-slate-500 font-normal truncate">
                              {opt.sublabel}
                            </span>
                          )}
                        </div>
                        <Check
                          className={cn(
                            "size-3.5 shrink-0 text-teal-700 transition-opacity",
                            isSelected ? "opacity-100" : "opacity-0"
                          )}
                        />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export * from "./Popover";
export * from "./Command";
