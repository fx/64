import { C64Box } from "../ui/c64-box.tsx";
import { C64Button } from "../ui/c64-button.tsx";
import { useExecutions, useCancelExecution } from "../../hooks/use-macros.ts";
import type { MacroExecutionStatus } from "@shared/types.ts";

const STATUS_LABELS: Record<MacroExecutionStatus, string> = {
  running: "RUNNING",
  completed: "COMPLETE",
  failed: "FAILED",
  cancelled: "CANCELLED",
};

const STATUS_COLORS: Record<MacroExecutionStatus, string> = {
  running: "text-c64-13-light-green",
  completed: "text-c64-5-green",
  failed: "text-c64-2-red",
  cancelled: "text-c64-8-orange",
};

function ProgressBar({ current, total }: { current: number; total: number }) {
  const barWidth = 20;
  const filled = total > 0 ? Math.round((current / total) * barWidth) : 0;
  const empty = barWidth - filled;

  return (
    <span>
      {"["}
      <span className="text-c64-5-green">{"\u2588".repeat(filled)}</span>
      <span className="text-c64-11-dark-grey">{"\u2592".repeat(empty)}</span>
      {"]"} {current}/{total}
    </span>
  );
}

interface ExecutionProgressProps {
  executionId?: string;
  onClose?: () => void;
}

export function ExecutionProgress({ executionId, onClose }: ExecutionProgressProps) {
  const { data: executions } = useExecutions();
  const cancelMutation = useCancelExecution();

  const activeExecutions = executionId
    ? executions?.filter((e) => e.id === executionId)
    : executions?.filter((e) => e.status === "running");

  const recentExecutions = executionId
    ? []
    : executions
        ?.filter((e) => e.status !== "running")
        .sort((a, b) => (b.startedAt > a.startedAt ? 1 : -1))
        .slice(0, 5) ?? [];

  if (!activeExecutions?.length && !recentExecutions.length) {
    return null;
  }

  return (
    <C64Box title="MACRO EXECUTION">
      <div className="flex flex-col gap-[0.5em]">
        {onClose && (
          <div className="flex justify-end">
            <C64Button onClick={onClose}>X CLOSE</C64Button>
          </div>
        )}

        {activeExecutions?.map((exec) => (
          <div key={exec.id} className="flex flex-col gap-[0.25em]">
            <div className="flex justify-between items-center">
              <span className={STATUS_COLORS[exec.status]}>
                {"\u2588"} {STATUS_LABELS[exec.status]}
              </span>
              {exec.status === "running" && (
                <C64Button
                  variant="danger"
                  onClick={() => cancelMutation.mutate(exec.id)}
                  disabled={cancelMutation.isPending}
                >
                  CANCEL
                </C64Button>
              )}
            </div>
            <div>
              <ProgressBar current={exec.currentStep} total={exec.totalSteps} />
            </div>
            {exec.status === "running" && (
              <p>
                <span className="animate-c64-cursor">{"\u2588"}</span>{" "}
                STEP {exec.currentStep + 1} OF {exec.totalSteps}
              </p>
            )}
            {exec.error && (
              <p className="text-c64-2-red">ERROR: {exec.error.toUpperCase()}</p>
            )}
          </div>
        ))}

        {recentExecutions.length > 0 && (
          <div>
            <p className="bg-c64-14-light-blue text-c64-6-blue px-[1ch]">
              RECENT
            </p>
            {recentExecutions.map((exec) => (
              <div key={exec.id} className="flex justify-between py-[0.25em]">
                <span className={STATUS_COLORS[exec.status]}>
                  {STATUS_LABELS[exec.status]}
                </span>
                <ProgressBar current={exec.currentStep} total={exec.totalSteps} />
              </div>
            ))}
          </div>
        )}
      </div>
    </C64Box>
  );
}
