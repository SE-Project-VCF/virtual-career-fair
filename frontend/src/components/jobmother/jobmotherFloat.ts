import { keyframes } from "@mui/material/styles"

/** Gentle vertical float — shared by the teaser mascot and Fairy Jobmother page */
export const jobmotherFloat = keyframes`
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
`
