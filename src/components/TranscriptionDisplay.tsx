import { WhisperChunk } from '@/types/whisper';
import { useEffect, useRef, useState } from 'react';
import React from 'react';

interface TranscriptionDisplayProps {
  chunks: WhisperChunk[];
  isProcessing: boolean;
}

export const TranscriptionDisplay: React.FC<TranscriptionDisplayProps> = ({ chunks, isProcessing }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayChunks, setDisplayChunks] = useState<string>('');

  // chunksが更新されたら表示用の状態を更新
  useEffect(() => {
    if (chunks.length === 0) return;
    
    // 最後のチャンクのテキストのみを追加
    const lastChunk = chunks[chunks.length - 1];
    setDisplayChunks(prevText => prevText + lastChunk.text);
  }, [chunks]);

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
      <div className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
        {displayChunks}
      </div>
      {isProcessing && displayChunks.length === 0 && (
        <div className="text-gray-500 dark:text-gray-400 animate-pulse">
          音声を処理中...
        </div>
      )}
      {!isProcessing && displayChunks.length === 0 && (
        <div className="text-gray-500 dark:text-gray-400">
          録音を開始すると、ここに文字起こしが表示されます
        </div>
      )}
    </div>
  );
};
