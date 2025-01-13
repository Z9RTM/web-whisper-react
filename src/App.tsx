import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, StopCircle } from 'lucide-react';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { useWhisperModel } from '@/hooks/useWhisperModel';
import { useAudioProcessing } from '@/hooks/useAudioProcessing';
import { STATUS_MESSAGES } from '@/config/whisper';

const WhisperBrowserStreaming = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  
  const { isModelLoaded, status: modelStatus, processAudio } = useWhisperModel();
  
  const handleAudioProcess = useCallback(async (audio: Float32Array) => {
    try {
      const result = await processAudio(audio);
      setTranscript(prev => prev + ' ' + result.text);
    } catch (err) {
      // エラーはuseWhisperModel内で処理されるため、ここでは何もしない
    }
  }, [processAudio]);

  const { setupAudioProcessing, stopAudioProcessing, status: audioStatus } = useAudioProcessing(handleAudioProcess);

  const startRecording = async () => {
    try {
      await setupAudioProcessing();
      setIsRecording(true);
    } catch {
      // エラーはuseAudioProcessing内で処理されるため、ここでは何もしない
    }
  };

  const stopRecording = () => {
    stopAudioProcessing();
    setIsRecording(false);
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
          
          <div className="text-sm text-gray-500 text-center">
            状態: {currentStatus}
          </div>
          
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

          <div className="p-4 bg-gray-50 rounded-lg min-h-[200px] whitespace-pre-wrap">
            {transcript || STATUS_MESSAGES.DEFAULT_TRANSCRIPT}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WhisperBrowserStreaming;
