"use client";

import * as React from "react";

interface CollectiblesLayoutProps {
  children: React.ReactNode;
}

export default function CollectiblesLayout({
  children,
}: CollectiblesLayoutProps) {
  return <>{children}</>;
}
