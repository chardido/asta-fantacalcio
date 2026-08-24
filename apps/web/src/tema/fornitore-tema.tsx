"use client";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import type { ReactNode } from "react";

import { tema } from "./tema";

export interface FornitoreTemaProps {
  readonly children: ReactNode;
}

export function FornitoreTema({ children }: FornitoreTemaProps) {
  return (
    <MantineProvider
      defaultColorScheme="dark"
      forceColorScheme="dark"
      theme={tema}
    >
      <Notifications position="top-right" />
      {children}
    </MantineProvider>
  );
}
