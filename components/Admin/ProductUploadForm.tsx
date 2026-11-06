"use client";
import { useState, useRef, useEffect } from "react";
import { fetchCategories } from "@/app/actions/getCategories";
import { motion } from "framer-motion";
import {
  Upload,
  Image as ImageIcon,
  Check,
  AlertCircle,
  RefreshCw,
  Package,
  Info,
} from "lucide-react";
import {
  createProduct,
  updateProduct,
  deleteProduct,
  findProductByName,
} from "@/lib/master/catalog";
import { upsertInventory } from "@/lib/outlets/inventory";
import { syncGlobalPrice, uploadProductImageAction } from "@/app/admin/dashboard/actions";

// Default fallback if DB categories aren't loaded yet
const FALLBACK_CATEGORIES = ["100MLs", "50MLs", "30MLs", "Miniatures", "Naseem Oils", "Oils", "Body Sprays", "Body Mists", "Roll-ons", "Gift Sets", "Home Fragrance", "Bakhoor & Incense", "Traditional Wear", "Islamic Materials", "Self Care", "Accessories"];
const GRADES = ["special", "extra", "normal"] as const;
const OUTLETS = ["unilorin", "tanke"] as const;

interface ProductUploadFormProps {
  onSuccess?: () => void;
}

export default function ProductUploadForm({ onSuccess }: ProductUploadFormProps) {
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
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

  // Step 1: Product Details
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");

  // Step 2: Image + Inventory
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inventory, setInventory] = useState<Record<string, { qty: string }>>(
    {}
  );

  const getInvKey = (outlet: string, grade: string) => `${outlet}-${grade}`;

  const handleInvChange = (outlet: string, grade: string, value: string) => {
    const key = getInvKey(outlet, grade);
    setInventory((prev) => ({ ...prev, [key]: { qty: value } }));
  };

  const handleImageSelect = (file: File) => {
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const hasAnyInventory = () => {
    for (const outlet of OUTLETS) {
      for (const grade of GRADES) {
        const key = getInvKey(outlet, grade);
        const qty = parseInt(inventory[key]?.qty || "0", 10);
        if (qty > 0) return true;
      }
    }
    return false;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    let createdProduct: any = null;

    try {
      // ─── 1. Check if product with same name exists ───
      const trimmedName = name.trim();
      const existingProduct = await findProductByName(trimmedName);

      let productId: string;
      let isNewProduct = false;

      if (existingProduct) {
        // Product already exists — reuse its ID and update metadata
        productId = existingProduct.id;
        await updateProduct(productId, {
          category,
          description: description.trim() || existingProduct.description,
        });
        const enteredPrice = parseInt(price, 10);
        if (Number.isFinite(enteredPrice) && enteredPrice >= 0 && enteredPrice !== Number(existingProduct.price ?? 0)) {
          await syncGlobalPrice(productId, enteredPrice, "admin-product-upload");
        }
      } else {
        // Create new product in Master DB
        const product = await createProduct({
          name: trimmedName,
          category,
          description: description.trim() || undefined,
          price: parseInt(price, 10) || 0,
        });
        productId = product.id;
        isNewProduct = true;
        createdProduct = product;
      }

      // ─── 2. Upload image if provided ───
      if (imageFile) {
        const formData = new FormData();
        formData.append("productId", productId);
        formData.append("file", imageFile);
         await uploadProductImageAction(productId, formData);
      }

      // ─── 3. Create inventory entries per outlet (skip empty ones) ───
      const globalPrice = parseInt(price, 10) || 0;
      for (const outlet of OUTLETS) {
        const outletInv = [];
        for (const grade of GRADES) {
          const key = getInvKey(outlet, grade);
          const inv = inventory[key];
          const qty = parseInt(inv?.qty || "0", 10);
          if (qty > 0) {
            outletInv.push({
              product_id: productId,
              grade,
              quantity: qty,
              price: globalPrice,
            });
          }
        }

        if (outletInv.length > 0) {
          await upsertInventory(
            outlet as "unilorin" | "tanke",
            outletInv,
            "admin-id",
            undefined,
            isNewProduct ? "Initial stock" : "Stock increase via upload"
          );
        }
      }

      setSuccess(true);

      setTimeout(() => {
        onSuccess?.();
        // Reset form
        setName("");
        setCategory("");
        setDescription("");
        setPrice("");
        setInventory({});
        setImageFile(null);
        setPreviewUrl("");
        setStep(1);
        setSuccess(false);
        setError("");
      }, 2000);
    } catch (err: any) {
      // Best-effort cleanup if product was created but later steps failed
      if (createdProduct?.id) {
        try {
          await deleteProduct(createdProduct.id);
        } catch {
          /* ignore cleanup errors */
        }
      }
      setError(err?.message || "Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-12"
      >
        <Check className="text-green-500 mx-auto" size={32} />
        <h3 className="text-xl font-bold mt-4">Product Uploaded!</h3>
        <p className="text-gray-500 mt-2">
          It will appear on the storefront shortly.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Progress Steps */}
      <div className="flex gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex-1 h-2 rounded-full transition-colors ${
              s <= step ? "bg-brand-gold" : "bg-gray-100"
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3 text-red-600 text-sm">
          <AlertCircle size={18} />
          <span className="font-medium">{error}</span>
        </div>
      )}

      {/* STEP 1: Product Details + Global Price */}
      {step === 1 && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <div>
            <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2 block">
              Product Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Oud Touch"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-brand-gold transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2 block">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-brand-gold transition-colors"
            >
              <option value="">Select category...</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Product description..."
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-brand-gold transition-colors resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-widest text-gray-500 mb-2 block">
              Global Price (₦)
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. 15000"
              min="0"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-brand-gold transition-colors"
            />
            <p className="text-[10px] text-gray-400 mt-1.5">
              This price applies to all locations and shelf grades.
            </p>
          </div>

          <button
            onClick={() => {
              if (!name.trim() || !category || !price.trim()) {
                setError("Name, category, and price are required");
                return;
              }
              if (parseInt(price, 10) <= 0) {
                setError("Price must be greater than 0");
                return;
              }
              setError("");
              setStep(2);
            }}
            className="w-full bg-brand-gold text-white py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] transition-all"
          >
            Next: Image & Inventory
          </button>
        </motion.div>
      )}

      {/* STEP 2: Single Image + Inventory Quantities */}
      {step === 2 && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          {/* Single Image Upload */}
          <div className="bg-gray-50 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">
              Product Image
            </h3>
            <p className="text-xs text-gray-500">
              One image is used across all locations and shelf grades.
            </p>

            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageSelect(file);
              }}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className={`w-full flex items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed transition-all ${
                imageFile
                  ? "border-brand-gold bg-brand-gold/5"
                  : "border-gray-200 hover:border-brand-gold/50"
              }`}
            >
              {imageFile ? (
                <div className="flex items-center gap-4">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                  <div className="text-left">
                    <p className="text-xs font-bold text-gray-900">
                      {imageFile.name}
                    </p>
                    <p className="text-[10px] text-green-500 font-bold">
                      Click to change image
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 py-4">
                  <ImageIcon size={24} className="text-gray-400" />
                  <div className="text-center">
                    <p className="text-xs font-bold text-gray-900">
                      Upload Product Image
                    </p>
                    <p className="text-[10px] text-gray-400">
                      Click to select (max 5MB)
                    </p>
                  </div>
                </div>
              )}
            </button>
          </div>

          {/* Inventory Quantities Only */}
          {OUTLETS.map((outlet) => (
            <div
              key={outlet}
              className="bg-gray-50 rounded-2xl p-6 space-y-4"
            >
              <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">
                {outlet === "unilorin" ? "Unilorin" : "Tanke"} Branch — Quantities
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {GRADES.map((grade) => {
                  const key = getInvKey(outlet, grade);
                  return (
                    <div
                      key={grade}
                      className="bg-white rounded-xl p-4 border border-gray-100"
                    >
                      <p className="text-[10px] font-black uppercase tracking-widest text-brand-gold mb-3">
                        {grade}
                      </p>
                      <input
                        type="number"
                        placeholder="Qty"
                        min="0"
                        value={inventory[key]?.qty || ""}
                        onChange={(e) =>
                          handleInvChange(outlet, grade, e.target.value)
                        }
                        className="w-full bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-brand-gold"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {!hasAnyInventory() && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-3 rounded-xl text-xs">
              <Info size={16} />
              <span className="font-medium">
                You haven&apos;t added any inventory yet. The product will be created but won&apos;t appear in the store until stock is added.
              </span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 bg-gray-100 text-gray-600 py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-1 bg-brand-gold text-white py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] transition-all"
            >
              Next: Review
            </button>
          </div>
        </motion.div>
      )}

      {/* STEP 3: Review & Submit */}
      {step === 3 && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          <div className="bg-gray-50 rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">
              Review Product
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Name</span>
                <span className="font-bold text-gray-900">{name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Category</span>
                <span className="font-bold text-gray-900">{category}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Global Price</span>
                <span className="font-bold text-brand-gold">
                  ₦{parseInt(price || "0", 10).toLocaleString()}
                </span>
              </div>
              {imageFile && (
                <div className="flex justify-between text-sm items-center">
                  <span className="text-gray-500">Image</span>
                  <img
                    src={previewUrl}
                    alt=""
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                </div>
              )}
            </div>

            <div className="border-t border-gray-200 pt-4 space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-gray-900">
                Inventory Summary
              </p>
              {OUTLETS.map((outlet) => {
                const outletItems = GRADES.map((grade) => {
                  const key = getInvKey(outlet, grade);
                  return { grade, qty: parseInt(inventory[key]?.qty || "0", 10) };
                }).filter((i) => i.qty > 0);

                if (outletItems.length === 0) return null;

                return (
                  <div key={outlet} className="text-sm">
                    <p className="font-bold text-gray-700 capitalize mb-1">
                      {outlet}
                    </p>
                    <div className="flex gap-3">
                      {outletItems.map((item) => (
                        <span
                          key={item.grade}
                          className="text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-100"
                        >
                          {item.grade}:{" "}
                          <span className="font-bold text-gray-900">{item.qty}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="flex-1 bg-gray-100 text-gray-600 py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 bg-brand-gold text-white py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  >
                    <RefreshCw size={16} />
                  </motion.div>
                  Publishing...
                </>
              ) : (
                <>
                  <Package size={16} />
                  Publish Product
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
