interface ProcessingStatusProps {
  status: string;
  progress?: number;
  tps?: number;
}

export function ProcessingStatus({ status, progress, tps }: ProcessingStatusProps) {
  return (
    <div className="flex flex-col gap-2 w-full max-w-md">
      <div className="flex justify-between items-center text-sm">
        <span className="text-gray-700 dark:text-gray-300">{status}</span>
        {tps && (
          <span className="text-gray-500 dark:text-gray-400">
            {tps.toFixed(1)} トークン/秒
          </span>
        )}
      </div>
      {typeof progress === 'number' && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
          <div
            className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}