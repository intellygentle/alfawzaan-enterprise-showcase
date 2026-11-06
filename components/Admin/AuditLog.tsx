/* filepath: components/Admin/AuditLog.tsx */
"use client";

import { motion } from "framer-motion";

interface AuditLogProps {
  logs?: any[];
}

export default function AuditLog({ logs = [] }: AuditLogProps) {
  const displayLogs = logs.length > 0 ? logs : [
    { id: 1, action: "SALE", item: "Oud Touch", details: "1x Special Shelf (Unilorin)", time: "10 mins ago" },
    { id: 2, action: "PRICE_SYNC", item: "Body Sprays", details: "Bulk update to ₦5,000", time: "1 hour ago" },
    { id: 3, action: "ADJUSTMENT", item: "Naseem Oil", details: "Manual restock +10 Extra", time: "2 hours ago" },
  ];

  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
      <h3 className="font-bold text-gray-900 mb-4">Enterprise Activity Logs</h3>
      <div className="space-y-4">
        {displayLogs.map((log, i) => (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            key={log.id} 
            className="flex items-center justify-between border-l-4 border-brand-gold pl-4 py-1"
          >
            <div>
              <p className="text-sm font-bold text-gray-800">{log.action}: {log.product_name || log.item}</p>
              <p className="text-xs text-gray-500">{log.details}</p>
            </div>
            <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded">
              {log.created_at ? new Date(log.created_at).toLocaleTimeString() : log.time}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}