import React from 'react';

interface ImportanceLightsHeaderProps {
  level?: number;
  lightColor?: 'white' | 'red' | 'amber' | 'yellow';
  className?: string;
}

export default function ImportanceLightsHeader({
  level = 3,
  lightColor = 'white',
  className = '',
}: ImportanceLightsHeaderProps) {
  
  let activeFill = '#ffffff';
  let activeStroke = '#ffffff';
  let filterStyle = 'drop-shadow(0 0 4px rgba(255, 255, 255, 0.85)) drop-shadow(0 0 1px #ffffff)';

  if (lightColor === 'red') {
    activeFill = '#ff283b';
    activeStroke = '#ff4d5e';
    filterStyle = 'drop-shadow(0 0 4px rgba(255, 40, 59, 0.9)) drop-shadow(0 0 1.5px #ff283b)';
  } else if (lightColor === 'amber' || lightColor === 'yellow') {
    activeFill = '#f59e0b';
    activeStroke = '#fbbf24';
    filterStyle = 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.85)) drop-shadow(0 0 1.5px #f59e0b)';
  }

  return (
    <div className={`w-full flex items-center gap-1.5 h-[6px] mb-3.5 select-none pointer-events-none ${className}`}>
      {[0, 1, 2, 3, 4].map((index) => {
        const isActive = index < level;
        return (
          <div key={index} className="flex-1 h-full relative">
            <svg
              className="w-full h-full overflow-visible block"
              viewBox="0 0 100 12"
              preserveAspectRatio="none"
            >
              <polygon
                points="6,1 94,1 99,6 94,11 6,11 1,6"
                fill={isActive ? activeFill : 'rgba(255, 255, 255, 0.03)'}
                stroke={isActive ? activeStroke : 'rgba(255, 255, 255, 0.12)'}
                strokeWidth={isActive ? '0.75' : '1'}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={isActive ? { filter: filterStyle } : undefined}
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}
