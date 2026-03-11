import React, { useRef, useEffect } from 'react';
import { TextField, InlineStack, Badge, Box } from '@shopify/polaris';

export interface SubtitleLine {
  start: number; // seconds
  end: number;
  text: string;
  uncertain: boolean;
}

interface Props {
  line: SubtitleLine;
  index: number;
  isActive: boolean;
  onChange: (index: number, newText: string) => void;
  onFocus: (start: number) => void;
}

const SubtitleLineEditor: React.FC<Props> = ({ line, index, isActive, onChange, onFocus }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isActive && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActive]);

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div ref={containerRef} style={{ 
        backgroundColor: isActive ? '#f1f8f5' : 'transparent', 
        padding: '8px',
        borderLeft: isActive ? '4px solid #008060' : '4px solid transparent',
        transition: 'background-color 0.3s'
    }}>
      <InlineStack gap="400" align="start" blockAlign="center">
        <div style={{ width: '120px', flexShrink: 0, fontSize: '0.9rem', color: '#6d7175' }} onClick={() => onFocus(line.start)}>
           <div style={{ cursor: 'pointer' }}>{formatTime(line.start)}</div>
           <div style={{ cursor: 'pointer' }}>{formatTime(line.end)}</div>
        </div>
        
        <Box width="100%">
            <TextField
                label="Subtitle text"
                labelHidden
                value={line.text}
                onChange={(value) => onChange(index, value)}
                multiline={2}
                autoComplete="off"
                onFocus={() => onFocus(line.start)}
                suffix={line.uncertain ? <Badge tone="critical">Incert</Badge> : null}
            />
        </Box>
      </InlineStack>
    </div>
  );
};

export default SubtitleLineEditor;
