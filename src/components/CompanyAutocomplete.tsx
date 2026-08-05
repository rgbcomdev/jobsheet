"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { filterCompanyCandidates } from "@/lib/chosung";

type Props = {
  value: string;
  companyNames: string[];
  onChange: (company: string) => void;
  onPick: (company: string) => void;
};

export function CompanyAutocomplete({
  value,
  companyNames,
  onChange,
  onPick,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const candidates = useMemo(
    () => filterCompanyCandidates(companyNames, value, 6),
    [companyNames, value]
  );

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="company-ac-wrap" ref={wrapRef}>
      <input
        className="company"
        placeholder="업체명"
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (value.trim()) setOpen(true);
        }}
      />
      {open && candidates.length > 0 && (
        <div className="company-autocomplete">
          {candidates.map((name) => (
            <div
              key={name}
              className="company-autocomplete-item"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(name);
                setOpen(false);
              }}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
