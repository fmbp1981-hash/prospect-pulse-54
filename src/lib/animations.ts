/**
 * Framer Motion Animation Variants
 * Following PRD specifications for smooth, accessible animations
 */

export const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      duration: 0.28, 
      ease: "easeOut" 
    } 
  },
  exit: { 
    opacity: 0, 
    y: -8, 
    transition: { 
      duration: 0.2, 
      ease: "easeIn" 
    } 
  }
};

export const buttonHover = {
  scale: 1.03,
  boxShadow: "0 6px 18px rgba(15, 76, 117, 0.12)",
  transition: { duration: 0.12 }
};

export const buttonTap = {
  scale: 0.98,
  transition: { duration: 0.06 }
};

export const tableRowSelect = {
  backgroundColor: "rgba(15, 76, 117, 0.06)",
  transition: { duration: 0.2 }
};

export const slideInFromRight = {
  initial: { x: 320, opacity: 0 },
  animate: { 
    x: 0, 
    opacity: 1, 
    transition: { 
      duration: 0.26, 
      ease: "easeOut" 
    } 
  },
  exit: { 
    x: 320, 
    opacity: 0, 
    transition: { 
      duration: 0.2, 
      ease: "easeIn" 
    } 
  }
};

export const slideInFromBottom = {
  initial: { y: 24, opacity: 0 },
  animate: { 
    y: 0, 
    opacity: 1, 
    transition: { 
      duration: 0.22, 
      ease: "easeOut" 
    } 
  },
  exit: { 
    y: 24, 
    opacity: 0, 
    transition: { 
      duration: 0.16, 
      ease: "easeIn" 
    } 
  }
};

export const overlayFade = {
  initial: { opacity: 0 },
  animate: { 
    opacity: 0.5, 
    transition: { duration: 0.18 } 
  },
  exit: { 
    opacity: 0, 
    transition: { duration: 0.16 } 
  }
};

export const scaleIn = {
  initial: { scale: 0.95, opacity: 0 },
  animate: { 
    scale: 1, 
    opacity: 1, 
    transition: { 
      duration: 0.2, 
      ease: "easeOut" 
    } 
  },
  exit: { 
    scale: 0.95, 
    opacity: 0, 
    transition: { 
      duration: 0.15, 
      ease: "easeIn" 
    } 
  }
};

export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.05
    }
  }
};

export const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.25 } 
  }
};

// For accessibility - disable animations if user prefers reduced motion
export const getMotionConfig = () => {
  const prefersReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false;

  return {
    initial: prefersReducedMotion ? false : undefined,
    animate: prefersReducedMotion ? false : undefined,
    exit: prefersReducedMotion ? false : undefined,
  };
};
