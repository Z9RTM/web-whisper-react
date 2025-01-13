import { useState, useRef, useCallback, useEffect } from 'react';
import { pipeline } from '@huggingface/transformers';
import { WhisperModelRef, ProcessingStatus, WhisperResult } from '@/types/whisper';
import { WHISPER_CONFIG, ERROR_MESSAGES, STATUS_MESSAGES } from '@/config/whisper';

export const useWhisperModel = () => {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [status, setStatus] = useState<ProcessingStatus>({ 
    status: STATUS_MESSAGES.INITIAL 
  });
  const whisperRef = useRef<WhisperModelRef>({ current: null });

  useEffect(() => {
    const initWhisper = async () => {
      try {
        setStatus({ status: STATUS_MESSAGES.LOADING });
        const pipe = await pipeline(
          'automatic-speech-recognition',
          WHISPER_CONFIG.modelId,
          {
            progress_callback: (progress: { status: string; progress?: number }) => {
              if (progress.status === 'progress' && progress.progress !== undefined) {
                setStatus({ 
                  status: `${STATUS_MESSAGES.LOADING} ${Math.round(progress.progress)}%` 
                });
              }
            }
          }
        );
        whisperRef.current.current = pipe;
        setIsModelLoaded(true);
        setStatus({ status: STATUS_MESSAGES.READY });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '不明なエラー';
        setStatus({ 
          status: ERROR_MESSAGES.MODEL_LOAD,
          error: errorMessage 
        });
      }
    };

    initWhisper();
  }, []);

  const processAudio = useCallback(async (audioData: Float32Array): Promise<WhisperResult> => {
    if (!whisperRef.current.current) {
      throw new Error(ERROR_MESSAGES.MODEL_NOT_INITIALIZED);
    }

    const result = await whisperRef.current.current(audioData, {
      chunk_length_s: WHISPER_CONFIG.chunkLengthSeconds,
      stride_length_s: WHISPER_CONFIG.strideLengthSeconds,
      language: WHISPER_CONFIG.language,
      return_timestamps: true,
    });

    if (typeof result === 'object' && 'text' in result) {
      return result as WhisperResult;
    }

    throw new Error('Invalid response format from Whisper model');
  }, []);

  return {
    isModelLoaded,
    status,
    processAudio,
  };
};
