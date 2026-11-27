import {
  Form,
  Input,
  Modal,
  Select,
  Button,
  Row,
  Col,
  Progress,
  Alert,
  Divider,
  Space,
  DatePicker,
  Flex,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { AlertCircle, Route, Clock, Car, Check, Search, MapPin } from "lucide-react";
import type { Team } from "@/types/team.type";
import OptimizationProgress from "@/components/OptimizationProgress";
import { useDepotStore } from "@/store/depots.store";
import { useTeamStore } from "@/store/team.store";
import { useVehicleStore } from "@/store/vehicle.store";
import {
  useOptimizationStore,
  useOptimizationCleanup,
} from "@/store/optimization.store";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { useJobsStore } from "@/store/jobs.store";
import { useRouteStore } from "@/store/routes.store";
import { bulkUpdateJobDate } from "@/apis/jobs.api";
import DepotForm from "@/app/depot/_components/DepotForm";
import TeamMemberForm from "@/app/team/_components/TeamMemberForm";
import { DepotPayload } from "@/apis/depots.api";

interface CreateRouteModalProps {
  open: boolean;
  setOpen?: (open: boolean) => void;
  onCancel?: () => void;
  selectedJobIds: number[];
  hasMixedDates?: boolean;
}

const hm = (value?: string | null) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ""));
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
};

/** Hours a person works on the plan's weekday, from their weekly schedule (or their default hours). */
const hoursOn = (team: Team, dayKey: string) => {
  const day = team.day_schedules?.[dayKey];
  if (day && !day.enabled) return { working: false, text: `Off on ${dayKey.charAt(0).toUpperCase()}${dayKey.slice(1)}s` };
  const rawStart = day?.start_time ?? team.work_start_time, rawEnd = day?.end_time ?? team.work_end_time;
  const start = hm(rawStart), end = hm(rawEnd);
  const overnight = Boolean(rawStart && rawEnd && String(rawEnd).slice(0, 5) < String(rawStart).slice(0, 5));
  return { working: true, text: start && end ? `${start} – ${end}${overnight ? " (next day)" : ""}` : "Hours not set" };
};

