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
          // リアルタイムでチャンクを更新
          setChunks(prevChunks => {
            // 新しいチャンクだけを追加または更新
            const updatedChunks = [...prevChunks];
            newChunks.forEach((chunk, index) => {
              if (index >= updatedChunks.length) {
                updatedChunks.push(chunk);
              } else if (chunk.text !== updatedChunks[index].text || !updatedChunks[index].finalised) {
                updatedChunks[index] = chunk;
              }
            });
            return updatedChunks;
          });

          setProcessingStatus(prev => ({
            ...prev,
            status: STATUS_MESSAGES.RECORDING,
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
        // 最終結果で完全に更新
        setChunks(result.chunks);
        setProcessingStatus(prev => ({
          ...prev,
          status: STATUS_MESSAGES.READY,
          progress: 100
        }));
      }
    } catch (err) {
      // エラーはuseWhisperModel内で処理されるため、ここでは何もしない
      console.error('Audio processing error:', err);
    }
  }, [processAudio]);

  const { setupAudioProcessing, stopAudioProcessing, status: audioStatus } = useAudioProcessing(handleAudioProcess);

  const startRecording = async () => {
    try {
      // 新しい録音を開始する前に状態をリセット
      setChunks([]);
      setProcessingStatus({
        status: STATUS_MESSAGES.RECORDING,
        progress: 0,
        tps: undefined
      });
      await setupAudioProcessing();
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      setProcessingStatus(prev => ({
        ...prev,
        status: STATUS_MESSAGES.WAITING,
        error: 'Failed to start recording'
      }));
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
