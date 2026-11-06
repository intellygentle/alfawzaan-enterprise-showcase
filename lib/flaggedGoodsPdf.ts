// lib/flaggedGoodsPdf.ts — downloadable PDF register for discrepancy flags.
//
// The report is generated entirely from the flags already loaded in the admin
// tab, so exporting never touches Supabase (no extra egress). The admin picks a
// status and a store in the dialog; filterSalesFlags is shared with the preview
// count so the document can never disagree with what was promised.
//
// It is written for a reader who was not looking at the admin screen: a plain
// executive summary, a legend for every piece of jargon, an explicit unit-gap
// column, and per-store totals. Overdue and chronic items are marked in the
// rows so the summary counts can actually be traced.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  CHRONIC_FLAG_THRESHOLD,
  OVERDUE_AFTER_DAYS,
  SALES_FLAG_TYPE_LABEL,
  filterSalesFlags,
  flagAgeDays,
  isOverdue,
  type SalesFlag,
  type SalesFlagReportFilter,
  type SalesFlagReportOutlet,
  type SalesFlagReportStatus,
} from "./salesFlags";

const STATUS_LABEL: Record<SalesFlagReportStatus, string> = {
  all: "All flags",
  open: "Open flags",
  resolved: "Resolved flags",
};

const OUTLET_LABEL: Record<SalesFlagReportOutlet, string> = {
  all: "Both stores",
  unilorin: "Unilorin only",
  tanke: "Tanke only",
};

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function itemKey(flag: SalesFlag): string {
  return `${flag.outlet}|${flag.product_id}|${flag.grade}`;
}

