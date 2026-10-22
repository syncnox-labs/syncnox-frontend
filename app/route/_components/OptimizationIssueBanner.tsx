"use client";

import { Alert, Button } from "antd";
import { ChevronUp } from "lucide-react";

export default function OptimizationIssueBanner({ error, onMinimize }: { error: string; onMinimize: () => void }) {
  return (
    <div className="p-1 bg-red-50 shrink-0 border-b border-red-100">
      <Alert
        // message="Optimization Issue"
        description={error}
        type="error"
        showIcon
        action={
          <Button
            type="text"
            size="small"
            icon={<ChevronUp size={14} aria-hidden="true" />}
            aria-expanded={true}
            aria-label="Minimize optimization issue"
            onClick={onMinimize}
          >
            Minimize
          </Button>
        }
      />
    </div>
  );
}
