// ========================================
// MODERN ICONS - Sistema Unificato
// Usa Icon wrapper per dimensioni consistenti
// ========================================

import Icon from '../Icon';

// Import per re-export e default object
import {
  UserIcon,
  BuildingIcon,
  GlobeIcon,
  TargetIcon,
  ChartIcon,
  DocumentIcon,
  FolderIcon,
  EyeIcon,
  EditIcon,
  DeleteIcon,
  EmailIcon,
  PhoneIcon,
  CalendarIcon,
  SettingsIcon,
  DollarIcon,
  ShoppingIcon,
  RocketIcon,
  FlashIcon,
  CheckmarkIcon,
  InfoIcon,
  NotesIcon,
  ListIcon,
  LightningIcon,
  DownloadIcon,
  PrintIcon,
  PlusIcon,
  HistoryIcon,
  BarChartIcon,
  MegaphoneIcon,
  BusinessIcon,
  MoneyIcon
} from './AssessmentIcons';

interface IconProps {
  size?: 'small' | 'medium' | 'large' | 'xl';
}

// Icone aggiuntive specifiche
export const ArrowLeftIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z"/>
  </svg>
  </Icon>
);

export const ArrowRightIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z"/>
  </svg>
  </Icon>
);

export const FilterIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M14,12V19.88C14.04,20.18 13.94,20.5 13.71,20.71C13.32,21.1 12.69,21.1 12.3,20.71L10.29,18.7C10.06,18.47 9.96,18.16 10,17.87V12H9.97L4.21,4.62C3.87,4.19 3.95,3.56 4.38,3.22C4.57,3.08 4.78,3 5,3V3H19V3C19.22,3 19.43,3.08 19.62,3.22C20.05,3.56 20.13,4.19 19.79,4.62L14.03,12H14Z"/>
  </svg>
  </Icon>
);

export const ChevronLeftIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M15.41,7.41L14,6L8,12L14,18L15.41,16.59L10.83,12L15.41,7.41Z"/>
  </svg>
  </Icon>
);

export const ChevronDownIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z"/>
  </svg>
  </Icon>
);

export const ChevronRightIcon = ({ size = 'medium' }: IconProps) => (
  <Icon size={size}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <path fill="currentColor" d="M8.59,16.59L10,18L16,12L10,6L8.59,7.41L13.17,12L8.59,16.59Z"/>
  </svg>
  </Icon>
);

// Re-export icone comuni
export {
  UserIcon,
  BuildingIcon,
  GlobeIcon,
  TargetIcon,
  ChartIcon,
  DocumentIcon,
  FolderIcon,
  EyeIcon,
  EditIcon,
  DeleteIcon as TrashIcon,
  EmailIcon,
  PhoneIcon,
  CalendarIcon,
  SettingsIcon,
  DollarIcon,
  ShoppingIcon,
  RocketIcon,
  FlashIcon,
  CheckmarkIcon,
  InfoIcon,
  NotesIcon,
  ListIcon,
  LightningIcon,
  DownloadIcon,
  PrintIcon,
  PlusIcon,
  HistoryIcon,
  BarChartIcon,
  MegaphoneIcon,
  BusinessIcon,
  MoneyIcon
};

// Alias per compatibilità con naming diverso
export { EmailIcon as MailIcon } from './AssessmentIcons';

// Default export per compatibilità
export default {
  UserIcon,
  BuildingIcon,
  GlobeIcon,
  TargetIcon,
  ChartIcon,
  DocumentIcon,
  FolderIcon,
  EyeIcon,
  EditIcon,
  MailIcon: EmailIcon,
  PhoneIcon,
  CalendarIcon,
  SettingsIcon,
  DollarIcon,
  ShoppingIcon,
  RocketIcon,
  FlashIcon,
  CheckmarkIcon,
  InfoIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  FilterIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon
};
