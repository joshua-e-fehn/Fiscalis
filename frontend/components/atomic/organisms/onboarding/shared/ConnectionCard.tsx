"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface ConnectionCardProps {
  type: "bank" | "broker" | "crypto";
  name: string;
  accountCount?: number;
  status: "connected" | "error" | "syncing";
  icon?: React.ReactNode;
  className?: string;
}

export function ConnectionCard({
  type,
  name,
  accountCount = 0,
  status,
  icon,
  className,
}: ConnectionCardProps) {
  const statusConfig = {
    connected: {
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      text: "Connected",
    },
    error: {
      icon: AlertCircle,
      color: "text-red-500",
      bg: "bg-red-500/10",
      text: "Error",
    },
    syncing: {
      icon: Loader2,
      color: "text-[#3B82F6]",
      bg: "bg-[#3B82F6]/10",
      text: "Syncing",
    },
  };

  const StatusIcon = statusConfig[status].icon;

  return (
    <motion.div
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl",
        "bg-white/[0.03] border border-white/[0.08]",
        "hover:bg-white/[0.05] transition-colors",
        className,
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
    >
      {/* Icon/Logo */}
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
        {icon || <div className="w-6 h-6 rounded-full bg-white/10" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="text-white font-medium truncate">{name}</h4>
        <p className="text-white/50 text-sm">
          {accountCount} {accountCount === 1 ? "account" : "accounts"}
        </p>
      </div>

      {/* Status */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full",
          statusConfig[status].bg,
        )}
      >
        <StatusIcon
          className={cn(
            "w-4 h-4",
            statusConfig[status].color,
            status === "syncing" && "animate-spin",
          )}
        />
        <span className={cn("text-xs font-medium", statusConfig[status].color)}>
          {statusConfig[status].text}
        </span>
      </div>
    </motion.div>
  );
}

interface ConnectionListProps {
  connections: Array<{
    id: string;
    type: "bank" | "broker" | "crypto";
    name: string;
    accountCount: number;
    status: "connected" | "error" | "syncing";
  }>;
  emptyMessage?: string;
}

export function ConnectionList({
  connections,
  emptyMessage = "No connections yet",
}: ConnectionListProps) {
  if (connections.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-white/40 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {connections.map((connection, index) => (
        <motion.div
          key={connection.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 24,
            delay: index * 0.1,
          }}
        >
          <ConnectionCard {...connection} />
        </motion.div>
      ))}
    </div>
  );
}
