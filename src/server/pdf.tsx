import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { computeDay, formatHours, formatTime12 } from "@/lib/timesheet/hours";
import { STATUS_LABEL } from "@/lib/timesheet/state";
import { dayName, shortDate, weekLabel } from "@/lib/week";
import { COMPANY_NAME } from "@/lib/config";
import type { SheetDTO } from "./timesheets";

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  h1: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  muted: { color: "#555" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#ccc", paddingVertical: 3 },
  head: { flexDirection: "row", backgroundColor: "#eee", paddingVertical: 3, fontFamily: "Helvetica-Bold" },
  c1: { width: "14%" },
  c2: { width: "22%" },
  c3: { width: "52%" },
  c4: { width: "12%", textAlign: "right" },
  box: { marginTop: 12, padding: 8, borderWidth: 0.5, borderColor: "#999" },
  bold: { fontFamily: "Helvetica-Bold" },
});

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago" }) : "");

function SheetDoc({ sheet, projectNames, phaseNames }: { sheet: SheetDTO; projectNames: Record<string, string>; phaseNames: Record<string, string> }) {
  const current = sheet.approvals.filter((a) => a.cycle === sheet.cycle && a.action === "APPROVE");
  const pm = current.filter((a) => a.step === "PM");
  const gc = current.find((a) => a.step === "GC");
  return (
    <Document title={`Timesheet ${sheet.workerName} ${sheet.weekStart}`}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.h1}>{COMPANY_NAME}: Weekly Timesheet</Text>
        <Text style={s.muted}>Week {weekLabel(sheet.weekStart)} (Sunday to Saturday)</Text>
        <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text><Text style={s.bold}>Worker:</Text> {sheet.workerName}</Text>
            <Text><Text style={s.bold}>Company:</Text> {sheet.companyName}</Text>
          </View>
          <View>
            <Text><Text style={s.bold}>Status:</Text> {STATUS_LABEL[sheet.status]}{sheet.isLate ? " (late)" : ""}</Text>
            <Text><Text style={s.bold}>Total hours:</Text> {formatHours(sheet.totalMinutes)}</Text>
          </View>
        </View>

        <View style={{ marginTop: 10 }}>
          <View style={s.head}>
            <Text style={s.c1}>Day</Text>
            <Text style={s.c2}>Time</Text>
            <Text style={s.c3}>Project / phase / hours</Text>
            <Text style={s.c4}>Paid hrs</Text>
          </View>
          {sheet.days.map((d) => {
            const c = computeDay(d);
            const empty = d.startMinute == null && d.entries.length === 0;
            return (
              <View key={d.date} style={s.row} wrap={false}>
                <Text style={s.c1}>{dayName(d.date)} {shortDate(d.date)}</Text>
                <Text style={s.c2}>{empty ? "-" : `${formatTime12(d.startMinute)} - ${formatTime12(d.endMinute)}${d.noLunch ? "\nNo lunch taken" : c.lunchMinutes ? "\n30 min lunch" : ""}`}</Text>
                <View style={s.c3}>
                  {d.entries.map((e, i) => (
                    <Text key={i}>{projectNames[e.projectId]} / {phaseNames[e.phaseId]}: {formatHours(e.minutes)}</Text>
                  ))}
                </View>
                <Text style={s.c4}>{empty ? "" : formatHours(d.paidMinutes)}</Text>
              </View>
            );
          })}
          <View style={[s.row, s.bold]}>
            <Text style={{ width: "88%" }}>Week total</Text>
            <Text style={s.c4}>{formatHours(sheet.totalMinutes)}</Text>
          </View>
        </View>

        <View style={s.box} wrap={false}>
          <Text style={s.bold}>Signature</Text>
          {sheet.certificationText && <Text style={s.muted}>{sheet.certificationText}</Text>}
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
          {sheet.signatureImage && <Image src={sheet.signatureImage} style={{ height: 50, width: 150, marginVertical: 4 }} />}
          <Text>{sheet.signedName ?? "Not signed"}   Date: {fmt(sheet.signedAt)}{sheet.submittedByName && sheet.submittedByName !== sheet.signedName ? `   Submitted by: ${sheet.submittedByName}` : ""}</Text>
        </View>

        <View style={s.box} wrap={false}>
          <Text style={s.bold}>Approvals</Text>
          {pm.length === 0 && <Text>Project manager: pending</Text>}
          {pm.map((a) => (
            <Text key={a.id}>Project manager ({a.projectLabel}): {a.typedSignature} ({a.approverName})   Date: {fmt(a.createdAt)}</Text>
          ))}
          <Text>GC: {gc ? `${gc.typedSignature} (${gc.approverName})   Date: ${fmt(gc.createdAt)}` : "pending"}</Text>
        </View>

        {sheet.approvals.some((a) => a.action !== "APPROVE") && (
          <View style={s.box} wrap={false}>
            <Text style={s.bold}>Review history</Text>
            {sheet.approvals.filter((a) => a.action !== "APPROVE").map((a) => (
              <Text key={a.id}>{fmt(a.createdAt)}  {a.action} by {a.approverName}: {a.comment}</Text>
            ))}
          </View>
        )}
        <Text style={[s.muted, { position: "absolute", bottom: 20, left: 32, fontSize: 7 }]} fixed>
          Sheet ID {sheet.id} · generated {fmt(new Date().toISOString())}
        </Text>
      </Page>
    </Document>
  );
}

export async function sheetPdf(sheet: SheetDTO, projectNames: Record<string, string>, phaseNames: Record<string, string>): Promise<Buffer> {
  return renderToBuffer(<SheetDoc sheet={sheet} projectNames={projectNames} phaseNames={phaseNames} />);
}
