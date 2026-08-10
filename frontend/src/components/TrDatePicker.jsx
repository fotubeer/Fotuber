import React, { useState } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// value & onChange use ISO "YYYY-MM-DD"; display is Turkish "gg.aa.yyyy".
function parseISO(v) {
  if (!v) return undefined;
  const [y, m, d] = String(v).split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}
function toISO(date) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function TrDatePicker({ value, onChange, placeholder = "Tarih seçin", testid, dark = false, className }) {
  const [open, setOpen] = useState(false);
  const selected = parseISO(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testid}
          className={cn(
            "w-full h-10 rounded-lg border px-3 flex items-center gap-2 text-sm text-left transition-colors",
            dark
              ? "bg-white/5 border-white/15 text-white hover:bg-white/10"
              : "bg-white border-slate-300 text-slate-900 hover:bg-slate-50",
            className,
          )}
        >
          <CalendarIcon size={15} className={dark ? "text-white/50" : "text-slate-400"} />
          {selected ? (
            <span>{format(selected, "dd.MM.yyyy", { locale: tr })}</span>
          ) : (
            <span className={dark ? "text-white/40" : "text-slate-400"}>{placeholder}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={tr}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => { onChange(toISO(date)); setOpen(false); }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export default TrDatePicker;