function capitalise(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * An item is chronic when it has been flagged CHRONIC_FLAG_THRESHOLD times or
 * more. This is a property of the goods item across its whole history, so it is
 * computed from every loaded flag — not only the subset being exported.
 */
function chronicItemKeys(allFlags: SalesFlag[]): Set<string> {
  const perItem = new Map<string, number>();
  for (const flag of allFlags) {
    perItem.set(itemKey(flag), (perItem.get(itemKey(flag)) ?? 0) + 1);
  }
  return new Set(
    [...perItem.entries()]
      .filter(([, total]) => total >= CHRONIC_FLAG_THRESHOLD)
      .map(([key]) => key),
  );
}

function summarise(flags: SalesFlag[], chronicKeys: Set<string>) {
  let onlineOverstates = 0;
  let onlineUnderstates = 0;
  const items = new Set<string>();

  for (const flag of flags) {
    items.add(itemKey(flag));
    const diff = flag.online_remaining - flag.physical_remaining;
    if (diff > 0) onlineOverstates += diff;
    else if (diff < 0) onlineUnderstates += -diff;
  }

  return {
    open: flags.filter((flag) => flag.status === "open").length,
    resolved: flags.filter((flag) => flag.status === "resolved").length,
    overdue: flags.filter((flag) => isOverdue(flag)).length,
    recurring: flags.filter((flag) => flag.is_recurrence).length,
    numberLess: flags.filter((flag) => flag.discrepancy_type === "number_less").length,
    numberMore: flags.filter((flag) => flag.discrepancy_type === "number_more").length,
    chronic: [...items].filter((key) => chronicKeys.has(key)).length,
    items: items.size,
    onlineOverstates,
    onlineUnderstates,
  };
}

/**
 * Build the report document without saving it. Kept separate from the download
 * wrapper so the layout can be exercised in tests without a browser.
 */
export function buildFlaggedGoodsPdf(
  allFlags: SalesFlag[],
  filter: SalesFlagReportFilter,
): { doc: jsPDF; fileName: string } {
  const flags = filterSalesFlags(allFlags, filter);
  if (flags.length === 0) throw new Error("No flags match this report selection.");

  // Open work first, then newest — the order a superior expects to read.
  const ordered = [...flags].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    return b.flagged_at.localeCompare(a.flagged_at);
  });

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const chronicKeys = chronicItemKeys(allFlags);
  const counts = summarise(ordered, chronicKeys);
  const now = new Date();
  const generated = `${now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })} at ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  const reference = `FG-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

  const flagDates = ordered.map((flag) => flag.flag_date).sort();
  const period =
    flagDates.length > 0
      ? `${formatDate(flagDates[0])} to ${formatDate(flagDates[flagDates.length - 1])}`
      : "-";

  // ── Title block ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20);
  doc.text("ALFAWZAAN\u2019S ENTERPRISE", pageWidth / 2, 17, { align: "center" });

  doc.setFontSize(12);
  doc.setTextColor(212, 175, 55);
  doc.text("Flagged Goods Report", pageWidth / 2, 25, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text(
    `Reference: ${reference}   |   Status: ${STATUS_LABEL[filter.status]}   |   Store: ${OUTLET_LABEL[filter.outlet]}   |   Generated: ${generated}`,
    pageWidth / 2,
    31,
    { align: "center" },
  );
  doc.text(
    `Sale dates covered: ${period}   |   Goods items: ${counts.items}   |   Flags in report: ${ordered.length}`,
    pageWidth / 2,
    36,
    { align: "center" },
  );

  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.4);
  doc.line(margin, 40, pageWidth - margin, 40);

  // ── Executive summary ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(70);
  doc.text("EXECUTIVE SUMMARY", margin, 47);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(40);

  const summaryLines = [
    `${ordered.length} discrepancy flag${ordered.length === 1 ? "" : "s"} across ${counts.items} goods item${counts.items === 1 ? "" : "s"}. ` +
      `${counts.open} still open (${counts.overdue} overdue) and ${counts.resolved} resolved.`,
    counts.onlineOverstates > 0
      ? `Across these records the online system was found overstating shelf stock by ${counts.onlineOverstates} unit${counts.onlineOverstates === 1 ? "" : "s"} in total — units that could have been sold without stock behind them.`
      : "No record shows the online system overstating shelf stock.",
    counts.onlineUnderstates > 0
      ? `It was found understating shelf stock by ${counts.onlineUnderstates} unit${counts.onlineUnderstates === 1 ? "" : "s"} — stock that existed physically but was not sellable online.`
      : "No record shows the online system understating shelf stock.",
    `${counts.recurring} flag${counts.recurring === 1 ? " was a repeat" : "s were repeats"} and ${counts.chronic} item${counts.chronic === 1 ? " is chronic" : "s are chronic"} (flagged ${CHRONIC_FLAG_THRESHOLD}+ times).`,
  ];
  let summaryY = 53;
  for (const line of summaryLines) {
    for (const wrapped of doc.splitTextToSize(line, contentWidth)) {
      doc.text(wrapped, margin, summaryY);
      summaryY += 4.4;
    }
  }

  // ── How to read this report ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(70);
  doc.text("HOW TO READ THIS REPORT", margin, summaryY + 3);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  doc.setTextColor(90);
  const legend =
    "Online = units the system says are available in the store. Physical = units actually counted on the shelf. " +
    "Unit gap = physical minus online: a red negative value means the system shows more units than the shelf (oversell risk); " +
    "a blue positive value means more units sit on the shelf than the system shows. 'Number less' and 'Number more' name " +
    "the same discrepancy direction. Age = days since the flag was raised; overdue = open " +
    `longer than ${OVERDUE_AFTER_DAYS} days. Repeat = the same goods item was flagged again after an earlier correction; chronic = flagged ` +
    `${CHRONIC_FLAG_THRESHOLD}+ times in total. Cause note is what the store believed went wrong; resolution records what was actually ` +
    "corrected, by whom and when. Open flags show 'Pending resolution'. A flag marked Matches was raised while both counts already agreed.";
  let legendY = summaryY + 8;
  for (const wrapped of doc.splitTextToSize(legend, contentWidth)) {
    doc.text(wrapped, margin, legendY);
    legendY += 3.6;
  }

  let startY = legendY + 5;

  const renderTable = (rows: SalesFlag[], title: string): number => {
    if (rows.length === 0) return startY;

    // Keep the section heading with its table.
    if (startY > pageHeight - 45) {
      doc.addPage();
      startY = 22;
    }

    const open = rows.filter((flag) => flag.status === "open").length;
    const overdue = rows.filter((flag) => isOverdue(flag)).length;
    const totalOnline = rows.reduce((sum, flag) => sum + flag.online_remaining, 0);
    const totalPhysical = rows.reduce((sum, flag) => sum + flag.physical_remaining, 0);
    const netGap = totalPhysical - totalOnline;
    const signedGap = (value: number) =>
      value > 0 ? `+${value}` : value < 0 ? `-${Math.abs(value)}` : "0";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(60);
    doc.text(
      `${title.toUpperCase()} STORE - ${rows.length} flag${rows.length === 1 ? "" : "s"} (${open} open, ${overdue} overdue, ${rows.length - open} resolved)`,
      margin,
      startY,
    );
    startY += 6;

    const body = rows.map((flag) => {
      const resolved = flag.status === "resolved";
      const age = flagAgeDays(flag.flagged_at);
      const overdue = isOverdue(flag);
      const chronic = chronicKeys.has(itemKey(flag));

      const repeat = flag.is_recurrence
        ? `x${flag.recurrence_count ?? 1}${flag.previous_resolved_at ? `\nlast fix ${formatDate(flag.previous_resolved_at.slice(0, 10))}` : ""}${chronic ? "\nCHRONIC" : ""}`
        : chronic
          ? "CHRONIC"
          : "-";

      return [
        `${flag.product_name || "Unnamed product"}\nRef ${flag.product_id.slice(0, 8)}\nFlag ${flag.id}`,
        `${capitalise(flag.outlet)}\n${capitalise(flag.grade)}`,
        formatDate(flag.flag_date),
        `${formatDateTime(flag.flagged_at)}${flag.flagged_by ? `\nby ${flag.flagged_by}` : ""}`,
        String(flag.online_remaining),
        String(flag.physical_remaining),
        signedGap(flag.physical_remaining - flag.online_remaining),
        SALES_FLAG_TYPE_LABEL[flag.discrepancy_type],
        capitalise(flag.status),
        resolved ? "-" : `${age}d${overdue ? "\nOVERDUE" : ""}`,
        repeat,
        flag.note || "No cause note recorded.",
        resolved
          ? `${formatDateTime(flag.resolved_at)}${flag.resolved_by ? `\nby ${flag.resolved_by}` : ""}\n${flag.resolution_note || "No resolution note recorded."}`
          : "Pending resolution",
      ];
    });

    autoTable(doc, {
      head: [[
        "Product",
        "Store / grade",
        "Sale date",
        "Flagged at",
        "Online",
        "Physical",
        "Unit gap",
        "Discrepancy",
        "Status",
        "Age",
        "Repeat",
        "Cause note",
        "Resolution",
      ]],
      body,
      foot: [[
        `TOTAL - ${rows.length} flag${rows.length === 1 ? "" : "s"}`,
        "",
        "",
        "",
        String(totalOnline),
        String(totalPhysical),
        signedGap(netGap),
        "",
        `${open} open`,
        "",
        "",
        "",
        "",
      ]],
      startY,
      tableWidth: contentWidth,
      margin: { left: margin, right: margin },
      styles: { fontSize: 7, cellPadding: 1.8, fontStyle: "normal", overflow: "linebreak", valign: "top" },
      headStyles: {
        fillColor: [212, 175, 55],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7.2,
      },
      footStyles: {
        fillColor: [240, 240, 240],
        textColor: [60, 60, 60],
        fontStyle: "bold",
        fontSize: 7.2,
      },
      alternateRowStyles: { fillColor: [250, 245, 230] },
      didParseCell: (data) => {
        if (data.column.index !== 6 || (data.section !== "body" && data.section !== "foot")) return;
        const value = data.section === "body"
          ? (rows[data.row.index]
              ? rows[data.row.index].physical_remaining - rows[data.row.index].online_remaining
              : 0)
          : netGap;
        if (value < 0) data.cell.styles.textColor = [220, 38, 38];
        else if (value > 0) data.cell.styles.textColor = [37, 99, 235];
      },
      columnStyles: {
        0: { cellWidth: 39 },
        1: { cellWidth: 18 },
        2: { cellWidth: 16 },
        3: { cellWidth: 22 },
        4: { cellWidth: 10, halign: "center" },
        5: { cellWidth: 12, halign: "center" },
        6: { cellWidth: 11, halign: "center" },
        7: { cellWidth: 18 },
        8: { cellWidth: 13 },
        9: { cellWidth: 13 },
        10: { cellWidth: 16 },
        11: { cellWidth: 43 },
        12: { cellWidth: 38 },
      },
    });

    return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 9;
  };

  if (filter.outlet === "all") {
    startY = renderTable(ordered.filter((flag) => flag.outlet === "unilorin"), "Unilorin");
    startY = renderTable(ordered.filter((flag) => flag.outlet === "tanke"), "Tanke");
  } else {
    startY = renderTable(ordered, filter.outlet);
  }

  // ── Repeated header and footer on every page ──
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    if (page > 1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(60);
      doc.text("ALFAWZAAN\u2019S ENTERPRISE - Flagged Goods Report", margin, 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(110);
      doc.text(
        `${STATUS_LABEL[filter.status]} | ${OUTLET_LABEL[filter.outlet]} | Ref ${reference}`,
        pageWidth - margin,
        12,
        { align: "right" },
      );
      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.3);
      doc.line(margin, 15, pageWidth - margin, 15);
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Ref ${reference} | Generated ${generated}`, margin, pageHeight - 7);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 7, {
      align: "right",
    });
  }

  const fileDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return {
    doc,
    fileName: `alfawzaan-flagged-goods-${filter.status}-${filter.outlet}-${fileDate}.pdf`,
  };
}

/** Build and save the report. Throws when the chosen filters match no flags. */
export function downloadFlaggedGoodsPdf(
  allFlags: SalesFlag[],
  filter: SalesFlagReportFilter,
): void {
  const { doc, fileName } = buildFlaggedGoodsPdf(allFlags, filter);
  doc.save(fileName);
}
