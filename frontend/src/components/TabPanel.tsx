import { Box } from '@mui/material';
import type { ReactNode } from 'react';

export type TabPanelProps = {
  children?: ReactNode;
  index: number;
  value: number;
};

/**
 * MUI Tabs companion: shows children only when `value === index`.
 */
export function TabPanel(props: Readonly<TabPanelProps>) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}
