"use client";
import React, { useState, useMemo } from "react";
import { Modal, Avatar, Input, Button, message, Divider } from "antd";
import {
  UserOutlined,
  SearchOutlined,
  SwapOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { swapRouteDriver } from "@/apis/routes.api";
import { useOptimizationStore } from "@/store/optimization.store";
import type { Team } from "@/types/team.type";
import { getRouteColor } from "@/utils/timeline.utils";

interface SwapDriverDrawerProps {
  open: boolean;
  onClose: () => void;
  optimizationId: number;
  routeIndex: number;
  currentDriverId: number;
  currentDriverName: string;
  /** All drivers in the system */
  allDrivers: Team[];
  /** Drivers already used in the current optimization */
  optimizationDriverIds: number[];
  /** Called after successful swap — parent awaits the WebSocket result */
  onSuccess: () => void;
}

const SwapDriverDrawer: React.FC<SwapDriverDrawerProps> = ({
  open,
  onClose,
  optimizationId,
  routeIndex,
  currentDriverId,
  currentDriverName,
  allDrivers,
  optimizationDriverIds,
  onSuccess,
}) => {
  const [search, setSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);

  const { inOptDrivers, otherDrivers } = useMemo(() => {
    const q = search.toLowerCase();
    const matchesSearch = (driver: Team) =>
      !q ||
      driver.name.toLowerCase().includes(q) ||
      driver.email?.toLowerCase().includes(q);

    const inOpt: Team[] = [];
    const other: Team[] = [];

    allDrivers.forEach((d) => {
      if (d.id === currentDriverId) return;
      if (!matchesSearch(d)) return;
      if (optimizationDriverIds.includes(d.id)) {
        inOpt.push(d);
      } else {
        other.push(d);
      }
    });

    return { inOptDrivers: inOpt, otherDrivers: other };
  }, [allDrivers, optimizationDriverIds, currentDriverId, search]);

  const handleSwap = async () => {
    if (!selectedDriverId) return;
    setIsSubmitting(true);
    try {
      useOptimizationStore.getState().setOptimizationResult("processing");
      const res = await swapRouteDriver(
        optimizationId,
        routeIndex,
        selectedDriverId,
      );
      if (res.success) {
        message.success(res.message);
        onSuccess();
        handleClose();
      } else {
        message.error("Failed to swap driver");
      }
    } catch (error: any) {
      await useOptimizationStore.getState().fetchOptimization(optimizationId).catch(() => {});
      message.error(error?.response?.data?.detail || "Failed to swap driver");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSearch("");
    setSelectedDriverId(null);
    setIsSubmitting(false);
    onClose();
  };

  const DriverRow = ({
    driver,
    isCurrent = false,
  }: {
    driver: Team;
    isCurrent?: boolean;
  }) => {
    const isSelected = selectedDriverId === driver.id;
    return (
      <div
        onClick={() => {
          if (isCurrent) return;
          setSelectedDriverId(isSelected ? null : driver.id);
        }}
        className={`
          px-4 py-3 flex items-center gap-3 rounded-lg transition-all duration-150
          ${isCurrent ? "bg-gray-50 opacity-60 cursor-default" : "cursor-pointer"}
          ${!isCurrent && isSelected ? "bg-[#003220]/5 border-2 border-[#003220]" : "border-2 border-transparent"}
          ${!isCurrent && !isSelected ? "hover:bg-gray-50" : ""}
        `}
      >
        <Avatar
          icon={<UserOutlined />}
          style={{
            backgroundColor: isCurrent
              ? "#999"
              : isSelected
                ? "#003220"
                : getRouteColor(driver.id % 10),
          }}
          size={36}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`font-medium truncate ${isCurrent ? "text-gray-500" : "text-gray-800"}`}
            >
              {driver.name}
            </span>
            {isCurrent && (
              <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">
                Current
              </span>
            )}
          </div>
          {(driver.work_start_time || driver.work_end_time) && (
            <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
              <ClockCircleOutlined />
              <span>
                {driver.work_start_time || "—"} – {driver.work_end_time || "—"}
              </span>
            </div>
          )}
        </div>
        {isSelected && (
          <CheckCircleFilled className="text-[#003220] text-lg shrink-0" />
        )}
      </div>
    );
  };

  const currentDriver = allDrivers.find((d) => d.id === currentDriverId);

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={null}
      footer={null}
      width={420}
      centered
      destroyOnClose
      styles={{ body: { padding: 0 } }}
    >
      {/* Header */}
      <div className="px-6 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <SwapOutlined className="text-[#003220]" />
          <h3 className="text-lg font-semibold text-gray-900 m-0">
            Swap Route with Driver
          </h3>
        </div>
        <p className="text-sm text-gray-500 mt-1 mb-3">
          Route will be re-optimized for the new driver&apos;s schedule
        </p>
        <Input
          prefix={<SearchOutlined className="text-gray-400" />}
          placeholder="Search drivers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          className="rounded-lg"
        />
      </div>

      {/* Driver List */}
      <div
        className="px-3 overflow-y-auto custom-scrollbar"
        style={{ maxHeight: 380, minHeight: 150 }}
      >
        {currentDriver && (
          <>
            <DriverRow driver={currentDriver} isCurrent />
            <Divider className="my-2" style={{ fontSize: 12 }}>
              Reassign to another Driver
            </Divider>
          </>
        )}
        {inOptDrivers.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1 text-xs text-gray-400 font-medium uppercase tracking-wide">
              In this plan
            </div>
            {inOptDrivers.map((d) => (
              <DriverRow key={d.id} driver={d} />
            ))}
          </div>
        )}
        {otherDrivers.length > 0 && (
          <div className="mb-2">
            <div className="px-3 py-1 text-xs text-gray-400 font-medium uppercase tracking-wide">
              Other drivers
            </div>
            {otherDrivers.map((d) => (
              <DriverRow key={d.id} driver={d} />
            ))}
          </div>
        )}
        {inOptDrivers.length === 0 && otherDrivers.length === 0 && (
          <div className="py-8 text-center text-gray-400 text-sm">
            No other drivers found
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
        <Button onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          type="primary"
          icon={isSubmitting ? undefined : <SwapOutlined />}
          loading={isSubmitting}
          disabled={!selectedDriverId}
          onClick={handleSwap}
        >
          Swap & Re-optimize
        </Button>
      </div>
    </Modal>
  );
};

export default SwapDriverDrawer;
