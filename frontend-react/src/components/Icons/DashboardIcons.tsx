// ========================================
// DASHBOARD ICONS - Deprecato
// Usa AssessmentIcons.tsx invece
// File mantenuto per retrocompatibilità
// ========================================

// Re-export da AssessmentIcons per compatibilità
export {
  DashboardIcon,
  AssessmentListIcon,
  MoneyBagIcon,
  ToolsIcon,
  CalendarIcon,
  StatsIcon,
  RefreshIcon,
  LaunchIcon,
  CopyIcon,
  ServerIcon,
  ChartIcon,
  DatabaseIcon,
  LightningIcon,
  EyeIcon,
  DeleteIcon
} from './AssessmentIcons';

// Alias per icone con naming diverso
export { MoneyBagIcon as PaymentIcon } from './AssessmentIcons';
export { HistoryIcon as ClockIcon } from './AssessmentIcons';
export { UserIcon as UsersIcon } from './AssessmentIcons';
export { DocumentIcon as FileTextIcon } from './AssessmentIcons';
export { SettingsIcon } from './AssessmentIcons';
export { InfoIcon as BellIcon } from './AssessmentIcons';
export { FilterIcon as SearchIcon } from './AssessmentIcons';
export { FilterIcon } from './AssessmentIcons';
export { DownloadIcon } from './AssessmentIcons';

// Icone uniche (non duplicate)
import Icon from '../Icon';

interface IconProps {
  size?: 'small' | 'medium' | 'large' | 'xl';
}

export const UploadIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>
    </svg>
  </Icon>
);

export const TrendingUpIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>
    </svg>
  </Icon>
);

export const MinusIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M19 13H5v-2h14v2z"/>
    </svg>
  </Icon>
);

export const CheckIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
    </svg>
  </Icon>
);

export const CloseIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>
  </Icon>
);

export const ArrowRightIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
    </svg>
  </Icon>
);

export const ArrowLeftIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
    </svg>
  </Icon>
);

export const ArrowUpIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
    </svg>
  </Icon>
);

export const ArrowDownIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
    </svg>
  </Icon>
);

export const WarningIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
    </svg>
  </Icon>
);

export const ErrorIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
    </svg>
  </Icon>
);

export const SuccessIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    </svg>
  </Icon>
);
