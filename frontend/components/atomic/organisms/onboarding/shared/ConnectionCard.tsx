"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Loader2, Clock } from "lucide-react";

/** retrying: a provider hiccup the next sync retries; not the user's to fix */
export type ConnectionCardStatus = "connected" | "error" | "syncing" | "retrying";

interface ConnectionCardProps {
  type: "bank" | "broker" | "crypto";
  name: string;
  accountCount?: number;
  status: ConnectionCardStatus;
  icon?: React.ReactNode;
  className?: string;
}

export function ConnectionCard({
  name,
  accountCount = 0,
  status,
  icon,
  className,
}: ConnectionCardProps) {
  const t = useTranslations("onboarding.shared");
  const tStatus = useTranslations("integrations.status");
  const statusConfig = {
    connected: {
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      text: tStatus("connected"),
    },
    error: {
      icon: AlertCircle,
      color: "text-red-500",
      bg: "bg-red-500/10",
      text: tStatus("error"),
    },
    syncing: {
      icon: Loader2,
      color: "text-[#3B82F6]",
      bg: "bg-[#3B82F6]/10",
      text: tStatus("syncing"),
    },
    retrying: {
      icon: Clock,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      text: tStatus("retrying"),
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
          {t("accounts", { count: accountCount })}
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
    status: ConnectionCardStatus;
  }>;
  emptyMessage?: string;
}

export function ConnectionList({
  connections,
  emptyMessage,
}: ConnectionListProps) {
  const t = useTranslations("onboarding.shared");
  if (connections.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-white/40 text-sm">{emptyMessage ?? t("noConnections")}</p>
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