/** A visible checklist instead of a dropdown: who works that day and in what vehicle decides who you pick. */
function DriverPicker({ value = [], onChange, teams, dayKey, dayLabel, onAdd, vehicleName }: {
  value?: number[]; onChange?: (ids: number[]) => void; teams: Team[]; dayKey: string; dayLabel: string; onAdd: () => void;
  vehicleName: (team: Team) => string | null;
}) {
  const [query, setQuery] = useState("");
  const chosen = new Set(value);
  const rows = teams
    .map(team => ({ team, hours: hoursOn(team, dayKey) }))
    .filter(({ team }) => !query.trim() || `${team.name} ${vehicleName(team) ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(b.hours.working) - Number(a.hours.working) || a.team.name.localeCompare(b.team.name));
  const working = teams.filter(team => hoursOn(team, dayKey).working);
  const set = (ids: number[]) => onChange?.([...new Set(ids)]);
  const toggle = (id: number) => set(chosen.has(id) ? value.filter(v => v !== id) : [...value, id]);
  return <div className="border border-[#D5DCD8]">
    <div className="flex flex-wrap items-center gap-2 border-b border-[#E3E8E5] px-3 py-2">
      <span className="flex min-w-[160px] flex-1 items-center gap-1.5 text-[#626E67]">
        <Search size={14} aria-hidden="true" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or vehicle" aria-label="Search team"
          className="w-full border-0 bg-transparent p-0 text-[13px] text-[#12211A] outline-none placeholder:text-[#9AA59F]" />
      </span>
      <button type="button" onClick={() => set(working.map(t => t.id))} disabled={!working.length}
        className="border-0 bg-transparent p-0 text-[12px] text-[#0B5D3B] cursor-pointer hover:underline disabled:cursor-not-allowed disabled:opacity-50">
        Everyone working {dayLabel} ({working.length})
      </button>
      <span aria-hidden="true" className="text-[#C4CCC7]">·</span>
      <button type="button" onClick={() => set(teams.map(t => t.id))}
        className="border-0 bg-transparent p-0 text-[12px] text-[#0B5D3B] cursor-pointer hover:underline">All ({teams.length})</button>
      {value.length > 0 && <><span aria-hidden="true" className="text-[#C4CCC7]">·</span>
        <button type="button" onClick={() => set([])} className="border-0 bg-transparent p-0 text-[12px] text-[#4A5750] cursor-pointer hover:underline">Clear</button></>}
    </div>
    <ul className="m-0 max-h-[248px] list-none overflow-y-auto p-0" aria-label="Team members">
      {rows.map(({ team, hours }) => {
        const on = chosen.has(team.id);
        const inactive = team.status === "inactive";
        return <li key={team.id} className="border-b border-[#E3E8E5] last:border-b-0">
          <label className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${on ? "bg-[#F1F8F4]" : "hover:bg-[#F8FAF9]"}`}>
            <input type="checkbox" className="h-4 w-4 shrink-0 accent-[#003220]" checked={on} onChange={() => toggle(team.id)} />
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[13px] ${hours.working && !inactive ? "text-[#12211A]" : "text-[#626E67]"}`}>{team.name}</span>
              {vehicleName(team) && <span className="flex items-center gap-1 text-[12px] text-[#626E67]">
                <Car size={12} aria-hidden="true" />
                <span className="truncate">{vehicleName(team)}</span>
              </span>}
            </span>
            <span className={`shrink-0 text-right text-[12px] tabular-nums ${hours.working ? "text-[#4A5750]" : "text-[#8A6700]"}`}>
              {hours.text}{inactive && <span className="block text-[#626E67]">Inactive</span>}
            </span>
          </label>
        </li>;
      })}
      {!rows.length && <li className="px-3 py-6 text-center text-[13px] text-[#626E67]">Nobody matches this search.</li>}
    </ul>
    <div className="flex items-center justify-between border-t border-[#E3E8E5] px-3 py-2 text-[12px]">
      <span className="tabular-nums text-[#4A5750]">{value.length} of {teams.length} selected</span>
      <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 border-0 bg-transparent p-0 text-[12px] text-[#0B5D3B] cursor-pointer hover:underline">
        <PlusOutlined className="text-[11px]" /> Add team member
      </button>
    </div>
  </div>;
}

/** Two plain choices instead of a dropdown with one hidden alternative. */
function GoalChoice({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return <div role="radiogroup" aria-label="Plan for" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
    {([
      ["minimum_time", "Least time", "Shorter working days for drivers", Clock],
      ["minimum_distance", "Least distance", "Fewer kilometres driven", Route],
    ] as const).map(([key, title, hint, Icon]) => {
      const on = value === key;
      return <button key={key} type="button" role="radio" aria-checked={on} onClick={() => onChange?.(key)}
        className={`flex items-start gap-2.5 border px-3 py-2.5 text-left cursor-pointer ${on ? "border-[#003220] bg-[#F1F8F4] shadow-[inset_3px_0_0_#003220]" : "border-[#D5DCD8] bg-white hover:border-[#9AA59F]"}`}>
        <Icon size={18} className={`mt-0.5 shrink-0 ${on ? "text-[#003220]" : "text-[#626E67]"}`} aria-hidden="true" />
        <span>
          <span className="block text-[13px] font-medium text-[#12211A]">{title}</span>
          <span className="block text-[12px] text-[#4A5750]">{hint}</span>
        </span>
      </button>;
    })}
  </div>;
}

const CreateRouteModal = ({
  open,
  setOpen,
  onCancel,
  selectedJobIds,
  hasMixedDates = false,
}: CreateRouteModalProps) => {
  const [form] = Form.useForm();
  const router = useRouter();
  const { depots, createDepot, isSaving: isDepotSaving } = useDepotStore();
  const { teams } = useTeamStore();
  const { vehicles } = useVehicleStore();
  const vehicleName = (team: Team) => team.vehicle || (team.vehicle_id ? vehicles.find(v => v.id === team.vehicle_id)?.name ?? null : null);
  const { routes, initializeRoutes, fetchRoutes, setSelectedStatus } = useRouteStore();
  const { jobs, draftJobs, allJobs, allDraftJobs, refreshDraftJobs, selectedDate } = useJobsStore();
  const {
    startOptimization,
    currentOptimization,
    isOptimizing,
    error,
    clearOptimization,
  } = useOptimizationStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick action modal states
  const [showDepotModal, setShowDepotModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);

  useOptimizationCleanup();

  // What was sent, kept for the progress view (the form is not mounted while building).
  const [submitted, setSubmitted] = useState<{ people: number; goal?: string }>({ people: 0 });
  // Real elapsed time instead of rotating made-up messages.
  const building = isOptimizing || isSubmitting;
  // Seconds since the build started, counted by a timer (the clock is read only inside it).
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!building) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => { clearInterval(timer); setElapsed(0); };
  }, [building]);

  // Detect if selected jobs are Worker Shuttle
  const allAvailableJobs = [
    ...(allJobs || []),
    ...(jobs || []),
    ...(draftJobs || []),
    ...(allDraftJobs || []),
  ];
  const selectedJobs = allAvailableJobs.filter((j) => selectedJobIds.includes(j.id));
  const isWorkerShuttle =
    selectedJobs.length > 0
      ? selectedJobs.some(
          (j) =>
            j.template_type === "worker_shuttle" ||
            Boolean(j.worker_shuttle_detail) ||
            ["one_way", "return_only", "round_trip"].includes(j.job_type)
        )
      : allAvailableJobs.some(
          (j) =>
            j.template_type === "worker_shuttle" ||
            Boolean(j.worker_shuttle_detail) ||
            ["one_way", "return_only", "round_trip"].includes(j.job_type)
        );

  const watchedDate = Form.useWatch("scheduled_date", form);
  const watchedTeams: number[] = Form.useWatch("team_ids", form) || [];
  const firstSelectedDate = selectedJobs.find(j => j.scheduled_date)?.scheduled_date;
  const planDay = hasMixedDates && watchedDate ? dayjs(watchedDate)
    : dayjs(firstSelectedDate || selectedDate || undefined);
  const dayKey = planDay.format("dddd").toLowerCase();

  // Prefill a name people can recognise in a list: the plan's day, e.g. "Mon, Nov 30 plan".
  // The old "route - {count + 1}" counted only the loaded list, so it could repeat an existing name.
  const planDayLabel = planDay.isValid() ? planDay.format("ddd, MMM D") : dayjs().format("ddd, MMM D");
  useEffect(() => {
    if (open) {
      initializeRoutes();
      form.setFieldsValue({
        optimization_logic: "minimum_time",
        ...(hasMixedDates ? { scheduled_date: dayjs() } : {}),
      });
    }
  }, [open, initializeRoutes, form, hasMixedDates]);
  // The name follows the day until the person types their own.
  useEffect(() => {
    if (!open || form.isFieldTouched("route_name")) return;
    const taken = new Set(routes.map(route => String(route.name ?? "").trim().toLowerCase()));
    const base = `${planDayLabel} plan`;
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${base} (${n})`;
    form.setFieldsValue({ route_name: name });
  }, [open, routes, planDayLabel, form]);

  // Get status message based on optimization status
  const getStatusMessage = () => {
    if (!currentOptimization) return "";

    switch (currentOptimization.status) {
      case "queued":
        return "Preparing route optimization...";
      case "processing":
        return "Generating optimal routes for your team...";
      case "completed":
      case "success":
        return "Optimization completed! Redirecting...";
      case "failed":
        return "Optimization failed";
      default:
        return "Processing...";
    }
  };

  // Handle redirect when optimization completes
  useEffect(() => {
    if (!open) return;

    if (
      currentOptimization &&
      (currentOptimization.status === "completed" ||
        currentOptimization.status === "success")
    ) {
      // Short delay to show completion message
      const timeout = setTimeout(() => {
        router.push(`/route/${currentOptimization.id}`);
        if (setOpen) setOpen(false);
        if (onCancel) onCancel();
        // Reset status to scheduled and fetch corresponding routes
        setSelectedStatus("scheduled");
        // Use refreshDraftJobs to specifically update the draft jobs store
        refreshDraftJobs();
        form.resetFields();
        // Clear the optimization state to prevent auto-redirect on next modal open
        clearOptimization();
      }, 1400);

      return () => clearTimeout(timeout);
    }
  }, [
    open,
    currentOptimization,
    router,
    setOpen,
    onCancel,
    form,
    fetchRoutes,
    refreshDraftJobs,
    setSelectedStatus,
    clearOptimization,
  ]);

  const handleFinish = async (values: any) => {
    setSubmitted({ people: (values.team_ids || []).length, goal: values.optimization_logic });
    setIsSubmitting(true);

    const firstJobDate =
      selectedJobs.length > 0 && selectedJobs[0]?.scheduled_date
        ? dayjs(selectedJobs[0].scheduled_date).format("YYYY-MM-DD")
        : null;

    const scheduledDate = values.scheduled_date
      ? dayjs(values.scheduled_date).format("YYYY-MM-DD")
      : (firstJobDate || (selectedDate ? dayjs(selectedDate).format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD")));

    try {
      // If coming from the All tab, update all selected jobs' dates first
      if (hasMixedDates) {
        await bulkUpdateJobDate(selectedJobIds, scheduledDate);
      }

      const depotId = isWorkerShuttle ? undefined : (values.depot_id || (depots && depots.length > 0 ? depots[0].id : undefined));

      await startOptimization({
        route_name: values.route_name,
        depot_id: depotId,
        job_ids: selectedJobIds,
        team_member_ids: values.team_ids,
        scheduled_date: scheduledDate,
        optimization_goal: values.optimization_logic,
      });                                 
    } catch (err) {
      console.error("Optimization error:", err);
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (
      (!isOptimizing && !isSubmitting) ||
      currentOptimization?.status === "failed" ||
      error
    ) {
      if (setOpen) setOpen(false);
      if (onCancel) onCancel();
      form.resetFields();
      setIsSubmitting(false);
      clearOptimization();
    }
  };

  const handleRetry = () => {
    clearOptimization();
    setIsSubmitting(false);
  };

  const isCompleted =
    currentOptimization?.status === "completed" || currentOptimization?.status === "success";
  const isFailed = currentOptimization?.status === "failed" || Boolean(error);

  return (
    <Modal
      centered
      footer={null}
      title={<div className="lang">
        <div className="text-[16px] font-medium text-[#12211A]">Create a route plan</div>
        {!(isSubmitting || isOptimizing) && !isFailed && <div className="mt-0.5 text-[12px] font-normal text-[#4A5750]">
          {selectedJobIds.length > 0 ? `${selectedJobIds.length} ${selectedJobIds.length === 1 ? "job" : "jobs"} · ` : ""}{planDay.format("dddd, MMM D, YYYY")}
        </div>}
      </div>}
      open={open}
      onCancel={handleCancel}
      width={640}
      rootClassName="lang"
      closable={!(isSubmitting || isOptimizing) || isFailed}
      maskClosable={false}
      className="create-route-modal"
      styles={{
        body: { borderRadius: 0 },
        mask: { backdropFilter: "blur(4px)" },
      }}
    >
      {isFailed ? (
        <div className="flex flex-col gap-4 pt-2">
          <div className="flex items-start gap-3 border-l-2 border-[#C9372C] bg-[#FDECEA] px-3 py-3">
            <AlertCircle size={20} className="mt-0.5 shrink-0 text-[#C9372C]" aria-hidden="true" />
            <div>
              <h3 className="m-0 text-[14px] font-medium text-[#12211A]">The routes could not be built</h3>
              <p className="m-0 mt-1 text-[13px] text-[#4A5750]">{error || "No workable plan was found for these jobs with the people chosen."}</p>
            </div>
          </div>
          <div className="text-[13px] text-[#12211A]">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-[#626E67]">Things to try</div>
            <ul className="m-0 list-disc space-y-1 pl-5 text-[#4A5750]">
              <li>Add more people, so the stops can be shared out.</li>
              <li>Check seat numbers and working hours in Settings.</li>
            </ul>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#E3E8E5] pt-3">
            <Button onClick={handleCancel}>Cancel</Button>
            <Button type="primary" onClick={handleRetry}>Change and try again</Button>
          </div>
        </div>
      ) : isSubmitting || isOptimizing ? (
        <div className="pt-2">
          <OptimizationProgress
            title="Building the routes"
            context={`${selectedJobIds.length || "All"} ${selectedJobIds.length === 1 ? "job" : "jobs"} · ${submitted.people} ${submitted.people === 1 ? "person" : "people"} · ${planDay.format("ddd, MMM D")}`}
            accepted={Boolean(currentOptimization)}
            queued={currentOptimization?.status === "queued" && elapsed > 8}
            done={isCompleted}
            activities={[
              `Matching ${selectedJobIds.length || "the"} jobs to ${submitted.people} ${submitted.people === 1 ? "person" : "people"}`,
              `Checking each person's working hours on ${planDay.format("dddd")}`,
              "Fitting passengers into the seats each vehicle has",
              isWorkerShuttle ? "Making sure everyone reaches work before their shift starts" : "Keeping each stop inside its time window",
              submitted.goal === "minimum_distance" ? "Ordering stops to drive the fewest kilometres" : "Ordering stops to keep working days short",
            ]}
            note="This window moves you to the new plan as soon as it is ready. Large plans can take a few minutes."
          />
        </div>
      ) : (
        <>
          {error && (
            <Alert
              className="mb-4"
              message="Error"
              description={error}
              type="error"
              showIcon
            />
          )}
          <Form
            form={form}
            layout="vertical"
            onFinish={handleFinish}
            requiredMark={false}
            initialValues={{
              optimization_logic: "minimum_time",
              ...(hasMixedDates ? { scheduled_date: dayjs() } : {}),
            }}
          >
            <div className="flex flex-wrap gap-x-4">
              <Form.Item name="route_name" label="Name" className="min-w-[220px] flex-1" rules={[{ required: true, message: "Give the plan a name" }]}>
                <Input placeholder="For example, Monday morning" />
              </Form.Item>
              {hasMixedDates && (
                <Form.Item name="scheduled_date" label="Date" className="w-[200px]" rules={[{ required: true, message: "Choose a date" }]}
                  extra="The selected jobs move to this date">
                  <DatePicker style={{ width: "100%" }} format="ddd, MMM D, YYYY" />
                </Form.Item>
              )}
            </div>

            <Form.Item name="optimization_logic" label="Plan for" rules={[{ required: true, message: "Choose what to optimize" }]}>
              <GoalChoice />
            </Form.Item>

            {!isWorkerShuttle && (
              <Form.Item name="depot_id" label="Start and end at" rules={[{ required: true, message: "Choose a depot" }]}>
                <Select placeholder="Choose a depot" suffixIcon={<MapPin size={14} />}
                  popupRender={(menu) => (
                    <>
                      {menu}
                      <Divider style={{ margin: "8px 0" }} />
                      <Space style={{ padding: "0 8px 8px" }}>
                        <Button size="small" type="text" icon={<PlusOutlined />}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowDepotModal(true); }}>
                          Add depot
                        </Button>
                      </Space>
                    </>
                  )}>
                  {depots.map((depot) => <Select.Option key={depot.id} value={depot.id}>{depot.name}</Select.Option>)}
                </Select>
              </Form.Item>
            )}

            <Form.Item name="team_ids" label={`Who can drive (${planDay.format("dddd")})`}
              rules={[{ required: true, message: "Choose at least one person" }]}>
              <DriverPicker teams={teams} vehicleName={vehicleName} dayKey={dayKey} dayLabel={planDay.format("ddd")} onAdd={() => setShowTeamModal(true)} />
            </Form.Item>

            <div className="flex flex-col gap-3 border-t border-[#E3E8E5] pt-3">
              <span className="text-[12px] text-[#4A5750]">
                The optimizer only uses the people you pick, and may leave some of them without trips.
              </span>
              <div className="flex justify-end gap-2">
                <Button onClick={handleCancel}>Cancel</Button>
                <Button type="primary" htmlType="submit" loading={isSubmitting || isOptimizing} disabled={isSubmitting || isOptimizing}>
                  {watchedTeams.length ? `Build routes with ${watchedTeams.length} ${watchedTeams.length === 1 ? "person" : "people"}` : "Build routes"}
                </Button>
              </div>
            </div>
          </Form>
        </>
      )}

      {/* Quick Action: Add Depot Modal */}
      <Modal
        title="Add New Depot"
        open={showDepotModal}
        onCancel={() => setShowDepotModal(false)}
        footer={null}
        width={700}
        centered
        destroyOnHidden
        styles={{ body: { overflow: "hidden", height: "450px" } }}
      >
        <DepotForm
          onSubmit={async (values: DepotPayload) => {
            const success = await createDepot(values);
            if (success) {
              setShowDepotModal(false);
              // Get the newly created depot (last one in list)
              const newDepot = useDepotStore.getState().depots.slice(-1)[0];
              if (newDepot) {
                form.setFieldValue("depot_id", newDepot.id);
              }
            }
            return success;
          }}
          isLoading={isDepotSaving}
          onCancel={() => setShowDepotModal(false)}
        />
      </Modal>

      {/* Quick Action: Add Team Member Modal */}
      <Modal
        title="Add New Team Member"
        open={showTeamModal}
        onCancel={() => setShowTeamModal(false)}
        footer={null}
        width={900}
        centered
        destroyOnHidden
        styles={{ body: { overflow: "hidden", height: "80vh" } }}
      >
        <div style={{ height: "100%" }}>
          <TeamMemberForm
            onSubmit={async () => {
              setShowTeamModal(false);
              // Get the newly created team member (first one in list, newest)
              const newTeam = useTeamStore.getState().teams[0];
              if (newTeam) {
                const currentTeamIds = form.getFieldValue("team_ids") || [];
                form.setFieldValue("team_ids", [...currentTeamIds, newTeam.id]);
              }
            }}
          />
        </div>
      </Modal>
    </Modal>
  );
};

export default CreateRouteModal;
