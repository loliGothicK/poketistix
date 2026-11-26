"use client";

import NextLink from "next/link";
import React, { ComponentProps, createContext, useContext, type ReactNode } from "react";

const LangContext = createContext<string>("en");

export function LangProvider({
  lang,
  children,
}: {
  readonly lang: string;
  readonly children: ReactNode;
}) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function LocalizedLink({ href, ...props }: ComponentProps<typeof NextLink>) {
  const lang = useContext(LangContext) || "en";

  let localizedHref = href;
  if (typeof href === "string") {
    // If it's an absolute internal path, prefix with lang
    if (href.startsWith("/") && !href.startsWith(`/${lang}/`) && href !== `/${lang}`) {
      localizedHref = `/${lang}${href === "/" ? "" : href}`;
    }
  } else if (href && typeof href === "object" && href.pathname) {
    if (
      href.pathname.startsWith("/") &&
      !href.pathname.startsWith(`/${lang}/`) &&
      href.pathname !== `/${lang}`
    ) {
      localizedHref = {
        ...href,
        pathname: `/${lang}${href.pathname === "/" ? "" : href.pathname}`,
      };
    }
  }

  return <NextLink href={localizedHref} {...props} />;
}
