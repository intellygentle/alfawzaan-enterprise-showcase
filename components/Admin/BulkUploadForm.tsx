"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { fetchCategories } from "@/app/actions/getCategories";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  FileSpreadsheet,
  X,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Download,
  Table,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { bulkImportProducts, finalizeBulkImport } from "@/app/admin/dashboard/actions";
import type { BulkProductEntry, BulkUploadResult } from "@/lib/admin/bulkUpload";

type UploadState = "idle" | "parsing" | "preview" | "importing" | "done";
type FileFormat = "csv" | "xlsx";

// Default fallback if DB categories aren't loaded yet
const FALLBACK_CATEGORIES = ["100MLs", "50MLs", "30MLs", "Miniatures", "Naseem Oils", "Oils", "Body Sprays", "Body Mists", "Roll-ons", "Gift Sets", "Home Fragrance", "Bakhoor & Incense", "Traditional Wear", "Islamic Materials", "Self Care", "Accessories"];

const HEADERS = [
  "name",
  "category",
  "description",
  "price",
  "image_url",
  "unilorin_special_qty",
  "unilorin_extra_qty",
  "unilorin_normal_qty",
  "tanke_special_qty",
  "tanke_extra_qty",
  "tanke_normal_qty",
];

const SAMPLE_ROWS = [
  ["Midnight Oud", "100MLs", "A rich woody oud fragrance", 35000, "", 5, 3, 2, 4, 2, 1],
  ["Rose Petals Body Mist", "Body Sprays", "Light floral mist", 8500, "", 10, 5, 5, 8, 4, 3],
  ["Black Seed Oil", "Islamic Materials", "Pure black seed oil from Nigeria", 12000, "", 0, 0, 20, 0, 0, 15],
];

/** Generate a downloadable CSV template */
function generateTemplateCsv(): string {
  return [HEADERS.join(","), ...SAMPLE_ROWS.map((r) => r.join(","))].join("\n");
}

