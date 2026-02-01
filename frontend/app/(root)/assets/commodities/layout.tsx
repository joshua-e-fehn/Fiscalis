"use client";

import * as React from "react";

interface CommoditiesLayoutProps {
  children: React.ReactNode;
}

export default function CommoditiesLayout({
  children,
}: CommoditiesLayoutProps) {
  return <>{children}</>;
}
