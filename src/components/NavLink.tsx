import { Link, LinkProps, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface NavLinkProps extends LinkProps {
  activeClassName?: string;
}

export function NavLink({ 
  to, 
  className, 
  activeClassName = "bg-sidebar-accent text-sidebar-accent-foreground", 
  children, 
  ...props 
}: NavLinkProps) {
  const location = useLocation();
  
  // Safely compare pathname - handle both string and object 'to' prop
  const toPath = typeof to === 'string' ? to : to.pathname || '';
  const isActive = location.pathname === toPath;

  return (
    <Link
      to={to}
      className={cn(className, isActive && activeClassName)}
      {...props}
    >
      {children}
    </Link>
  );
}