/** Generate a downloadable Excel template */
function generateTemplateXlsx(): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...SAMPLE_ROWS]);

  // Set column widths for readability
  ws["!cols"] = HEADERS.map((h) => ({
    wch: h.includes("price") || h.includes("qty") ? 22 : 18,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" });
}

/** Normalize parsed row data into a BulkProductEntry */
function rowToEntry(row: Record<string, any>): BulkProductEntry {
  return {
    name: String(row.name || "").trim(),
    category: String(row.category || "").trim(),
    description: String(row.description || "").trim() || undefined,
    price: row.price ? Number(row.price) : undefined,
    image_url: String(row.image_url || "").trim() || undefined,
    unilorin_special_qty: row.unilorin_special_qty ? Number(row.unilorin_special_qty) : 0,
    unilorin_extra_qty: row.unilorin_extra_qty ? Number(row.unilorin_extra_qty) : 0,
    unilorin_normal_qty: row.unilorin_normal_qty ? Number(row.unilorin_normal_qty) : 0,
    tanke_special_qty: row.tanke_special_qty ? Number(row.tanke_special_qty) : 0,
    tanke_extra_qty: row.tanke_extra_qty ? Number(row.tanke_extra_qty) : 0,
    tanke_normal_qty: row.tanke_normal_qty ? Number(row.tanke_normal_qty) : 0,
  };
}

export default function BulkUploadForm() {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  const [parsedData, setParsedData] = useState<BulkProductEntry[]>([]);
  const [results, setResults] = useState<BulkUploadResult[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [showPreview, setShowPreview] = useState(true);
  // Load categories from DB on mount
  useEffect(() => {
    fetchCategories()
      .then((cats) => {
        if (cats.length > 0) {
          setCategories(cats.map((c) => c.name));
        }
      })
      .catch(() => {});
  }, []);

  const [dragOver, setDragOver] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<FileFormat>("csv");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  /** Download template in selected format */
  const handleDownloadTemplate = useCallback(
    (format: FileFormat) => {
      if (format === "csv") {
        const csv = generateTemplateCsv();
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "alfawzaan_bulk_import_template.csv";
        link.click();
        URL.revokeObjectURL(link.href);
      } else {
        const data = generateTemplateXlsx();
        const blob = new Blob([data as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "alfawzaan_bulk_import_template.xlsx";
        link.click();
        URL.revokeObjectURL(link.href);
      }
    },
    []
  );

  /** Parse a CSV file using papaparse */
  const parseCsv = useCallback((file: File): Promise<BulkProductEntry[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (result) => {
          const rows = result.data as Record<string, any>[];
          resolve(rows.map(rowToEntry));
        },
        error: () => {
          reject(new Error("Failed to parse CSV file."));
        },
      });
    });
  }, []);

  /** Parse an Excel file using xlsx */
  const parseExcel = useCallback(async (file: File): Promise<BulkProductEntry[]> => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
    return rows.map(rowToEntry);
  }, []);

  /** Parse uploaded file (CSV or Excel) */
  const parseFile = useCallback(
    async (file: File) => {
      const fileName = file.name.toLowerCase();
      const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
      const isCsv = fileName.endsWith(".csv");

      if (!isCsv && !isExcel) {
        alert("Please upload a .csv or .xlsx / .xls file.");
        return;
      }

      setUploadState("parsing");
      setSelectedFormat(isExcel ? "xlsx" : "csv");

      try {
        const entries = isExcel ? await parseExcel(file) : await parseCsv(file);

        if (entries.length === 0) {
          alert("File is empty or has no data rows.");
          setUploadState("idle");
          return;
        }

        setParsedData(entries);
        setUploadState("preview");
      } catch {
        alert("Failed to parse file. Please check the format and try again.");
        setUploadState("idle");
      }
    },
    [parseCsv, parseExcel]
  );

  /** Handle file drop */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) parseFile(file);
    },
    [parseFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);

  /** Handle file input change */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  /** Submit the import in chunks to avoid serverless timeouts */
  const handleImport = async () => {
    if (parsedData.length === 0) return;

    setUploadState("importing");
    setProgress({ current: 0, total: parsedData.length });

    const allResults: BulkUploadResult[] = [];
    const CHUNK_SIZE = 15;
    const CHUNK_DELAY_MS = 300;
    const MAX_RETRIES = 2;
    let processed = 0;
    let hasError = false;

    for (let i = 0; i < parsedData.length; i += CHUNK_SIZE) {
      const chunk = parsedData.slice(i, i + CHUNK_SIZE);
      let chunkResults: BulkUploadResult[] | null = null;

      // Retry loop for transient failures
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          chunkResults = await bulkImportProducts(chunk);
          break; // success
        } catch (err: any) {
          if (attempt < MAX_RETRIES) {
            // Wait before retrying (exponential backoff)
            await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          }
        }
      }

      if (chunkResults) {
        allResults.push(...chunkResults);
      } else {
        hasError = true;
        // Chunk failed entirely after retries — mark all as failed
        chunk.forEach((entry, j) => {
          allResults.push({
            row: i + j + 2,
            productName: entry.name || "(unnamed)",
            success: false,
            error: "Request timed out after retries — chunk failed to process.",
          });
        });
      }

      processed += chunk.length;
      setProgress({ current: processed, total: parsedData.length });

      // Brief delay between chunks to keep progress UI responsive
      if (i + CHUNK_SIZE < parsedData.length) {
        await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
      }
    }

    setResults(allResults);
    setUploadState("done");

    // Revalidate once after full import completes (not per chunk)
    try { await finalizeBulkImport(); } catch {}

    if (hasError) {
      console.warn(
        `[BulkUpload] ${allResults.filter((r) => !r.success).length} product(s) failed — marked with errors above.`
      );
    }
  };

  /** Retry all failed products */
  const handleRetryFailed = async () => {
    const failedEntries = results
      .filter((r) => !r.success)
      .map((r) => parsedData[r.row - 2])
      .filter(Boolean);

    if (failedEntries.length === 0) return;

    setUploadState("importing");
    setProgress({ current: 0, total: failedEntries.length });

    const newResults: BulkUploadResult[] = [];
    const CHUNK_SIZE = 15;
    const CHUNK_DELAY_MS = 300;
    const MAX_RETRIES = 2;
    let processed = 0;

    for (let i = 0; i < failedEntries.length; i += CHUNK_SIZE) {
      const chunk = failedEntries.slice(i, i + CHUNK_SIZE);
      let chunkResults: BulkUploadResult[] | null = null;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          chunkResults = await bulkImportProducts(chunk);
          break;
        } catch (err: any) {
          if (attempt < MAX_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          }
        }
      }

      if (chunkResults) {
        newResults.push(...chunkResults);
      } else {
        chunk.forEach((entry, j) => {
          newResults.push({
            row: 0,
            productName: entry.name || "(unnamed)",
            success: false,
            error: "Retry chunk failed after retries.",
          });
        });
      }

      processed += chunk.length;
      setProgress({ current: processed, total: failedEntries.length });

      if (i + CHUNK_SIZE < failedEntries.length) {
        await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
      }
    }

    // Merge: keep old successful results, replace failed ones in order (preserving original row numbers)
    setResults((prev) => {
      let retryIdx = 0;
      return prev.map((old) => {
        if (old.success) return old;
        const replacement = newResults[retryIdx++];
        return replacement ? { ...replacement, row: old.row } : old;
      });
    });
    setUploadState("done");
    try { await finalizeBulkImport(); } catch {}
  };

  /** Retry a single failed product */
  const handleRetrySingle = async (result: BulkUploadResult) => {
    const entry = parsedData[result.row - 2];
    if (!entry) return;

    // Optimistically mark as retrying (inline style, not in type)
    setResults((prev) =>
      prev.map((r) =>
        r.row === result.row && r.productName === result.productName
          ? { ...r, retrying: true as boolean | undefined }
          : r
      )
    );

    try {
      const retryResults = await bulkImportProducts([entry]);
      const retryResult = retryResults[0];
      if (retryResult) {
        setResults((prev) =>
          prev.map((r) =>
            r.row === result.row && r.productName === result.productName
              ? { ...retryResult, row: result.row }
              : r
          )
        );
      }
    } catch (err: any) {
      setResults((prev) =>
        prev.map((r) =>
          r.row === result.row && r.productName === result.productName
            ? {
                ...r,
                error: err?.message || "Retry failed.",
                retrying: undefined,
              }
            : r
        )
      );
    }
  };

  /** Reset the form */
  const handleReset = () => {
    setUploadState("idle");
    setParsedData([]);
    setResults([]);
    setProgress({ current: 0, total: 0 });
    setSelectedFormat("csv");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return (
    <div className="space-y-6">
      {/* Header with template download buttons */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-serif font-bold text-gray-900">Bulk Import Products</h2>
          <p className="text-sm text-gray-500 mt-1">
            Upload a CSV or Excel file to import multiple products at once.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleDownloadTemplate("csv")}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-[11px] font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all"
          >
            <FileText size={14} />
            CSV Template
          </button>
          <button
            onClick={() => handleDownloadTemplate("xlsx")}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-[11px] font-black uppercase tracking-widest text-gray-600 hover:bg-green-50 hover:border-green-300 hover:text-green-700 transition-all"
          >
            <FileSpreadsheet size={14} />
            Excel Template
          </button>
        </div>
      </div>

      {/* Drop zone or results */}
      <AnimatePresence mode="wait">
        {uploadState === "idle" && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            ref={dropZoneRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative border-2 border-dashed rounded-3xl p-16 text-center transition-all duration-300 cursor-pointer ${
              dragOver
                ? "border-brand-gold bg-brand-gold/5 scale-[1.01]"
                : "border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-gray-50"
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileSelect}
            />
            <div className="flex flex-col items-center gap-4">
              <div
                className={`p-4 rounded-2xl transition-colors ${
                  dragOver ? "bg-brand-gold/20" : "bg-gray-100"
                }`}
              >
                <Upload size={32} className={dragOver ? "text-brand-gold" : "text-gray-400"} />
              </div>
              <div>
                <p className="text-base font-bold text-gray-900">
                  {dragOver ? "Drop your file here" : "Drag & drop your file here"}
                </p>
                <p className="text-sm text-gray-400 mt-1">or click to browse files</p>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-medium text-gray-300 uppercase tracking-wider">
                <span className="flex items-center gap-1">
                  <FileText size={12} /> .csv
                </span>
                <span className="text-gray-200">|</span>
                <span className="flex items-center gap-1">
                  <FileSpreadsheet size={12} /> .xlsx / .xls
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {uploadState === "parsing" && (
          <motion.div
            key="parsing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 gap-4"
          >
            <Loader2 size={32} className="animate-spin text-brand-gold" />
            <p className="text-sm font-medium text-gray-500">
              Parsing {selectedFormat === "xlsx" ? "Excel" : "CSV"} file...
            </p>
          </motion.div>
        )}

        {uploadState === "preview" && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Summary bar */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-brand-gold/10 text-brand-gold">
                  {selectedFormat === "xlsx" ? <FileSpreadsheet size={20} /> : <FileText size={20} />}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    {parsedData.length} product{parsedData.length !== 1 ? "s" : ""} detected
                  </p>
                  <p className="text-xs text-gray-400">
                    from {selectedFormat === "xlsx" ? "Excel" : "CSV"} file — review before importing.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={handleReset}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-colors flex-1 sm:flex-initial"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  className="px-6 py-2.5 rounded-xl bg-black text-white text-xs font-black uppercase tracking-widest hover:bg-brand-gold transition-all duration-300 flex items-center justify-center gap-2 flex-1 sm:flex-initial"
                >
                  Import All <ArrowRight size={14} />
                </button>
              </div>
            </div>

            {/* Validation warnings */}
            {parsedData.some((p) => !p.name || !p.category) && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-800">Some rows have missing required fields</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Products without a <strong>name</strong> and <strong>category</strong> will be skipped.
                  </p>
                </div>
              </div>
            )}

            {/* Preview toggle */}
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-900 transition-colors"
            >
              <Table size={14} />
              Preview Data
              {showPreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {/* Preview table */}
            <AnimatePresence>
              {showPreview && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="p-3 font-bold text-gray-700 whitespace-nowrap">#</th>
                            <th className="p-3 font-bold text-gray-700 whitespace-nowrap">Name</th>
                            <th className="p-3 font-bold text-gray-700 whitespace-nowrap">Category</th>
                            <th className="p-3 font-bold text-gray-700 whitespace-nowrap">Price (₦)</th>
                            <th className="p-3 font-bold text-gray-700 whitespace-nowrap">Unilorin Stock</th>
                            <th className="p-3 font-bold text-gray-700 whitespace-nowrap">Tanke Stock</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {parsedData.map((entry, i) => {
                            const unilorinTotal =
                              (entry.unilorin_special_qty || 0) +
                              (entry.unilorin_extra_qty || 0) +
                              (entry.unilorin_normal_qty || 0);
                            const tankeTotal =
                              (entry.tanke_special_qty || 0) +
                              (entry.tanke_extra_qty || 0) +
                              (entry.tanke_normal_qty || 0);
                            return (
                              <tr
                                key={i}
                                className={`hover:bg-gray-50 transition-colors ${
                                  !entry.name || !entry.category ? "bg-red-50/50" : ""
                                }`}
                              >
                                <td className="p-3 text-gray-400 font-mono">{i + 1}</td>
                                <td className="p-3 font-semibold text-gray-900 max-w-[200px] truncate">
                                  {!entry.name ? (
                                    <span className="text-red-400 italic">missing</span>
                                  ) : (
                                    entry.name
                                  )}
                                </td>
                                <td className="p-3">
                                  {!entry.category ? (
                                    <span className="text-red-400 italic">missing</span>
                                  ) : (
                                    <span className="text-gray-600">{entry.category}</span>
                                  )}
                                </td>
                                <td className="p-3 font-mono text-gray-900">
                                  {entry.price ? `₦${entry.price.toLocaleString()}` : "—"}
                                </td>
                                <td className="p-3">
                                  <span
                                    className={`font-mono font-bold ${
                                      unilorinTotal > 0 ? "text-green-600" : "text-gray-400"
                                    }`}
                                  >
                                    {unilorinTotal}
                                  </span>
                                </td>
                                <td className="p-3">
                                  <span
                                    className={`font-mono font-bold ${
                                      tankeTotal > 0 ? "text-green-600" : "text-gray-400"
                                    }`}
                                  >
                                    {tankeTotal}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {uploadState === "importing" && (
          <motion.div
            key="importing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-white rounded-2xl border border-gray-100 p-8"
          >
            <div className="flex flex-col items-center gap-6 py-8">
              <Loader2 size={36} className="animate-spin text-brand-gold" />
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900">Importing products...</p>
                <p className="text-sm text-gray-400 mt-1">
                  {progress.current} of {progress.total} processed
                </p>
              </div>
              {/* Progress bar */}
              <div className="w-full max-w-sm bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <motion.div
                  className="h-full bg-brand-gold rounded-full"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(progress.current / progress.total) * 100}%`,
                  }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {uploadState === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Summary */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-2xl bg-green-50 text-green-600">
                  <CheckCircle size={28} />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">Import Complete</p>
                  <p className="text-sm text-gray-500">
                    {successCount} succeeded{failCount > 0 ? `, ${failCount} failed` : ""}
                  </p>
                </div>
                {failCount > 0 && (
                  <button
                    onClick={handleRetryFailed}
                    className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-black uppercase tracking-widest hover:bg-amber-100 hover:border-amber-300 transition-all shrink-0"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    Retry All ({failCount})
                  </button>
                )}
              </div>

              {/* Results list */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-3 rounded-xl ${
                      r.success ? "bg-green-50/50" : "bg-red-50/50"
                    } ${
                      (r as any).retrying ? "opacity-60" : ""
                    }`}
                  >
                    {r.success ? (
                      <CheckCircle size={16} className="text-green-500 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 truncate">{r.productName}</p>
                      {r.error && <p className="text-xs text-red-600 mt-0.5">{r.error}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!r.success && !(r as any).retrying && (
                        <button
                          onClick={() => handleRetrySingle(r)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold uppercase tracking-wider hover:bg-amber-100 hover:border-amber-300 transition-all"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                          Retry
                        </button>
                      )}
                      {(r as any).retrying && (
                        <Loader2 size={12} className="animate-spin text-amber-500" />
                      )}
                      <span className="text-[10px] text-gray-400 font-mono">Row {r.row}</span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleReset}
                className="mt-6 w-full px-6 py-3 rounded-xl bg-black text-white text-xs font-black uppercase tracking-widest hover:bg-brand-gold transition-all duration-300"
              >
                Import Another File
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Format Guide */}
      {uploadState === "idle" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Format Guide</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-bold text-gray-700 mb-2">Required Columns</p>
              <ul className="space-y-1.5 text-gray-500">
                <li><code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">name</code> — Product name</li>
                <li><code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">category</code> — Optional: auto-detected from product name if left blank. Current categories: {categories.join(", ")}</li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-gray-700 mb-2">Optional Columns</p>
              <ul className="space-y-1.5 text-gray-500">
                <li><code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">price</code> — Global price (₦)</li>
                <li><code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">description</code> — Product description</li>
                <li><code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">image_url</code> — Product image URL</li>
              </ul>
            </div>
            <div className="md:col-span-2">
              <p className="font-bold text-gray-700 mb-2">Supported File Types</p>
              <div className="flex items-center gap-4 text-gray-500 mb-4">
                <span className="flex items-center gap-1.5">
                  <FileText size={14} className="text-blue-500" />
                  <strong className="text-gray-700">CSV</strong> (.csv)
                </span>
                <span className="flex items-center gap-1.5">
                  <FileSpreadsheet size={14} className="text-green-600" />
                  <strong className="text-gray-700">Excel</strong> (.xlsx / .xls)
                </span>
              </div>
              <p className="font-bold text-gray-700 mb-2">Inventory Columns (per outlet & grade)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-gray-500">
                <span><code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">unilorin_special_qty</code></span>
                <span><code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">unilorin_extra_qty</code></span>
                <span><code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">unilorin_normal_qty</code></span>
                <span><code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">tanke_special_qty</code></span>
                <span><code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">tanke_extra_qty</code></span>
                <span><code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">tanke_normal_qty</code></span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                You can also set per-grade prices with <code className="bg-gray-100 px-1 rounded">*_price</code> columns (e.g., <code className="bg-gray-100 px-1 rounded">unilorin_special_price</code>). Falls back to global <code className="bg-gray-100 px-1 rounded">price</code> if not set.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
