import { Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { DriverSummary } from "@/utils/exportPreview.utils";
import type { ShuttleManifestLocation, ShuttleManifestRow } from "@/utils/shuttleManifest.utils";
import styles from "./RouteExportPreview.module.css";

interface Props {
  summary: DriverSummary;
  locations: ShuttleManifestLocation[];
  sourcePlan?: string | null;
  pending?: boolean;
}

const columns = (visit: ShuttleManifestLocation): ColumnsType<ShuttleManifestRow> => [
  { title: "No.", width: "4%", align: "center", render: (_, _row, index) => index + 1 },
  { title: "Candidate / contact", width: "18%", render: (_, row) => (
    <div>
      <strong>{row.candidateName}</strong>
      {row.candidateId && <div className={styles.secondary}>Candidate ID: {row.candidateId}</div>}
      {row.candidatePhone && <div className={styles.phone}>{row.candidatePhone}</div>}
      <div className={styles.secondary}>Job #{row.jobId}</div>
    </div>
  ) },
  { title: "Client / worksite", width: "21%", render: (_, row) => (
    <div>{row.clientName && <strong>{row.clientName}</strong>}{row.worksite && row.worksite !== visit.location && <div className={styles.detail}>{row.worksite}</div>}</div>
  ) },
  { title: visit.kind === "pickup" ? "Journey / destination" : "Journey / pickup location", width: "28%", render: (_, row) => (
    <div>
      <div className={styles.journeyType}><Tag>{row.leg}</Tag>{row.pickupType && <span>{row.pickupType}</span>}</div>
      {visit.kind === "dropoff" && row.pickupLocation && <div className={styles.detail}><span className={styles.label}>Pickup: </span>{row.pickupLocation}</div>}
      {visit.kind === "pickup" && row.dropoffLocation && <div className={styles.detail}><span className={styles.label}>Drop-off: </span>{row.dropoffLocation}</div>}
      {row.notes && <div className={styles.secondary}>Notes: {row.notes}</div>}
    </div>
  ) },
  { title: "Planned pickup / drop-off", width: "15%", render: (_, row) => (
    <div>
      <strong>{row.pickupTime}</strong>
      {row.pickupDate && <div className={styles.secondary}>{row.pickupDate}</div>}
      <div className={styles.detail}><span className={styles.label}>Drop-off: </span>{row.dropoffTime}</div>
      {row.dropoffDate && row.dropoffDate !== row.pickupDate && <div className={styles.secondary}>{row.dropoffDate}</div>}
    </div>
  ) },
  { title: "Shift / service date", width: "14%", render: (_, row) => (
    <div>
      {row.shift && <strong>{row.shift}</strong>}
      {row.shiftStart && <div className={styles.detail}><span className={styles.label}>Start: </span>{row.shiftStart}</div>}
      {row.shiftEnd && <div><span className={styles.label}>End: </span>{row.shiftEnd}{row.overnightShift && <span> (+1 day)</span>}</div>}
      {row.serviceDate && <div className={styles.secondary}>{row.serviceDate}</div>}
      {row.shiftReference && <div className={styles.secondary}>Shift ref: {row.shiftReference}</div>}
    </div>
  ) },
];

export default function ShuttleManifestSection({ summary, locations, sourcePlan, pending }: Props) {
  const journeyCount = new Set(locations.flatMap(location => location.rows.map(row => row.key))).size;
  return (
    <section className={styles.manifestSection} aria-label={`${summary.driverName} shuttle manifest`}>
      <div className={styles.sectionHeading}>
        <div><h3>Driver: {summary.driverName}</h3>{sourcePlan && <p className={styles.secondary}>Plan: {sourcePlan}</p>}</div>
        {pending && <Tag color="orange">Pending optimization</Tag>}
      </div>
      <dl className={styles.summary}>
        <div><dt>Vehicle</dt><dd>{summary.vehicleName}{summary.licensePlate && ` · ${summary.licensePlate}`}</dd>
          <p className={styles.secondary}>{[summary.vehicleType, summary.seatCapacity].filter(Boolean).join(" · ")}</p></div>
        <div><dt>Start location</dt><dd>{summary.startLocation}</dd><p className={styles.secondary}>{summary.startTime}</p></div>
        <div><dt>End location</dt><dd>{summary.endLocation}</dd><p className={styles.secondary}>{summary.endTime}</p></div>
      </dl>
      <p className={styles.routeStats}>{journeyCount} passenger {journeyCount === 1 ? "journey" : "journeys"} · {locations.length} location {locations.length === 1 ? "visit" : "visits"} · {summary.distance} · {summary.expectedTravelTime}</p>
      {locations.map(visit => (
        <div key={visit.key} className={styles.locationVisit}>
          <Table<ShuttleManifestRow> className={styles.manifestTable}
            columns={[{ title: (
              <div className={styles.locationHeading}>
                <div className={styles.locationTitle}>
                  <strong>{visit.sequence}. {visit.kind === "pickup" ? "Pickup" : "Drop-off"}</strong>
                  <span>{visit.candidateCount} {visit.candidateCount === 1 ? "candidate" : "candidates"}</span>
                </div>
                {visit.location && <div className={styles.locationAddress}>{visit.location}</div>}
                <div className={styles.secondary}>Planned stop: {visit.plannedArrival}{visit.plannedDeparture !== visit.plannedArrival && ` – ${visit.plannedDeparture}`}</div>
                <div className={styles.secondary}>Driver: {summary.driverName} · Vehicle: {summary.vehicleName}{summary.licensePlate && ` · ${summary.licensePlate}`}{sourcePlan && ` · ${sourcePlan}`}</div>
              </div>
            ), children: columns(visit) }]}
            dataSource={visit.rows}
            pagination={false} rowKey="key" bordered size="small" tableLayout="fixed" scroll={{ x: 1040 }} />
        </div>
      ))}
    </section>
  );
}
