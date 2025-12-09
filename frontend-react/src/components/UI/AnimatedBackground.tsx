import React from 'react';
import { motion } from 'framer-motion';
import './AnimatedBackground.css';

export const AnimatedBackground: React.FC = () => {
  return (
    <div className="ab-container">
        {/* Grid Pattern overlay */}
        <div className="ab-grid" />

        {/* Floating Orbs */}
        <motion.div 
            className="ab-blob blob-1"
            animate={{ 
                x: [0, 100, 0], 
                y: [0, 50, 0],
                scale: [1, 1.1, 1]
            }}
            transition={{ 
                duration: 20, 
                repeat: Infinity, 
                ease: "easeInOut" 
            }}
        />
        
        <motion.div 
            className="ab-blob blob-2"
            animate={{ 
                x: [0, -70, 0], 
                y: [0, 80, 0],
                scale: [1, 1.2, 1]
            }}
            transition={{ 
                duration: 25, 
                repeat: Infinity, 
                ease: "easeInOut",
                delay: 2
            }}
        />

        <motion.div 
            className="ab-blob blob-3"
            animate={{ 
                x: [0, 50, 0], 
                y: [0, -50, 0],
                opacity: [0.2, 0.4, 0.2]
            }}
            transition={{ 
                duration: 18, 
                repeat: Infinity, 
                ease: "easeInOut",
                delay: 5
            }}
        />
    </div>
  );
};





