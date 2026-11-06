"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserPlus, Edit3, Trash2, Shield, Store, Loader2,
  X, Save, Eye, EyeOff, ToggleLeft, ToggleRight, Users
} from "lucide-react";
import type { Representative, RepresentativePermissions } from "@/lib/representatives";
import { DEFAULT_PERMISSIONS } from "@/lib/representatives";
import {
  getRepresentativesAction,
  createRepresentativeAction,
  updateRepresentativeAction,
  deleteRepresentativeAction,
} from "@/app/admin/dashboard/actions";

const PERMISSION_LABELS: Record<keyof RepresentativePermissions, string> = {
  stock_in: "Stock In",
  edit_inventory: "Edit Inventory",
  record_sale: "Record Sale",
  verify_order: "Verify Orders",
  settle_order: "Settle Orders",
  update_order_item: "Update Order Items",
  add_product: "Add Product",
  bulk_import: "Bulk Import",
  upload_image: "Upload Image",
  view_inventory: "View Inventory",
  view_orders: "View Orders",
  view_audit_logs: "View Audit Logs",
  view_product_audit: "View Product Audit",
};

const ADMIN_ONLY: (keyof RepresentativePermissions)[] = [
  "add_product", "bulk_import",
];

export default function RepManagement() {
  const [reps, setReps] = useState<Representative[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRep, setEditingRep] = useState<Representative | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formName, setFormName] = useState("");
  const [formOutlet, setFormOutlet] = useState<"unilorin" | "tanke">("unilorin");
  const [formPermissions, setFormPermissions] = useState<RepresentativePermissions>({ ...DEFAULT_PERMISSIONS });
  const [showPassword, setShowPassword] = useState(false);

  const fetchReps = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getRepresentativesAction();
      setReps(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReps();
  }, [fetchReps]);

  function openCreate() {
    setEditingRep(null);
    setFormUsername("");
    setFormPassword("");
    setFormName("");
    setFormOutlet("unilorin");
    setFormPermissions({ ...DEFAULT_PERMISSIONS });
    setError(null);
    setShowForm(true);
  }

  function openEdit(rep: Representative) {
    setEditingRep(rep);
    setFormUsername(rep.username);
    setFormPassword("");
    setFormName(rep.display_name);
    setFormOutlet(rep.outlet);
    setFormPermissions({ ...rep.permissions });
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingRep(null);
    setError(null);
  }

  function togglePermission(key: keyof RepresentativePermissions) {
    // Don't allow toggling admin-only permissions
    if (ADMIN_ONLY.includes(key)) return;
    setFormPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    if (!formName.trim()) {
      setError("Display name is required.");
      return;
    }

    if (!editingRep && !formUsername.trim()) {
      setError("Username is required for new representatives.");
      return;
    }

    if (!editingRep && !formPassword) {
      setError("Password is required for new representatives.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingRep) {
        await updateRepresentativeAction(editingRep.id, {
          display_name: formName.trim(),
          outlet: formOutlet,
          permissions: formPermissions,
          ...(formPassword ? { password: formPassword } : {}),
        });
      } else {
        await createRepresentativeAction(
          formUsername.trim(),
          formPassword,
          formName.trim(),
          formOutlet,
          formPermissions
        );
      }
      await fetchReps();
      closeForm();
    } catch (err: any) {
      setError(err.message || "Failed to save representative.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this representative?")) return;
    try {
      await deleteRepresentativeAction(id);
      await fetchReps();
    } catch (err: any) {
      setError(err.message || "Failed to delete representative.");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-brand-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif font-bold text-gray-900 flex items-center gap-2">
            <Users size={20} className="text-brand-gold" />
            Store Representatives
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Manage who can access each store and what they can do.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-brand-gold text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand-gold/20"
        >
          <UserPlus size={14} />
          Add Rep
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-600 font-medium">
          {error}
        </div>
      )}

      {/* Reps List */}
      {reps.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Store size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-400">No representatives yet.</p>
          <p className="text-xs text-gray-300 mt-1">Create one to give store access.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {reps.map((rep) => (
            <motion.div
              key={rep.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                rep.outlet === 'unilorin' ? 'bg-blue-50 text-blue-500' : 'bg-emerald-50 text-emerald-500'
              }`}>
                <Store size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{rep.display_name}</p>
                <p className="text-[11px] text-gray-400">
                  @{rep.username} · <span className="capitalize">{rep.outlet}</span>
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {Object.entries(rep.permissions)
                    .filter(([, v]) => v)
                    .map(([key]) => (
                      <span
                        key={key}
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500"
                      >
                        {PERMISSION_LABELS[key as keyof RepresentativePermissions] || key}
                      </span>
                    ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider ${
                  rep.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                }`}>
                  {rep.is_active ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => openEdit(rep)}
                  className="p-2 rounded-lg text-gray-300 hover:text-brand-gold hover:bg-gray-50 transition-all"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={() => handleDelete(rep.id)}
                  className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create/Edit Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={closeForm}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-serif font-bold text-gray-900">
                  {editingRep ? "Edit Representative" : "New Representative"}
                </h3>
                <button onClick={closeForm} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Username (create only) */}
                {!editingRep && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Username</label>
                    <input
                      type="text"
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold"
                      placeholder="e.g., rep_unilorin"
                    />
                  </div>
                )}

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500">
                    {editingRep ? "New Password (leave blank to keep current)" : "Password"}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="w-full px-4 py-2.5 pr-10 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* Display Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Display Name</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold"
                    placeholder="e.g., Musa Abdullahi"
                  />
                </div>

                {/* Outlet */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Store Location</label>
                  <div className="flex gap-2">
                    {(["unilorin", "tanke"] as const).map((loc) => (
                      <button
                        key={loc}
                        onClick={() => setFormOutlet(loc)}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${
                          formOutlet === loc
                            ? "bg-brand-gold text-white border-brand-gold shadow-sm"
                            : "bg-white text-gray-500 border-gray-200 hover:border-brand-gold/50"
                        }`}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Permissions */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <Shield size={12} />
                    Permissions
                  </label>
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-1">
                    {Object.entries(PERMISSION_LABELS).map(([key, label]) => {
                      const k = key as keyof RepresentativePermissions;
                      const isAdminOnly = ADMIN_ONLY.includes(k);
                      const isEnabled = formPermissions[k];

                      return (
                        <button
                          key={key}
                          onClick={() => togglePermission(k)}
                          disabled={isAdminOnly}
                          className={`w-full flex items-center justify-between py-2 px-3 rounded-lg transition-all text-left ${
                            isAdminOnly
                              ? "opacity-40 cursor-not-allowed"
                              : "hover:bg-white cursor-pointer"
                          }`}
                        >
                          <span className="text-xs font-medium text-gray-700">{label}</span>
                          {isAdminOnly ? (
                            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Admin Only</span>
                          ) : isEnabled ? (
                            <ToggleRight size={20} className="text-emerald-500" />
                          ) : (
                            <ToggleLeft size={20} className="text-gray-300" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-red-500 font-medium">{error}</p>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={closeForm}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl bg-black text-white text-xs font-bold uppercase tracking-widest hover:bg-brand-gold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    {editingRep ? "Update" : "Create"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
