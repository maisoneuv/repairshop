import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchDashboard } from "../api/dashboard";
import { getStatusClasses } from "../utils/statusColors";

/* ─── helper: relative time ─── */
function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(val) {
  if (!val) return "—";
  return new Date(val).toLocaleDateString();
}

/* ─── small presentational helpers ─── */

function KpiCard({ label, value, accent = "blue", icon }) {
  const textColor = {
    blue: "text-blue-600",
    rose: "text-rose-600",
    amber: "text-amber-600",
    emerald: "text-emerald-600",
  };
  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 md:p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider">
          {label}
        </p>
        {icon && (
          <span className={`text-lg ${textColor[accent]}`}>{icon}</span>
        )}
      </div>
      <p className={`text-2xl md:text-3xl font-bold mt-1 ${textColor[accent]}`}>
        {value}
      </p>
    </div>
  );
}

function SectionCard({ title, children, className = "" }) {
  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 ${className}`}>
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wider">
          {title}
        </h2>
      </div>
      <div className="p-4 md:p-6">{children}</div>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <p className="py-6 text-center text-sm text-gray-400">{message}</p>
  );
}

/* ─── Dashboard Sections ─── */

function StatusPipeline({ pipeline }) {
  if (!pipeline || pipeline.length === 0) {
    return (
      <SectionCard title="Status Pipeline">
        <EmptyState message="No work items yet" />
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Status Pipeline">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {pipeline.map((s) => (
          <Link
            key={s.status}
            to={`/work-items?status=${encodeURIComponent(s.status)}`}
            className={`flex-shrink-0 px-4 py-2.5 rounded-lg border text-sm font-medium hover:opacity-80 transition-opacity ${getStatusClasses(s.color)}`}
          >
            <span className="font-bold mr-1.5">{s.count}</span>
            {s.name}
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}

function NeedsAttentionCard({ data, myTasks }) {
  const [tab, setTab] = useState("overdue");

  const tabs = [
    { id: "overdue", label: `Overdue (${data.overdue.length})`, activeClass: "bg-rose-50 text-rose-700 border-rose-200" },
    { id: "unassigned", label: `Unassigned (${data.unassigned.length})`, activeClass: "bg-amber-50 text-amber-700 border-amber-200" },
    { id: "overdue_tasks", label: `Overdue Tasks (${data.overdue_tasks?.length ?? 0})`, activeClass: "bg-orange-50 text-orange-700 border-orange-200" },
    { id: "my_tasks", label: `My Tasks (${myTasks?.length ?? 0})`, activeClass: "bg-blue-50 text-blue-700 border-blue-200" },
  ];

  const items = (tab === "overdue" || tab === "unassigned") ? (tab === "overdue" ? data.overdue : data.unassigned) : null;
  const overdueTasks = tab === "overdue_tasks" ? (data.overdue_tasks ?? []) : null;
  const tasks = tab === "my_tasks" ? (myTasks ?? []) : null;

  return (
    <SectionCard title="Needs Attention">
      <div className="flex gap-2 mb-4" role="tablist" aria-label="Attention categories">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              tab === t.id ? t.activeClass : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {overdueTasks !== null ? (
        overdueTasks.length === 0 ? (
          <EmptyState message="No overdue tasks" />
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {overdueTasks.map((task) => {
              const assignee = [task.assigned_employee__user__first_name, task.assigned_employee__user__last_name]
                .filter(Boolean).join(" ");
              return (
                <li key={task.id}>
                  <Link
                    to={`/tasks/${task.id}`}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-800 truncate">
                        {task.summary || `Task #${task.id}`}
                      </span>
                      {task["work_item__reference_id"] && (
                        <span className="text-xs text-blue-600 ml-2">{task["work_item__reference_id"]}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {assignee && (
                        <span className="text-xs text-gray-500">{assignee}</span>
                      )}
                      {task.due_date && (
                        <span className="text-xs text-rose-500 font-medium">
                          Due {formatDate(task.due_date)}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      ) : tasks !== null ? (
        tasks.length === 0 ? (
          <EmptyState message="No tasks assigned to you" />
        ) : (
          <ul className="space-y-2 max-h-64 overflow-y-auto">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link
                  to={`/tasks/${task.id}`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-800 truncate">
                      {task.summary || `Task #${task.id}`}
                    </span>
                    {task.work_item_reference_id && (
                      <span className="text-xs text-blue-600 ml-2">{task.work_item_reference_id}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                      {task.status}
                    </span>
                    {task.due_date && (
                      <span className={`text-xs ${new Date(task.due_date) < new Date() ? "text-rose-500 font-medium" : "text-gray-400"}`}>
                        {formatDate(task.due_date)}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : items.length === 0 ? (
        <EmptyState message={`No ${tab} items`} />
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {items.map((item) => {
            const customerName = [item.customer__first_name, item.customer__last_name]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={item.id}>
                <Link
                  to={`/work-items/${item.id}`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-blue-600">
                      {item.reference_id}
                    </span>
                    {customerName && (
                      <span className="text-sm text-gray-500 ml-2">{customerName}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 flex-shrink-0 ml-2">
                    {tab === "overdue" && item.due_date && (
                      <span className="text-rose-500 font-medium">
                        Due {formatDate(item.due_date)}
                      </span>
                    )}
                    {tab === "unassigned" && item.created_date && (
                      <span>{timeAgo(item.created_date)}</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function RecentNotesCard({ notes }) {
  if (!notes || notes.length === 0) {
    return (
      <SectionCard title="Recent Notes">
        <EmptyState message="No recent notes" />
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Recent Notes">
      <ul className="space-y-3 max-h-64 overflow-y-auto">
        {notes.map((note) => (
          <li key={note.id} className="py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                {note.author_name && (
                  <span className="text-xs font-medium text-gray-700">
                    {note.author_name}
                  </span>
                )}
                {note.work_item_reference_id && (
                  <Link
                    to={`/work-items/${note.work_item_id}`}
                    className="text-xs text-blue-600 hover:underline flex-shrink-0"
                  >
                    {note.work_item_reference_id}
                  </Link>
                )}
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                {timeAgo(note.created_at)}
              </span>
            </div>
            <p className="text-sm text-gray-600 line-clamp-2">{note.content}</p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function FinancialSummaryCard({ data }) {
  return (
    <SectionCard title="Financial Summary">
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Today", value: data.revenue_today },
          { label: "This Week", value: data.revenue_week },
          { label: "This Month", value: data.revenue_month },
        ].map((r) => (
          <div key={r.label} className="text-center p-3 rounded-lg bg-gray-50 border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{r.label}</p>
            <p className="text-lg font-bold text-gray-800 mt-1">
              {parseFloat(r.value).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN
            </p>
          </div>
        ))}
      </div>

      {data.register_balances.length > 0 ? (
        <>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Cash Registers
          </h3>
          <ul className="space-y-1.5">
            {data.register_balances.map((reg) => (
              <li key={reg.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-50">
                <div>
                  <span className="text-sm font-medium text-gray-700">{reg.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{reg.shop_name}</span>
                </div>
                <span className="text-sm font-semibold text-gray-800">
                  {parseFloat(reg.current_balance).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} PLN
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState message="No active cash registers" />
      )}
    </SectionCard>
  );
}

function TasksOverdueByAssigneeCard({ data }) {
  if (!data || data.length === 0) {
    return (
      <SectionCard title="Tasks Overdue by Assignee">
        <EmptyState message="No overdue tasks" />
      </SectionCard>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.overdue_count), 1);

  return (
    <SectionCard title="Tasks Overdue by Assignee">
      <ul className="space-y-3">
        {data.map((assignee) => (
          <li key={assignee.employee_id}>
            <Link
              to={`/tasks/all?assigned_employee=${assignee.employee_id}`}
              className="block hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{assignee.name}</span>
                <span className="text-sm font-semibold text-rose-600">
                  {assignee.overdue_count} overdue
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-rose-400 h-2 rounded-full transition-all"
                  style={{ width: `${(assignee.overdue_count / maxCount) * 100}%` }}
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function TechnicianWorkloadCard({ workload }) {
  if (!workload || workload.length === 0) {
    return (
      <SectionCard title="Technician Workload">
        <EmptyState message="No active technicians" />
      </SectionCard>
    );
  }

  const maxCount = Math.max(...workload.map((w) => w.open_count), 1);

  return (
    <SectionCard title="Technician Workload">
      <ul className="space-y-3">
        {workload.map((tech) => (
          <li key={tech.technician_id}>
            <Link
              to={`/tasks/all?assigned_employee=${tech.technician_id}`}
              className="block hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{tech.name}</span>
                <span className="text-sm font-semibold text-gray-800">
                  {tech.open_count} open
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${(tech.open_count / maxCount) * 100}%` }}
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/* ─── Loading skeleton ─── */
function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-gray-200 rounded-xl h-24" />
        ))}
      </div>
      <div className="bg-gray-200 rounded-xl h-20" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-200 rounded-xl h-64" />
        <div className="bg-gray-200 rounded-xl h-64" />
      </div>
      <div className="bg-gray-200 rounded-xl h-48" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-200 rounded-xl h-48" />
        <div className="bg-gray-200 rounded-xl h-48" />
      </div>
    </div>
  );
}

/* ─── Main Dashboard Page ─── */
export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await fetchDashboard();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Open Items" value={data.kpis.total_open} accent="blue" />
        <KpiCard label="Overdue" value={data.kpis.overdue} accent="rose" />
        <KpiCard label="Unassigned" value={data.kpis.unassigned} accent="amber" />
        <KpiCard label="Ready for Pickup" value={data.kpis.ready_for_pickup} accent="emerald" />
      </div>

      {/* Status Pipeline */}
      <StatusPipeline pipeline={data.pipeline} />

      {/* Needs Attention + Recent Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <NeedsAttentionCard data={data.needs_attention} myTasks={data.my_tasks} />
        <RecentNotesCard notes={data.recent_notes} />
      </div>

      {/* Tasks Overdue by Assignee */}
      <TasksOverdueByAssigneeCard data={data.tasks_overdue_by_assignee} />

      {/* Financial Summary + Technician Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FinancialSummaryCard data={data.financial} />
        <TechnicianWorkloadCard workload={data.technician_workload} />
      </div>

    </div>
  );
}
