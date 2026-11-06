// components/Admin/AmbassadorManager.tsx
// Admin console for the ambassador QR campaign:
//   • create / rename / activate / delete ambassadors (name + code)
//   • render a downloadable QR that encodes /store?ambassador=CODE
//   • manage the one global product set every ambassador shares (50ml FA default)
//   • see redemptions and attributed revenue per ambassador
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  Link2,
  Loader2,
  Megaphone,
  MessageCircle,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  createAmbassadorAction,
  deleteAmbassadorAction,
  listAmbassadorProductOptionsAction,
  listAmbassadorsAction,
  pruneAmbassadorUnpaidAction,
  resetAmbassadorProductsAction,
  setAmbassadorProductAction,
  updateAmbassadorAction,
  type AmbassadorProductOption,
  type AmbassadorSummary,
} from "@/app/actions/ambassadorActions";
import { ambassadorPortalUrl, ambassadorStoreUrl } from "@/lib/ambassadors";

const PRODUCT_DISPLAY_LIMIT = 60;

function formatNaira(value: number): string {
  return `₦${Math.round(value).toLocaleString()}`;
}

export default function AmbassadorManager() {
  const [ambassadors, setAmbassadors] = useState<AmbassadorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [qrTarget, setQrTarget] = useState<AmbassadorSummary | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [groupTarget, setGroupTarget] = useState<AmbassadorSummary | null>(null);
  const [groupUrl, setGroupUrl] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const [products, setProducts] = useState<AmbassadorProductOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productSearch, setProductSearch] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAmbassadors(await listAmbassadorsAction());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ambassadors.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      setProducts(await listAmbassadorProductOptionsAction());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the ambassador product set.");
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadProducts();
  }, [load, loadProducts]);

  // Render the QR for the selected ambassador (client-side, no server round trip).
  useEffect(() => {
    if (!qrTarget) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    setQrLoading(true);
    (async () => {
      type QrModule = { toDataURL: (text: string, options?: Record<string, unknown>) => Promise<string> };
      const mod = await import("qrcode");
      const qr = (mod as unknown as { default?: QrModule }).default ?? (mod as unknown as QrModule);
      return qr.toDataURL(ambassadorStoreUrl(qrTarget.code), {
        margin: 2,
        width: 512,
        errorCorrectionLevel: "M",
        color: { dark: "#1a1a1e", light: "#faf7f0" },
      });
    })()
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      })
      .finally(() => {
        if (!cancelled) setQrLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [qrTarget]);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      await createAmbassadorAction(newName.trim(), newCode.trim() || undefined);
      setNewName("");
      setNewCode("");
      setNotice("Ambassador created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ambassador.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(ambassador: AmbassadorSummary) {
    setBusyId(ambassador.id);
    setError(null);
    try {
      await updateAmbassadorAction(ambassador.id, { is_active: !ambassador.is_active });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update ambassador.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(ambassador: AmbassadorSummary) {
    if (!window.confirm(`Delete ambassador "${ambassador.name}" (${ambassador.code})? The QR link will stop working.`)) return;
    setBusyId(ambassador.id);
    setError(null);
    try {
      await deleteAmbassadorAction(ambassador.id);
      if (qrTarget?.id === ambassador.id) setQrTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete ambassador.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleProduct(option: AmbassadorProductOption) {
    setTogglingId(option.id);
    setError(null);
    try {
      await setAmbassadorProductAction(option.id, !option.selected);
      setProducts((prev) =>
        prev.map((product) => (product.id === option.id ? { ...product, selected: !product.selected } : product)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update the product set.");
    } finally {
      setTogglingId(null);
    }
  }

  async function resetProducts() {
    if (!window.confirm("Reset the ambassador product set to the default 50ml FA perfumes?")) return;
    setError(null);
    try {
      const result = await resetAmbassadorProductsAction();
      setNotice(`Product set reset to ${result.count} default 50ml FA product(s).`);
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset the product set.");
    }
  }

  function copyText(value: string, key: string) {
    const done = () => {
      setCopied(key);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 2000);
    };
    navigator.clipboard.writeText(value).then(done).catch(() => {
      try {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      } catch {
        /* ignore */
      }
    });
  }

  function copyLink(code: string) {
    copyText(ambassadorStoreUrl(code), code);
  }

  function openGroup(ambassador: AmbassadorSummary) {
    setGroupTarget(ambassador);
    setGroupUrl(ambassador.whatsapp_group_url ?? "");
  }

  async function saveGroup() {
    if (!groupTarget) return;
    setSavingGroup(true);
    setError(null);
    try {
      await updateAmbassadorAction(groupTarget.id, {
        whatsapp_group_url: groupUrl.trim() || null,
      });
      setGroupTarget(null);
      setNotice("WhatsApp group link saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save the group link.");
    } finally {
      setSavingGroup(false);
    }
  }

  async function cleanUnpaid() {
    setCleaning(true);
    setError(null);
    try {
      const result = await pruneAmbassadorUnpaidAction();
      setNotice(`Removed ${result.removed} stale unpaid attribution row(s).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cleanup failed.");
    } finally {
      setCleaning(false);
    }
  }

  function downloadQr(ambassador: AmbassadorSummary) {
    if (!qrDataUrl) return;
    const anchor = document.createElement("a");
    anchor.href = qrDataUrl;
    anchor.download = `ambassador-${ambassador.code}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  const selectedCount = useMemo(() => products.filter((product) => product.selected).length, [products]);
  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) => product.name.toLowerCase().includes(term));
  }, [products, productSearch]);
  const shownProducts = filteredProducts.slice(0, PRODUCT_DISPLAY_LIMIT);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-gold/10 border border-brand-gold/25">
          <Megaphone size={20} className="text-brand-gold" />
        </div>
        <div>
          <h2 className="text-xl font-serif font-bold text-gray-900">Ambassadors</h2>
          <p className="text-xs text-gray-400">
            Generate a QR per ambassador. Scanning it opens the storefront with their discounted products.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void cleanUnpaid()}
          disabled={cleaning}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:border-brand-gold hover:text-gray-900 disabled:opacity-50"
          title="Delete attribution rows for orders never paid (older than 30 days)"
        >
          {cleaning ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          Clean unpaid
        </button>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-600">
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
      {notice && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
          <Check size={14} /> {notice}
          <button type="button" onClick={() => setNotice(null)} className="ml-auto text-emerald-500 hover:text-emerald-700">
            <X size={14} />
          </button>
        </p>
      )}

      {/* Create */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3">New ambassador</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ambassador name"
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30"
          />
          <input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="Code (optional, e.g. AMB-HAWA)"
            className="w-full sm:w-56 rounded-xl border border-gray-200 px-4 py-2.5 text-sm uppercase outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30"
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !newName.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-gold px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:brightness-105 disabled:opacity-50"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create
          </button>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          Leave the code blank to auto-generate one (AMB-XXXXXX).
        </p>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">All ambassadors</h3>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-900 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {loading && ambassadors.length === 0 ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-brand-gold" /></div>
        ) : ambassadors.length === 0 ? (
          <p className="px-5 py-10 text-center text-xs text-gray-400">No ambassadors yet. Create the first one above.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {ambassadors.map((ambassador) => (
              <div key={ambassador.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-gray-900">{ambassador.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                      ambassador.is_active ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"
                    }`}>
                      {ambassador.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-gray-500">{ambassador.code}</p>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {ambassador.stats.redemptions} redemption{ambassador.stats.redemptions === 1 ? "" : "s"} ·{" "}
                    {formatNaira(ambassador.stats.revenue)} attributed
                    {ambassador.stats.lastAt ? ` · last ${new Date(ambassador.stats.lastAt).toLocaleDateString()}` : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQrTarget(ambassador)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-600 hover:border-brand-gold hover:text-gray-900"
                  >
                    <QrCode size={13} /> QR
                  </button>
                  <button
                    type="button"
                    onClick={() => openGroup(ambassador)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-widest ${
                      ambassador.whatsapp_group_url
                        ? "border-emerald-200 text-emerald-600 hover:border-emerald-400"
                        : "border-gray-200 text-gray-600 hover:border-brand-gold hover:text-gray-900"
                    }`}
                  >
                    <MessageCircle size={13} /> Group
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText(ambassadorPortalUrl(ambassador.code, ambassador.access_token), `portal:${ambassador.code}`)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-600 hover:border-brand-gold hover:text-gray-900"
                  >
                    {copied === `portal:${ambassador.code}` ? <Check size={13} className="text-emerald-500" /> : <Link2 size={13} />}
                    {copied === `portal:${ambassador.code}` ? "Copied" : "Portal"}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyLink(ambassador.code)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-600 hover:border-brand-gold hover:text-gray-900"
                  >
                    {copied === ambassador.code ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    {copied === ambassador.code ? "Copied" : "Link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(ambassador)}
                    disabled={busyId === ambassador.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-600 hover:border-brand-gold hover:text-gray-900 disabled:opacity-50"
                  >
                    {busyId === ambassador.id ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
                    {ambassador.is_active ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(ambassador)}
                    disabled={busyId === ambassador.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product set */}
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <div className="flex flex-col gap-3 px-5 py-4 border-b border-gray-100 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Ambassador product set</h3>
            <p className="text-[11px] text-gray-400">
              {selectedCount} product{selectedCount === 1 ? "" : "s"} in every ambassador&apos;s offer. Defaults to all 50ml FA perfumes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products"
                className="w-44 rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-xs outline-none focus:border-brand-gold"
              />
            </div>
            <button
              type="button"
              onClick={() => void resetProducts()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-600 hover:border-brand-gold hover:text-gray-900"
            >
              <RotateCcw size={13} /> Reset defaults
            </button>
          </div>
        </div>

        {productsLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-brand-gold" /></div>
        ) : (
          <>
            <div className="max-h-[460px] divide-y divide-gray-50 overflow-y-auto">
              {shownProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-gray-800">
                      {product.name}
                      {product.isDefaultFa50 && (
                        <span className="ml-2 rounded-full bg-brand-gold/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-brand-gold">
                          50ml FA
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Real {formatNaira(product.realPrice)}
                      {product.ambassadorPrice != null ? ` · Ambassador ${formatNaira(product.ambassadorPrice)}` : " · no valid ambassador price"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleProduct(product)}
                    disabled={togglingId === product.id}
                    aria-pressed={product.selected}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 ${
                      product.selected
                        ? "border-brand-gold bg-brand-gold/10 text-gray-900"
                        : "border-gray-200 text-gray-500 hover:border-brand-gold"
                    }`}
                  >
                    {togglingId === product.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : product.selected ? (
                      <Check size={12} />
                    ) : (
                      <Plus size={12} />
                    )}
                    {product.selected ? "In offer" : "Add"}
                  </button>
                </div>
              ))}
              {shownProducts.length === 0 && (
                <p className="px-5 py-10 text-center text-xs text-gray-400">No products match that search.</p>
              )}
            </div>
            {filteredProducts.length > PRODUCT_DISPLAY_LIMIT && (
              <p className="border-t border-gray-50 px-5 py-2.5 text-[10px] text-gray-400">
                Showing the first {PRODUCT_DISPLAY_LIMIT} of {filteredProducts.length} matches — refine your search to see more.
              </p>
            )}
          </>
        )}
      </div>

      {/* QR dialog */}
      {qrTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setQrTarget(null)}
        >
          <div
            className="relative w-full max-w-xs rounded-3xl bg-white p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setQrTarget(null)}
              aria-label="Close QR"
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-900"
            >
              <X size={18} />
            </button>
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-brand-gold">Scan to shop</p>
            <h3 className="mt-1 text-xl font-serif font-bold text-gray-900">{qrTarget.name}</h3>
            <p className="font-mono text-[11px] text-gray-400">{qrTarget.code}</p>

            <div className="mt-4 flex justify-center rounded-2xl border border-brand-gold/20 bg-[#faf7f0] p-3">
              {qrLoading ? (
                <div className="flex h-48 w-48 items-center justify-center"><Loader2 className="animate-spin text-brand-gold" /></div>
              ) : qrDataUrl ? (
                <img src={qrDataUrl} alt={`QR code for ${qrTarget.name}`} className="h-48 w-48" />
              ) : (
                <div className="flex h-48 w-48 items-center justify-center text-xs text-gray-400">QR unavailable</div>
              )}
            </div>

            <p className="mt-3 break-all text-[10px] text-gray-400">{ambassadorStoreUrl(qrTarget.code)}</p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => downloadQr(qrTarget)}
                disabled={!qrDataUrl}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-gold px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-50"
              >
                <Download size={13} /> Download
              </button>
              <button
                type="button"
                onClick={() => copyLink(qrTarget.code)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-600 hover:border-brand-gold"
              >
                {copied === qrTarget.code ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                {copied === qrTarget.code ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp group editor */}
      {groupTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setGroupTarget(null)}
        >
          <div
            className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setGroupTarget(null)}
              aria-label="Close"
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-900"
            >
              <X size={18} />
            </button>
            <h3 className="text-lg font-serif font-bold text-gray-900">WhatsApp group</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
              The group the buyer is sent to after ordering, where they post the order and their payment
              screenshot. Add this ambassador and the store representatives to the group.
            </p>
            <input
              value={groupUrl}
              onChange={(e) => setGroupUrl(e.target.value)}
              placeholder="https://chat.whatsapp.com/..."
              className="mt-4 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-xs outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30"
            />
            <p className="mt-2 text-[10px] text-gray-400">
              Leave blank to fall back to the boutique&apos;s normal WhatsApp order chat.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => void saveGroup()}
                disabled={savingGroup}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-gold px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white disabled:opacity-50"
              >
                {savingGroup ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Save
              </button>
              <button
                type="button"
                onClick={() => setGroupTarget(null)}
                className="rounded-xl border border-gray-200 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
