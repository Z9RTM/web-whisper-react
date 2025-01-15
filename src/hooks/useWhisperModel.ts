import { useState, useCallback, useEffect } from 'react';
import { ProcessingStatus, WhisperResult } from '@/types/whisper';
import { ERROR_MESSAGES, STATUS_MESSAGES } from '@/config/whisper';
import WhisperService from '@/utils/WhisperService';

export const useWhisperModel = () => {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [status, setStatus] = useState<ProcessingStatus>({ 
    status: STATUS_MESSAGES.INITIAL 
  });

  useEffect(() => {
    const initWhisper = async () => {
      try {
        setStatus({ status: STATUS_MESSAGES.LOADING });
        const whisperService = WhisperService.getInstance();
        
        await whisperService.initialize((progress) => {
          if (progress.status === 'progress' && progress.progress !== undefined) {
            setStatus({ 
              status: `${STATUS_MESSAGES.LOADING} ${Math.round(progress.progress)}%` 
            });
          }
        });

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
    if (!isModelLoaded) {
      throw new Error(ERROR_MESSAGES.MODEL_NOT_INITIALIZED);
    }

    try {
      const whisperService = WhisperService.getInstance();
      return await whisperService.processAudio(audioData);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Invalid response format from Whisper model');
    }
  }, [isModelLoaded]);

  return {
    isModelLoaded,
    status,
    processAudio,
  };
};
