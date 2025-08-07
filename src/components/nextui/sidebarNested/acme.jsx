// src/components/nextui/sidebarNested/acme.jsx
export const AcmeLogo = ({ className = "", ...props }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={cn("w-4 h-4", className)}
    {...props}
  >
    <path
      fill="currentColor"
      d="M12 0L24 24H0L12 0zM12 7L6 18h12L12 7z"
    />
  </svg>
);

import { cn } from "./cn";
