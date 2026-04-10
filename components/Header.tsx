'use client';

interface HeaderProps {
  isOffline: boolean;
}

export default function Header({ isOffline }: HeaderProps) {
  return (
    <header className="safe-top bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-lg">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Logo + Title */}
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏥</span>
          <div>
            <h1 className="text-lg font-bold leading-tight">Pharma Voice</h1>
            <p className="text-[10px] uppercase tracking-wider text-blue-200">
              AI Assistant
            </p>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full ${
              isOffline ? 'bg-red-400' : 'bg-green-400'
            }`}
          />
          <span className="text-xs text-blue-100">
            {isOffline ? 'Offline' : 'Online'}
          </span>
        </div>
      </div>
    </header>
  );
}
