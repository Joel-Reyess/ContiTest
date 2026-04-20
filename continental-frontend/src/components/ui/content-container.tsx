import type { ReactNode } from 'react';

export interface ContentContainerProps {
  children: ReactNode;
  title?: string;
  className?: string;
  bordered?: boolean;
  padding?: string;
  maxWidth?: string;
}

export const ContentContainer = ({
  children,
  title,
  className = "",
  bordered = true,
  padding = "p-6",
}: ContentContainerProps) => {
  const borderClass = bordered
    ? "border border-continental-gray-3 rounded-md bg-white shadow-industrial-sm"
    : "";

  return (
    <div className={`${borderClass} ${padding} ${className}`}>
      {title && (
        <div className="mb-5 pb-3 border-b border-continental-gray-3">
          <h3 className="text-lg font-bold tracking-tight text-continental-black">
            {title}
          </h3>
        </div>
      )}
      {children}
    </div>
  );
};