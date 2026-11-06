/* filepath: components/Admin/ExecutiveMetrics.tsx */
"use client";

import { motion } from "framer-motion";
import { Banknote, Package, AlertTriangle, TrendingUp } from "lucide-react";

interface ExecutiveMetricsProps {
  totalValue: number;
  totalItems: number;
  lowStockCount: number;
  pendingOrders: number;
}

export default function ExecutiveMetrics({ totalValue, totalItems, lowStockCount, pendingOrders }: ExecutiveMetricsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
      <MetricCard 
        label="Total Inventory Value" 
        value={`₦${totalValue.toLocaleString()}`} 
        icon={<Banknote size={24} />} 
      />
      <MetricCard 
        label="Items in Stock" 
        value={totalItems.toLocaleString()} 
        icon={<Package size={24} />} 
      />
      <MetricCard 
        label="Pending Orders" 
        value={pendingOrders.toString()} 
        icon={<AlertTriangle size={24} />} 
        alert={pendingOrders > 0}
      />
      <MetricCard 
        label="Low Stock Alerts" 
        value={lowStockCount.toString()} 
        icon={<TrendingUp size={24} />}
        alert={lowStockCount > 0}
      />
    </div>
  );
}

function MetricCard({ label, value, icon, trend, alert }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white p-6 rounded-2xl border shadow-sm hover:border-brand-gold transition-all ${
        alert ? 'border-red-200 bg-red-50' : 'border-gray-100'
      }`}
    >
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${alert ? 'bg-red-100 text-red-500' : 'bg-brand-softGray text-brand-gold'}`}>
          {icon}
        </div>
        {trend && (
          <span className="text-xs font-bold text-green-500 bg-green-50 px-2 py-1 rounded-lg flex items-center">
            <TrendingUp size={12} className="mr-1" /> {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <h3 className={`text-2xl font-bold ${alert ? 'text-red-500' : 'text-gray-900'}`}>{value}</h3>
      </div>
    </motion.div>
  );
}