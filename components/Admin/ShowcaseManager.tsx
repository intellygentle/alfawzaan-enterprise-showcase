"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ImagePlus, X, Loader2, AlertCircle, Trash2, Edit3,
  Sparkles, Check, Plus
} from "lucide-react";
import {
  getShowcaseItems,
  createShowcaseItem,
  removeFromShowcase,
  updateShowcaseCopy,
} from "@/lib/master/showcase";
import type { ShowcaseItem } from "@/lib/types";
import { uploadProductImage } from "@/lib/admin/upload";

export default function ShowcaseManager() {
  const [items, setItems] = useState<ShowcaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Form fields
  const [formName, setFormName] = useState("");
  const [formCopy, setFormCopy] = useState("");
  const [formTagline, setFormTagline] = useState("");
  const [formTop, setFormTop] = useState("");
  const [formHeart, setFormHeart] = useState("");
  const [formBase, setFormBase] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCopy, setEditCopy] = useState("");
  const [editTagline, setEditTagline] = useState("");
  const [editTop, setEditTop] = useState("");
  const [editHeart, setEditHeart] = useState("");
  const [editBase, setEditBase] = useState("");

  const atLimit = items.length >= 3;

  async function fetchItems() {
    try {
      const data = await getShowcaseItems();
      setItems(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchItems();
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    e.target.value = "";
  }

  async function handleCreate() {
    if (!formName.trim() || !formCopy.trim()) {
      setError("Product name and sensory copy are required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let imageUrl = "";
      if (pendingFile) {
        const formData = new FormData();
        formData.append("productId", formName.toLowerCase().replace(/\s+/g, "-"));
        formData.append("file", pendingFile);
        const result = await uploadProductImage(formData);
        imageUrl = result.url;
      }

      await createShowcaseItem({
        product_name: formName.trim(),
        copy: formCopy.trim(),
        showcase_image_url: imageUrl,
        tagline: formTagline.trim() || undefined,
        scent_notes_top: formTop.trim() || undefined,
        scent_notes_heart: formHeart.trim() || undefined,
        scent_notes_base: formBase.trim() || undefined,
      });

      // Reset form
      setFormName("");
      setFormCopy("");
      setFormTagline("");
      setFormTop("");
      setFormHeart("");
      setFormBase("");
      setPendingFile(null);
      setPreviewUrl(null);
      setShowForm(false);
      await fetchItems();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    try {
      await removeFromShowcase(id);
      await fetchItems();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function startEditing(item: ShowcaseItem) {
    setEditingId(item.id);
    setEditCopy(item.copy);
    setEditTagline(item.tagline || "");
    setEditTop(item.scent_notes_top || "");
    setEditHeart(item.scent_notes_heart || "");
    setEditBase(item.scent_notes_base || "");
  }

  async function handleSaveCopy() {
    if (!editingId) return;
    setSaving(true);
    try {
      await updateShowcaseCopy(editingId, {
        copy: editCopy,
        tagline: editTagline,
        scent_notes_top: editTop,
        scent_notes_heart: editHeart,
        scent_notes_base: editBase,
      });
      setEditingId(null);
      await fetchItems();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-brand-gold" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif font-bold text-gray-900">Product Showcase</h2>
          <p className="text-sm text-gray-500 mt-1">
            Write sensory copywriting and upload images for the landing page carousel (max 3)
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest">
          <span className={atLimit ? "text-red-500" : "text-brand-gold"}>
            {items.length}
          </span>
          <span className="text-gray-400">/ 3 active</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Add new showcase item */}
      {!atLimit && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-brand-gold text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand-gold/20"
        >
          <Plus size={14} />
          Add Showcase Item
        </button>
      )}

      <AnimatePresence>
        {showForm && !atLimit && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-500">
                  New Showcase Item
                </h3>
                <button onClick={() => { setShowForm(false); setPendingFile(null); setPreviewUrl(null); }}>
                  <X size={16} className="text-gray-400 hover:text-gray-600" />
                </button>
              </div>

              {/* Image upload */}
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2 block">
                  Product Image
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                {previewUrl ? (
                  <div className="relative w-40 h-40 rounded-2xl overflow-hidden border border-gray-100">
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      onClick={() => { setPendingFile(null); setPreviewUrl(null); }}
                      className="absolute top-2 right-2 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-40 h-40 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-brand-gold hover:text-brand-gold transition-colors"
                  >
                    <ImagePlus size={24} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Upload</span>
                  </button>
                )}
              </div>

              {/* Product name */}
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1 block">
                  Product Name
                </label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Royal Oud"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                />
              </div>

              {/* Sensory copy */}
              <div>
                <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1 block">
                  Sensory Copywriting
                </label>
                <textarea
                  value={formCopy}
                  onChange={(e) => setFormCopy(e.target.value)}
                  rows={4}
                  placeholder="Write the sensory marketing copy that will appear beside the product image..."
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                />
              </div>

              {/* Tagline + Scent notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1 block">
                    Tagline
                  </label>
                  <input
                    value={formTagline}
                    onChange={(e) => setFormTagline(e.target.value)}
                    placeholder="e.g. Wear your confidence"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1 block">
                    Top Notes
                  </label>
                  <input
                    value={formTop}
                    onChange={(e) => setFormTop(e.target.value)}
                    placeholder="e.g. Bergamot, Saffron"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1 block">
                    Heart Notes
                  </label>
                  <input
                    value={formHeart}
                    onChange={(e) => setFormHeart(e.target.value)}
                    placeholder="e.g. Rose, Oud"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1 block">
                    Base Notes
                  </label>
                  <input
                    value={formBase}
                    onChange={(e) => setFormBase(e.target.value)}
                    placeholder="e.g. Amber, Musk"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                  />
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => { setShowForm(false); setPendingFile(null); setPreviewUrl(null); }}
                  className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving || !formName.trim() || !formCopy.trim()}
                  className="flex items-center gap-2 bg-brand-gold text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-brand-gold/20 disabled:opacity-50 disabled:hover:scale-100"
                >
                  {saving ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  Create Showcase
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active showcase items */}
      <div className="space-y-4">
        {items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <Sparkles className="mx-auto text-gray-300 mb-4" size={32} />
            <p className="text-sm text-gray-400">
              No showcase items yet. Write sensory copy and upload an image to get started.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
            >
              <div className="flex flex-col md:flex-row">
                {/* Image preview */}
                {item.showcase_image_url && (
                  <div className="md:w-48 h-48 md:h-auto flex-shrink-0">
                    <img
                      src={item.showcase_image_url}
                      alt={item.product_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-serif font-bold text-gray-900">
                        {item.product_name}
                      </h3>
                      {item.tagline && (
                        <p className="text-xs text-brand-gold font-medium italic mt-0.5">
                          {item.tagline}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEditing(item)}
                        className="p-2 rounded-xl text-gray-400 hover:text-brand-gold hover:bg-brand-gold/10 transition-all"
                        title="Edit copy"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => handleRemove(item.id)}
                        className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                        title="Remove from showcase"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                    {item.copy}
                  </p>

                  {/* Scent notes */}
                  {(item.scent_notes_top || item.scent_notes_heart || item.scent_notes_base) && (
                    <div className="flex flex-wrap gap-3 mt-3">
                      {item.scent_notes_top && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                          Top: <span className="text-gray-600">{item.scent_notes_top}</span>
                        </span>
                      )}
                      {item.scent_notes_heart && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                          Heart: <span className="text-gray-600">{item.scent_notes_heart}</span>
                        </span>
                      )}
                      {item.scent_notes_base && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                          Base: <span className="text-gray-600">{item.scent_notes_base}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Edit form (inline) */}
              <AnimatePresence>
                {editingId === item.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-100 overflow-hidden"
                  >
                    <div className="p-6 space-y-4">
                      <div>
                        <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1 block">
                          Sensory Copy
                        </label>
                        <textarea
                          value={editCopy}
                          onChange={(e) => setEditCopy(e.target.value)}
                          rows={4}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1 block">
                            Tagline
                          </label>
                          <input
                            value={editTagline}
                            onChange={(e) => setEditTagline(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1 block">
                            Top Notes
                          </label>
                          <input
                            value={editTop}
                            onChange={(e) => setEditTop(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1 block">
                            Heart Notes
                          </label>
                          <input
                            value={editHeart}
                            onChange={(e) => setEditHeart(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1 block">
                            Base Notes
                          </label>
                          <input
                            value={editBase}
                            onChange={(e) => setEditBase(e.target.value)}
                            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                          />
                        </div>
                      </div>

                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveCopy}
                          disabled={saving}
                          className="flex items-center gap-2 bg-brand-gold text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50"
                        >
                          {saving ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Check size={14} />
                          )}
                          Save
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
