/* filepath: components/Admin/InventoryTable.tsx */
"use client";

import { useState, useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Pencil,
  ImagePlus,
  Loader2,
  Check,
  X,
  Package,
  Camera,
  AlertCircle,
  Trash2,
  Clock,
} from "lucide-react";
import {
  updateProductName,
  updateProductDescription,
  updateInventoryItem,
  syncGlobalPrice,
  uploadProductImageAction,
  deleteProductAction,
} from "@/app/admin/dashboard/actions";
import type { AdminInventoryItem } from "@/hooks/useAdminInventory";

interface Props {
  data: AdminInventoryItem[];
  onRefetch?: () => void;
  onViewAudit?: (productId: string, productName: string) => void;
}

export default function InventoryTable({ data, onRefetch, onViewAudit }: Props) {
  const [editItem, setEditItem] = useState<AdminInventoryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [productName, setProductName] = useState("");
  const [specialQty, setSpecialQty] = useState(0);
  const [extraQty, setExtraQty] = useState(0);
  const [normalQty, setNormalQty] = useState(0);
  const [productPrice, setProductPrice] = useState(0);
  const [productDescription, setProductDescription] = useState("");
  const [reason, setReason] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLocation, setDeleteLocation] = useState<'unilorin' | 'tanke' | 'both'>('both');
  const [deletePassword, setDeletePassword] = useState('');
  const [availableOutlets, setAvailableOutlets] = useState<{ unilorin: boolean; tanke: boolean }>({ unilorin: true, tanke: true });

  function openEditor(item: AdminInventoryItem) {
    setEditItem(item);
    setProductName(item.name);
    setSpecialQty(item.special);
    setExtraQty(item.extra);
    setNormalQty(item.normal);
    setProductPrice(item.price);
    setProductDescription(item.description || "");
    setReason("");
    setImagePreview(item.baseImageUrl);
    setSelectedFile(null);
    setSaveError(null);

    // Detect which outlets have this product
    const hasUnilorin = data.some(
      (d) => d.productId === item.productId && d.location === 'Unilorin'
    );
    const hasTanke = data.some(
      (d) => d.productId === item.productId && d.location === 'Tanke'
    );
    setAvailableOutlets({ unilorin: hasUnilorin, tanke: hasTanke });

    // Auto-select best location option
    if (hasUnilorin && hasTanke) {
      setDeleteLocation('both');
    } else if (hasUnilorin) {
      setDeleteLocation('unilorin');
    } else if (hasTanke) {
      setDeleteLocation('tanke');
    }
  }

  function closeEditor() {
    setEditItem(null);
    setSelectedFile(null);
    setImagePreview(null);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleDelete() {
    if (!editItem) return;
    setDeleting(true);
    setSaveError(null);
    try {
      const adminId = "admin-inventory-edit";
      await deleteProductAction(editItem.productId, adminId, deleteLocation, deletePassword);
      setShowDeleteConfirm(false);
      setDeletePassword('');
      onRefetch?.();
      closeEditor();
    } catch (err: any) {
      setSaveError(err.message || "Failed to delete product.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave() {
    if (!editItem) return;
    setSaving(true);
    setSaveError(null);

    try {
      const outlet = editItem.location === "Unilorin" ? "unilorin" : "tanke";
      const adminId = "admin-inventory-edit";
      const saveReason = reason.trim() || "Manual inventory edit";

      if (selectedFile) {
        setUploadingImage(true);
        const formData = new FormData();
        formData.append("file", selectedFile);
        await uploadProductImageAction(editItem.productId, formData);
        setUploadingImage(false);
      }

      if (productName !== editItem.name) {
        await updateProductName(editItem.productId, productName);
      }

      if (productDescription !== editItem.description) {
        await updateProductDescription(editItem.productId, productDescription);
      }

      const priceChanged = productPrice !== editItem.price;
      if (priceChanged) {
        await syncGlobalPrice(editItem.productId, productPrice, adminId);
      }

      const grades: Array<{ grade: "special" | "extra" | "normal"; qty: number; oldQty: number }> = [
        { grade: "special", qty: specialQty, oldQty: editItem.special },
        { grade: "extra", qty: extraQty, oldQty: editItem.extra },
        { grade: "normal", qty: normalQty, oldQty: editItem.normal },
      ];

      for (const g of grades) {
        if (g.qty !== g.oldQty || priceChanged) {
          // Price is global and has already been synchronized once above. Zero
          // asks the server action to read the current Master price instead of
          // treating this grade edit as an outlet-specific price change.
          await updateInventoryItem(outlet, editItem.productId, g.grade, g.qty, 0, adminId, saveReason);
        }
      }

      onRefetch?.();
      closeEditor();
    } catch (err: any) {
      setSaveError(err.message || "Failed to save changes.");
    } finally {
      setSaving(false);
      setUploadingImage(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <Table>
          <TableHeader className="bg-brand-softGray">
            <TableRow>
              <TableHead className="font-bold text-gray-700">Product</TableHead>
              <TableHead className="font-bold text-gray-700">Outlet</TableHead>
              <TableHead className="text-center font-bold text-brand-gold">Special</TableHead>
              <TableHead className="text-center font-bold text-brand-gold">Extra</TableHead>
              <TableHead className="text-center font-bold text-brand-gold">Normal</TableHead>
              <TableHead className="text-right font-bold text-gray-700">Price</TableHead>
              <TableHead className="text-right font-bold text-gray-900">Total Stock</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-16 text-gray-400">
                  <Package size={36} className="mx-auto mb-3 text-gray-200" />
                  <p className="font-medium">No inventory items found</p>
                </TableCell>
              </TableRow>
            ) : (
              data.map((item) => (
                <TableRow key={item.id} className="hover:bg-brand-softGray/50 transition-colors group">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
                        {item.baseImageUrl ? (
                          <img src={item.baseImageUrl} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <Camera size={16} />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-tighter">{item.type}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-brand-gold text-brand-gold text-[10px]">
                      {item.location}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm font-medium">{item.special}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm font-medium">{item.extra}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-sm font-medium">{item.normal}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {item.price > 0 && <span className="text-sm font-semibold text-gray-700">₦{item.price.toLocaleString()}</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={"font-bold text-sm " + (item.total < 3 ? "text-red-500 animate-pulse" : "text-gray-900")}>
                      {item.total}
                    </span>
                  </TableCell>
                  <TableCell className="relative">
                    <div className="flex items-center gap-0.5">
                      {/* Audit trail button */}
                      <button
                        onClick={() => onViewAudit?.(item.productId, item.name)}
                        className="p-2 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
                        title="View audit trail"
                      >
                        <Clock size={16} />
                      </button>
                      {/* Edit button */}
                      <button
                        onClick={() => openEditor(item)}
                        className="p-2 rounded-lg text-gray-300 hover:text-brand-gold hover:bg-brand-gold/5 transition-all"
                        title="Edit product"
                      >
                        <Pencil size={16} />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editItem} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-serif font-bold text-gray-900">
              Edit Inventory Item
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Update product details, quantities, and prices.
            </DialogDescription>
          </DialogHeader>

          {editItem && (
            <div className="space-y-6 py-2">
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <Camera size={24} />
                    </div>
                  )}
                  {uploadingImage && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 size={18} className="animate-spin text-white" />
                    </div>
                  )}
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold uppercase tracking-widest text-gray-600 hover:border-brand-gold hover:text-brand-gold transition-all"
                  >
                    <ImagePlus size={16} />
                    {editItem.baseImageUrl ? "Change Image" : "Add Image"}
                  </button>
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    JPG, PNG or WebP. Max 5MB.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  Product Name
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="text-sm font-medium flex-1"
                    placeholder="Product name"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  Description
                </Label>
                <textarea
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="Write a compelling product description..."
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30 transition-all resize-none"
                />
                <p className="text-[10px] text-gray-400">
                  This description will appear on product cards in the store.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  Price (all grades)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₦</span>
                  <Input
                    type="number"
                    min={0}
                    value={productPrice}
                    onChange={(e) => setProductPrice(Number(e.target.value))}
                    className="pl-7 text-sm font-bold h-9"
                    placeholder="0"
                  />
                </div>
                <p className="text-[10px] text-gray-400">This price applies to all grades at all locations.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  Stock by Grade
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-amber-50/50 rounded-xl p-3 border border-amber-100/50 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-brand-gold text-center">Special</p>
                    <div>
                      <p className="text-[9px] text-gray-400 mb-0.5">Qty</p>
                      <Input type="number" min={0} value={specialQty} onChange={(e) => setSpecialQty(Number(e.target.value))} className="text-center text-sm font-bold h-8" />
                    </div>
                  </div>
                  <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100/50 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 text-center">Extra</p>
                    <div>
                      <p className="text-[9px] text-gray-400 mb-0.5">Qty</p>
                      <Input type="number" min={0} value={extraQty} onChange={(e) => setExtraQty(Number(e.target.value))} className="text-center text-sm font-bold h-8" />
                    </div>
                  </div>
                  <div className="bg-green-50/50 rounded-xl p-3 border border-green-100/50 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-green-600 text-center">Normal</p>
                    <div>
                      <p className="text-[9px] text-gray-400 mb-0.5">Qty</p>
                      <Input type="number" min={0} value={normalQty} onChange={(e) => setNormalQty(Number(e.target.value))} className="text-center text-sm font-bold h-8" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-500">
                  Reason for Change <span className="text-gray-300 normal-case font-normal tracking-normal">(optional)</span>
                </Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Restocked from new shipment, price correction..."
                  className="text-sm"
                />
                <p className="text-[10px] text-gray-400">
                  This will be recorded in the audit log for accountability.
                </p>
              </div>

              {saveError && (
                <div className="flex items-center gap-2 text-red-500 bg-red-50 rounded-xl px-4 py-3 text-xs font-medium">
                  <AlertCircle size={14} />
                  {saveError}
                </div>
              )}

              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                <Badge variant="outline" className="border-brand-gold text-brand-gold text-[10px]">
                  {editItem.location}
                </Badge>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={closeEditor} disabled={saving}>
              <X size={14} /> Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-brand-gold text-white hover:bg-brand-gold/90 border-none"
            >
              {saving ? (
                <><Loader2 size={14} className="animate-spin" /> Saving...</>
              ) : (
                <><Check size={14} /> Save Changes</>
              )}
            </Button>
          </DialogFooter>

          {/* Delete button row */}
          {editItem && (
            <div className="border-t border-gray-100 pt-4 mt-2">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-red-500 text-xs font-bold uppercase tracking-widest hover:bg-red-50 hover:border-red-300 transition-all"
              >
                <Trash2 size={14} />
                Delete Product
              </button>
              <p className="text-[10px] text-gray-400 mt-1.5">
                Permanently removes this product and all its inventory from every outlet.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ─── */}
      <Dialog open={showDeleteConfirm} onOpenChange={(open) => { if (!open) { setShowDeleteConfirm(false); setSaveError(null); setDeletePassword(''); } }}>
        <DialogContent className="sm:max-w-md bg-white border-red-100">
          <DialogHeader>
            <DialogTitle className="text-lg font-serif font-bold text-red-600 flex items-center gap-2">
              <Trash2 size={20} />
              Delete Product?
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              This action <strong>cannot be undone</strong>. Select where to remove this product.
            </DialogDescription>
          </DialogHeader>

          {editItem && (
            <div className="space-y-4">
              <div className="bg-red-50 rounded-xl p-4 space-y-2">
                <p className="font-bold text-gray-900">{editItem.name}</p>
                <ul className="text-xs text-gray-600 space-y-1 list-disc pl-4">
                  <li>Inventory and stock adjustments at the selected outlet(s)</li>
                  <li>Product images at the selected outlet(s)</li>
                  <li>Order items and audit logs referencing this product (global)</li>
                  {deleteLocation === 'both' && <li>The product from the master catalog</li>}
                </ul>
              </div>

              {/* Location selector */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Delete from:</p>
                <div className="flex gap-2">
                  {(['unilorin', 'tanke', 'both'] as const).map((loc) => {
                    const isBoth = loc === 'both';
                    const canDelete =
                      isBoth
                        ? availableOutlets.unilorin && availableOutlets.tanke
                        : availableOutlets[loc];
                    return (
                      <button
                        key={loc}
                        onClick={() => canDelete && setDeleteLocation(loc)}
                        disabled={!canDelete}
                        className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${
                          !canDelete
                            ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                            : deleteLocation === loc
                            ? 'bg-red-600 text-white border-red-600 shadow-sm'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-600'
                        }`}
                        title={!canDelete ? `Product not available at ${loc === 'unilorin' ? 'Unilorin' : 'Tanke'}` : ''}
                      >
                        {loc === 'unilorin' ? 'Unilorin' : loc === 'tanke' ? 'Tanke' : 'Both'}
                        {!canDelete && ' (N/A)'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Password input */}
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Enter delete password:</p>
                <Input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Required to confirm deletion"
                  className="text-sm border-red-200 focus:border-red-400 focus:ring-red-400/20"
                  autoFocus
                />
              </div>
            </div>
          )}

          {saveError && (
            <div className="flex items-center gap-2 text-red-500 bg-red-50 rounded-xl px-4 py-3 text-xs font-medium">
              <AlertCircle size={14} />
              {saveError}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteConfirm(false);
                setSaveError(null);
                setDeletePassword('');
              }}
              disabled={deleting}
            >
              <X size={14} /> Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting || !deletePassword}
              className="bg-red-600 text-white hover:bg-red-700 border-none"
            >
              {deleting ? (
                <><Loader2 size={14} className="animate-spin" /> Deleting...</>
              ) : (
                <><Trash2 size={14} /> Delete{deleteLocation === 'both' ? ' Everywhere' : ` from ${deleteLocation.charAt(0).toUpperCase() + deleteLocation.slice(1)}`}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
