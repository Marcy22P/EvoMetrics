import React from 'react';
import './Icon.css';

interface IconProps {
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large' | 'xl';
  className?: string;
}

const Icon: React.FC<IconProps> = ({ children, size = 'medium', className = '' }) => {
  return (
    <div className={`icon icon-${size} ${className}`}>
      {children}
    </div>
  );
};

export default Icon;
