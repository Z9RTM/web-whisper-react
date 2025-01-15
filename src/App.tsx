import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, StopCircle } from 'lucide-react';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { useWhisperModel } from '@/hooks/useWhisperModel';
import { useAudioProcessing } from '@/hooks/useAudioProcessing';
import { STATUS_MESSAGES } from '@/config/whisper';
import { TranscriptionDisplay } from '@/components/TranscriptionDisplay';
import { ProcessingStatus } from '@/components/ProcessingStatus';
import { WhisperChunk } from '@/types/whisper';

const WhisperBrowserStreaming = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [chunks, setChunks] = useState<WhisperChunk[]>([]);
  const [processingStatus, setProcessingStatus] = useState({
    status: STATUS_MESSAGES.INITIAL,
    progress: 0,
    tps: undefined as number | undefined
  });
  
  const { isModelLoaded, status: modelStatus, processAudio } = useWhisperModel();
  
  const handleAudioProcess = useCallback(async (audio: Float32Array) => {
    try {
      const result = await processAudio(audio, (progress) => {
        if (progress.status === 'update' && progress.data) {
          const { chunks: newChunks, tps } = progress.data;
          setChunks(newChunks);
          setProcessingStatus(prev => ({
            ...prev,
            tps
          }));
        } else {
          setProcessingStatus(prev => ({
            ...prev,
            status: progress.status,
            progress: progress.progress ?? prev.progress
          }));
        }
      });
      
      if (result) {
        setChunks(result.chunks);
      }
    } catch (err) {
      // エラーはuseWhisperModel内で処理されるため、ここでは何もしない
    }
  }, [processAudio]);

  const { setupAudioProcessing, stopAudioProcessing, status: audioStatus } = useAudioProcessing(handleAudioProcess);

  const startRecording = async () => {
    try {
      setChunks([]); // 新しい録音を開始する前にチャンクをクリア
      setProcessingStatus(prev => ({
        ...prev,
        status: STATUS_MESSAGES.RECORDING,
        progress: 0
      }));
      await setupAudioProcessing();
      setIsRecording(true);
    } catch {
      // エラーはuseAudioProcessing内で処理されるため、ここでは何もしない
    }
  };

  const stopRecording = () => {
    stopAudioProcessing();
    setIsRecording(false);
    setProcessingStatus(prev => ({
      ...prev,
      status: STATUS_MESSAGES.WAITING,
      tps: undefined
    }));
  };

  // エラー状態の統合
  const error = modelStatus.error || audioStatus.error;
  
  // 現在のステータスメッセージの決定
  const currentStatus = isRecording 
    ? STATUS_MESSAGES.RECORDING 
    : (modelStatus.status || STATUS_MESSAGES.WAITING);

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>ブラウザ内リアルタイム文字起こし</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
          
          <ProcessingStatus
            status={processingStatus.status}
            progress={processingStatus.progress}
            tps={processingStatus.tps}
          />
          
          <div className="flex justify-center gap-4">
            <Button
              onClick={startRecording}
              disabled={isRecording || !isModelLoaded}
              className="flex items-center gap-2"
            >
              <Mic className="w-4 h-4" />
              録音開始
            </Button>
            <Button
              onClick={stopRecording}
              disabled={!isRecording}
              variant="destructive"
              className="flex items-center gap-2"
            >
              <StopCircle className="w-4 h-4" />
              録音停止
            </Button>
          </div>

          <TranscriptionDisplay
            chunks={chunks}
            isProcessing={isRecording || processingStatus.status === STATUS_MESSAGES.LOADING}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default WhisperBrowserStreaming;
