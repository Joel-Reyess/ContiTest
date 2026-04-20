import type { ReactNode } from 'react';

export interface TabConfig {
  key: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
}

export interface TabContainerProps {
  tabs: TabConfig[];
  activeTab: string;
  onTabChange: (tabKey: string) => void;
  className?: string;
}

export const TabContainer = ({
  tabs,
  activeTab,
  onTabChange,
  className = ""
}: TabContainerProps) => {
  const activeTabContent = tabs.find(tab => tab.key === activeTab)?.content;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Tab Buttons */}
      <div className="border-b border-continental-gray-3 w-full">
        <div className="flex w-full -mb-px">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={`flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold tracking-tight transition-colors w-1/2 border-b-2 cursor-pointer ${
                  isActive
                    ? 'border-continental-yellow text-continental-black'
                    : 'border-transparent text-continental-gray-1 hover:text-continental-black hover:border-continental-gray-3'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTabContent}
      </div>
    </div>
  );
};