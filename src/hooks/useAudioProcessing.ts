import { useRef, useState, useCallback } from 'react';
import { AudioRefs, ProcessingStatus, AudioState } from '@/types/whisper';
import { AUDIO_CONFIG, ERROR_MESSAGES } from '@/config/whisper';

export const useAudioProcessing = (onAudioProcess: (audio: Float32Array) => Promise<void>) => {
  const [status, setStatus] = useState<ProcessingStatus>({ status: '' });
  const [audioState, setAudioState] = useState<AudioState>('inactive');
  const audioRefs = useRef<AudioRefs>({
    audioContext: null,
    processorNode: null,
    audioBuffer: [],
  });

  const preprocessAudio = useCallback((audioData: Float32Array): Float32Array => {
    const maxAbs = Math.max(...audioData.map(Math.abs));
    if (maxAbs === 0) return audioData;
    
    const normalizedData = new Float32Array(audioData.length);
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i];
    }
    const mean = sum / audioData.length;
    
    for (let i = 0; i < audioData.length; i++) {
      normalizedData[i] = (audioData[i] - mean) / maxAbs;
    }
    
    return normalizedData;
  }, []);

  const setupAudioProcessing = useCallback(async () => {
    try {
      audioRefs.current.audioContext = new AudioContext({
        sampleRate: AUDIO_CONFIG.sampleRate,
      });

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true
      });

      const source = audioRefs.current.audioContext.createMediaStreamSource(stream);
      
      await audioRefs.current.audioContext.audioWorklet.addModule('/audio-processor.js');

      audioRefs.current.processorNode = new AudioWorkletNode(
        audioRefs.current.audioContext,
        'audio-processor'
      );

      audioRefs.current.processorNode.port.onmessage = async (e: MessageEvent<{ audio: Float32Array; timestamp: number }>) => {
        const { audio, timestamp } = e.data;
        setAudioState('active'); // 音声データを受信したら active に設定
        const processedAudio = preprocessAudio(audio);
        await onAudioProcess(processedAudio);
        
        // 1秒後に無音状態に戻す（次のデータが来ない場合）
        setTimeout(() => {
          setAudioState('silent');
        }, 1000);
      };

      source.connect(audioRefs.current.processorNode);
      audioRefs.current.processorNode.connect(audioRefs.current.audioContext.destination);

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '不明なエラー';
      setStatus({ status: ERROR_MESSAGES.AUDIO_INIT, error: errorMessage });
      throw err;
    }
  }, [onAudioProcess, preprocessAudio]);

  const stopAudioProcessing = useCallback(() => {
    if (audioRefs.current.processorNode) {
      audioRefs.current.processorNode.disconnect();
      audioRefs.current.processorNode = null;
    }
    
    if (audioRefs.current.audioContext) {
      audioRefs.current.audioContext.close();
      audioRefs.current.audioContext = null;
    }
  }, []);

  return {
    setupAudioProcessing,
    stopAudioProcessing,
    status,
    audioState,
  };
};
