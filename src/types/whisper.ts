import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

export type WhisperModel = AutomaticSpeechRecognitionPipeline;

export interface WhisperModelRef {
  current: WhisperModel | null;
}

export interface WhisperChunk {
  text: string;
  timestamp: [number, number | null];
  finalised: boolean;
  offset: number;
}

export interface WhisperStreamUpdate {
  text: string;
  chunks: WhisperChunk[];
  tps?: number;  // tokens per second
}

export interface WhisperResult {
  text: string;
  chunks: WhisperChunk[];
  tps?: number;
}

export interface AudioRefs {
  audioContext: AudioContext | null;
  processorNode: AudioWorkletNode | null;
  audioBuffer: Float32Array[];
}

export interface ProcessingStatus {
  status: string;
  error?: string;
}

// 音声の状態を表す型
export type AudioState = 'silent' | 'active' | 'inactive';
