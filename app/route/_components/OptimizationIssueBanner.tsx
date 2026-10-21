"use client";

import { useState } from "react";
import { Alert, Button } from "antd";
import { ChevronDown, ChevronUp, CircleX } from "lucide-react";

export default function OptimizationIssueBanner({ error }: { error: string }) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        className="flex h-7 w-full shrink-0 items-center justify-between border-b border-red-100 bg-red-50 px-4 py-0 text-left text-xs leading-none text-red-800 hover:bg-red-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-600"
        aria-expanded={false}
        aria-label="Show optimization issue details"
        onClick={() => setCollapsed(false)}
      >
        <span className="inline-flex items-center gap-2 font-medium">
          <CircleX size={14} className="text-red-500" aria-hidden="true" />
          Optimization Issue
        </span>
        <span className="inline-flex items-center gap-1">
          Show details
          <ChevronDown size={14} aria-hidden="true" />
        </span>
      </button>
    );
  }

  return (
    <div className="p-3 bg-red-50 shrink-0 border-b border-red-100">
      <Alert
        message="Optimization Issue"
        description={error}
        type="error"
        showIcon
        action={
          <Button
            type="text"
            size="small"
            icon={<ChevronUp size={16} aria-hidden="true" />}
            aria-expanded={true}
            aria-label="Minimize optimization issue"
            onClick={() => setCollapsed(true)}
          >
            Minimize
          </Button>
        }
      />
    </div>
  );
}
