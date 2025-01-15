import { WhisperChunk } from '@/types/whisper';
import { useEffect, useRef } from 'react';

interface TranscriptionDisplayProps {
  chunks: WhisperChunk[];
  isProcessing: boolean;
}

export function TranscriptionDisplay({ chunks, isProcessing }: TranscriptionDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 新しいチャンクが追加されたら自動スクロール
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [chunks]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-[400px] overflow-y-auto bg-white dark:bg-gray-800 rounded-lg p-4 space-y-2"
    >
      {chunks.map((chunk, index) => (
        <div 
          key={`${chunk.offset}-${index}`}
          className={`
            transition-opacity duration-300
            ${chunk.finalised ? 'opacity-100' : 'opacity-70'}
          `}
        >
          <div className="flex items-start gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap pt-1">
              {formatTimestamp(chunk.timestamp[0])}
            </span>
            <p className="flex-1 text-gray-900 dark:text-gray-100">
              {chunk.text}
            </p>
          </div>
        </div>
      ))}
      {isProcessing && chunks.length === 0 && (
        <div className="text-gray-500 dark:text-gray-400 animate-pulse">
          音声を処理中...
        </div>
      )}
      {!isProcessing && chunks.length === 0 && (
        <div className="text-gray-500 dark:text-gray-400">
          録音を開始すると、ここに文字起こしが表示されます
        </div>
      )}
    </div>
  );
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}