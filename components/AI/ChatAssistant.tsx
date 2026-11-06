/* filepath: components/AI/ChatAssistant.tsx */
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";

export default function ChatAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white w-[350px] h-[500px] rounded-3xl shadow-2xl border border-brand-gold/20 flex flex-col overflow-hidden mb-4"
          >
            {/* Header */}
            <div className="bg-gold-gradient p-4 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Sparkles size={18} />
                <span className="font-bold tracking-wide">Noor Assistant</span>
              </div>
              <button onClick={() => setIsOpen(false)}><X size={20} /></button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 p-4 overflow-y-auto bg-brand-softGray/30 space-y-4">
              <div className="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm border border-gray-100 max-w-[80%]">
                <p className="text-sm text-gray-700">
                  Welcome to Alfawzaan’s! I can help you find the perfect perfume or explain our Islamic materials. What are you looking for today?
                </p>
              </div>
            </div>

            {/* Input */}
            <div className="p-4 bg-white border-t border-gray-100 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Noor anything..."
                className="flex-1 bg-brand-softGray border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-brand-gold outline-none"
              />
              <button className="bg-brand-gold text-white p-2 rounded-xl">
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gold-gradient p-4 rounded-full text-white shadow-xl shadow-brand-gold/30 flex items-center justify-center"
      >
        <MessageCircle size={28} />
      </motion.button>
    </div>
  );
}