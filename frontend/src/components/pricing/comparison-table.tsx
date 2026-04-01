"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { pricingEvents } from "@/lib/analytics";

interface ComparisonRow {
  feature: string;
  tooltip?: string;
  values: Record<string, string | boolean>;
}

interface ComparisonTableProps {
  title: string;
  plans: string[];
  rows: ComparisonRow[];
  tableType: "candidate" | "employer";
}

export function ComparisonTable({ title, plans, rows, tableType }: ComparisonTableProps) {
  const [expanded, setExpanded] = useState(false);

  const visibleRows = expanded ? rows : rows.slice(0, 6);

  return (
    <div className="w-full" data-testid={`comparison-table-${tableType}`}>
      <h3 className="text-xl font-bold text-gray-900 mb-4 text-center">{title}</h3>

      {/* Mobile: stacked cards */}
      <div className="md:hidden space-y-4">
        {plans.map((plan) => (
          <div key={plan} className="bg-white rounded-xl border border-gray-200 p-4">
            <h4 className="font-semibold text-gray-900 mb-3">{plan}</h4>
            <ul className="space-y-2">
              {visibleRows.map((row) => {
                const val = row.values[plan];
                return (
                  <li key={row.feature} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{row.feature}</span>
                    <CellValue value={val} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left text-sm font-medium text-gray-500 py-3 px-4 w-[40%]">Feature</th>
              {plans.map((plan) => (
                <th key={plan} className="text-center text-sm font-semibold text-gray-900 py-3 px-4">
                  {plan}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <tr
                key={row.feature}
                className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-gray-50/50" : ""}`}
              >
                <td className="text-sm text-gray-700 py-3 px-4">
                  {row.feature}
                  {row.tooltip && (
                    <span className="ml-1 text-gray-400 cursor-help" title={row.tooltip}>
                      <svg className="inline w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827m0 4.5h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </span>
                  )}
                </td>
                {plans.map((plan) => (
                  <td key={plan} className="text-center py-3 px-4">
                    <CellValue value={row.values[plan]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 6 && (
        <div className="text-center mt-4">
          <button
            onClick={() => {
              setExpanded(!expanded);
              if (!expanded) pricingEvents.comparisonExpand(tableType);
            }}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            {expanded ? "Show less" : `Show all ${rows.length} features`}
            <svg
              className={`inline w-4 h-4 ml-1 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function CellValue({ value }: { value: string | boolean | undefined }) {
  if (value === true) {
    return (
      <svg className="mx-auto w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    );
  }
  if (value === false || value === undefined) {
    return (
      <svg className="mx-auto w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    );
  }
  // String value — could be "5/mo", "Unlimited", etc.
  return <Badge variant={value === "Unlimited" ? "success" : "default"}>{value}</Badge>;
}
