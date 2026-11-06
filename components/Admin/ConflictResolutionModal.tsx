/* filepath: components/Admin/ConflictResolutionModal.tsx */
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button"; // Run: npx shadcn@latest add button
import { AlertCircle, ArrowRightLeft } from "lucide-react";

interface ConflictProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  requestedShelf: string;
  availableAlternates: string[];
  onResolve: (newShelf: string) => void;
}

export default function ConflictResolutionModal({
  isOpen,
  onClose,
  productName,
  requestedShelf,
  availableAlternates,
  onResolve,
}: ConflictProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] border-brand-gold/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle size={20} />
            Stock Conflict Detected
          </DialogTitle>
          <DialogDescription className="py-2">
            The <strong>{productName}</strong> is out of stock on the <span className="text-brand-gold font-bold">{requestedShelf}</span> shelf.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-brand-softGray p-4 rounded-xl space-y-3">
          <p className="text-sm font-medium text-gray-700">Would you like to deduct from an alternative shelf instead?</p>
          <div className="flex flex-col gap-2">
            {availableAlternates.map((shelf) => (
              <Button
                key={shelf}
                variant="outline"
                className="justify-between border-brand-gold/20 hover:border-brand-gold hover:bg-brand-gold/5"
                onClick={() => onResolve(shelf)}
              >
                Use {shelf} Stock
                <ArrowRightLeft size={16} className="text-brand-gold" />
              </Button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel Transaction</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}