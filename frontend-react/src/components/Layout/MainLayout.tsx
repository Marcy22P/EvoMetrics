import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import SidebarNew from './SidebarNew';
import { AnimatedBackground } from '../UI/AnimatedBackground';
import './MainLayout.css';

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };

  return (
    <div className="main-layout">
      <AnimatedBackground />
      <SidebarNew collapsed={collapsed} onToggle={toggleSidebar} />
      <div className={`layout-content ${collapsed ? 'expanded' : ''}`}>
        <div className="content-container">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default MainLayout;

