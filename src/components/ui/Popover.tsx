import * as React from "react";
import { cn } from "@/lib/utils";

interface PopoverContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLDivElement | null>;
}

const PopoverContext = React.createContext<PopoverContextType | null>(null);

export function usePopover() {
  const context = React.useContext(PopoverContext);
  if (!context) {
    throw new Error("usePopover must be used within a Popover");
  }
  return context;
}

interface PopoverProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function Popover({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
}: PopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = React.useCallback(
    (newOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(newOpen);
      }
      onOpenChange?.(newOpen);
    },
    [isControlled, onOpenChange]
  );

  return (
    <PopoverContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className="relative inline-block w-full" ref={triggerRef}>
        {children}
      </div>
    </PopoverContext.Provider>
  );
}

interface PopoverTriggerProps extends React.HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
  children: React.ReactNode;
}

export const PopoverTrigger = React.forwardRef<HTMLDivElement, PopoverTriggerProps>(
  ({ className, children, onClick, ...props }, ref) => {
    const { open, setOpen } = usePopover();

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      onClick?.(e);
      if (!e.defaultPrevented) {
        setOpen(!open);
      }
    };

    return (
      <div
        ref={ref}
        onClick={handleClick}
        className={cn("w-full cursor-pointer", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
PopoverTrigger.displayName = "PopoverTrigger";

interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "center" | "end";
  sideOffset?: number;
}

export const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, align = "start", children, ...props }, ref) => {
    const { open, setOpen, triggerRef } = usePopover();
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    const [placement, setPlacement] = React.useState<"bottom" | "top">("bottom");

    React.useLayoutEffect(() => {
      if (!open || !triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 240 && spaceAbove > spaceBelow) {
        setPlacement("top");
      } else {
        setPlacement("bottom");
      }
    }, [open, triggerRef]);

    React.useEffect(() => {
      if (!open) return;

      const handlePointerDown = (event: MouseEvent | TouchEvent) => {
        const target = event.target as Node | null;
        if (
          contentRef.current &&
          !contentRef.current.contains(target) &&
          triggerRef.current &&
          !triggerRef.current.contains(target)
        ) {
          setOpen(false);
        }
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      };

      document.addEventListener("mousedown", handlePointerDown);
      document.addEventListener("touchstart", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);

      return () => {
        document.removeEventListener("mousedown", handlePointerDown);
        document.removeEventListener("touchstart", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [open, setOpen, triggerRef]);

    if (!open) return null;

    const alignClasses = {
      start: "left-0",
      center: "left-1/2 -translate-x-1/2",
      end: "right-0",
    };

    const placementClasses = {
      bottom: "top-full mt-1",
      top: "bottom-full mb-1",
    };

    return (
      <div
        ref={(node) => {
          contentRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={cn(
          "absolute z-50 min-w-[8rem] w-full rounded-md border border-slate-200 bg-white p-1 text-slate-900 shadow-lg outline-none animate-in fade-in-0 zoom-in-95",
          placementClasses[placement],
          alignClasses[align],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
PopoverContent.displayName = "PopoverContent";
