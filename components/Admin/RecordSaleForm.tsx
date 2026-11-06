/* filepath: components/Admin/RecordSaleForm.tsx */
"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function RecordSaleForm() {
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Add logic here to interact with lib/inventoryLogic.ts
    setTimeout(() => setLoading(false), 1000);
  };

  return (
    <Card className="border-brand-gold/20 shadow-xl bg-white max-w-2xl mx-auto">
      <CardHeader className="bg-brand-softGray/50 border-b border-gray-100">
        <CardTitle className="text-xl font-serif text-gray-900">Record New Sale</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Outlet Selection */}
            <div className="space-y-2">
              <Label htmlFor="outlet">Source Outlet</Label>
              <Select required>
                <SelectTrigger className="border-gray-200">
                  <SelectValue placeholder="Select Outlet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unilorin">Unilorin Branch</SelectItem>
                  <SelectItem value="tanke">Tanke Branch</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Shelf/Grade Selection */}
            <div className="space-y-2">
              <Label htmlFor="shelf">Shelf Category</Label>
              <Select required>
                <SelectTrigger className="border-gray-200">
                  <SelectValue placeholder="Select Grade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="special">Special Goods</SelectItem>
                  <SelectItem value="extra">Extra Goods</SelectItem>
                  <SelectItem value="normal">Normal Goods</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="product">Product Name</Label>
            <Input id="product" placeholder="Search product..." className="border-gray-200" required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="qty">Quantity</Label>
              <Input id="qty" type="number" min="1" defaultValue="1" className="border-gray-200" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Sale Price (₦)</Label>
              <Input id="price" type="number" placeholder="Override price if needed" className="border-gray-200" />
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={loading}
            className="w-full bg-gold-gradient text-white py-6 rounded-xl font-bold shadow-lg shadow-brand-gold/20 hover:scale-[1.02] transition-all"
          >
            {loading ? "Processing..." : "Confirm & Settle Sale"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}