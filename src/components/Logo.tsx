import { motion } from "framer-motion";
import logoImg from "/logo.png";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  animated?: boolean;
}

export const Logo = ({ size = "md", showText = true, animated = true }: LogoProps) => {
  const sizes = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-16 w-16"
  };

  const LogoImage = animated ? motion.img : "img";

  return (
    <div className="flex items-center gap-3">
      <LogoImage
        src={logoImg}
        alt="LeadFinder Pro"
        className={sizes[size]}
        {...(animated && {
          initial: { scale: 0.8, opacity: 0 },
          animate: { scale: 1, opacity: 1 },
          whileHover: { scale: 1.05, rotate: 5 },
          transition: { duration: 0.3 }
        })}
      />
      {showText && (
        <div className="flex flex-col">
          <span className="font-bold text-lg text-primary leading-none">LeadFinder</span>
          <span className="text-xs text-success font-semibold">Pro</span>
        </div>
      )}
    </div>
  );
};
