'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface NavLinkProps {
  href: string;
  className?: string;
  activeClassName?: string;
  children: ReactNode;
}

export function NavLink({ 
  href, 
  className, 
  activeClassName = "bg-sidebar-accent text-sidebar-accent-foreground", 
  children,
}: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={cn(className, isActive && activeClassName)}
    >
      {children}
    </Link>
  );
}
