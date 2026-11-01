import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandContextType {
  search: string;
  setSearch: (value: string) => void;
}

const CommandContext = React.createContext<CommandContextType | null>(null);

export function useCommand() {
  const context = React.useContext(CommandContext);
  if (!context) {
    throw new Error("useCommand must be used within a Command");
  }
  return context;
}

export interface CommandProps extends React.HTMLAttributes<HTMLDivElement> {
  search?: string;
  onSearchChange?: (value: string) => void;
}

export const Command = React.forwardRef<HTMLDivElement, CommandProps>(
  ({ className, search: controlledSearch, onSearchChange, children, ...props }, ref) => {
    const [uncontrolledSearch, setUncontrolledSearch] = React.useState("");

    const isControlled = controlledSearch !== undefined;
    const search = isControlled ? controlledSearch : uncontrolledSearch;

    const setSearch = React.useCallback(
      (value: string) => {
        if (!isControlled) {
          setUncontrolledSearch(value);
        }
        onSearchChange?.(value);
      },
      [isControlled, onSearchChange]
    );

    return (
      <CommandContext.Provider value={{ search, setSearch }}>
        <div
          ref={ref}
          className={cn(
            "flex h-full w-full flex-col overflow-hidden rounded-md bg-white text-slate-900",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </CommandContext.Provider>
    );
  }
);
Command.displayName = "Command";

export interface CommandInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  onValueChange?: (value: string) => void;
  wrapperClassName?: string;
}

export const CommandInput = React.forwardRef<HTMLInputElement, CommandInputProps>(
  ({ className, wrapperClassName, placeholder = "Search...", onValueChange, onKeyDown, ...props }, ref) => {
    const { search, setSearch } = useCommand();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearch(val);
      onValueChange?.(val);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
      }
      onKeyDown?.(e);
    };

    return (
      <div
        className={cn("flex items-center border-b border-slate-100 px-3", wrapperClassName)}
        data-slot="command-input-wrapper"
      >
        <Search className="mr-2 size-4 shrink-0 text-slate-400" />
        <input
          ref={ref}
          type="text"
          value={search}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "flex h-9 w-full rounded-md bg-transparent py-2 text-sm outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
CommandInput.displayName = "CommandInput";

export const CommandList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("max-h-60 overflow-y-auto overflow-x-hidden p-1", className)}
      {...props}
    />
  );
});
CommandList.displayName = "CommandList";

export const CommandEmpty = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("py-6 text-center text-sm text-slate-500", className)}
      {...props}
    />
  );
});
CommandEmpty.displayName = "CommandEmpty";

export interface CommandGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  heading?: React.ReactNode;
}

export const CommandGroup = React.forwardRef<HTMLDivElement, CommandGroupProps>(
  ({ className, heading, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("overflow-hidden p-1 text-slate-900", className)}
        {...props}
      >
        {heading && (
          <div className="px-2 py-1.5 text-xs font-semibold text-slate-400">
            {heading}
          </div>
        )}
        {children}
      </div>
    );
  }
);
CommandGroup.displayName = "CommandGroup";

export interface CommandItemProps extends React.HTMLAttributes<HTMLDivElement> {
  disabled?: boolean;
  onSelect?: () => void;
  value?: string;
}

export const CommandItem = React.forwardRef<HTMLDivElement, CommandItemProps>(
  ({ className, disabled, onSelect, onClick, children, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return;
      onClick?.(e);
      onSelect?.();
    };

    return (
      <div
        ref={ref}
        role="option"
        aria-disabled={disabled}
        onClick={handleClick}
        className={cn(
          "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
          disabled && "pointer-events-none opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
CommandItem.displayName = "CommandItem";

export const CommandSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-slate-200", className)}
      {...props}
    />
  );
});
CommandSeparator.displayName = "CommandSeparator";
