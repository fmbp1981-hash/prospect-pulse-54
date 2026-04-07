import { motion } from "framer-motion";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  animated?: boolean;
  className?: string;
}

export const Logo = ({ size = "md", showText = true, animated = true, className = "" }: LogoProps) => {
  const sizes = {
    sm: "h-8 w-8",
    md: "h-12 w-12",
    lg: "h-16 w-16",
    xl: "h-24 w-24"
  };

  const textSizes = {
    sm: { main: "text-base", sub: "text-[10px]" },
    md: { main: "text-xl", sub: "text-xs" },
    lg: { main: "text-2xl", sub: "text-sm" },
    xl: { main: "text-3xl", sub: "text-base" }
  };

  const LogoImage = animated ? motion.img : "img";

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoImage
        src="/logo.png"
        alt="LeadFinder Pro"
        className={`${sizes[size]} object-contain`}
        {...(animated && {
          initial: { scale: 0.8, opacity: 0 },
          animate: { scale: 1, opacity: 1 },
          whileHover: { scale: 1.05, rotate: 5 },
          transition: { duration: 0.3 }
        })}
      />
      {showText && (
        <div className="flex flex-col">
          <span className={`font-bold ${textSizes[size].main} text-primary leading-none`}>
            LeadFinder
          </span>
          <span className={`${textSizes[size].sub} text-accent font-semibold tracking-wider`}>
            PRO
          </span>
        </div>
      )}
    </div>
  );
};
