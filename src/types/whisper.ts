import { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

export interface WhisperResult {
  text: string;
  [key: string]: unknown;
}

export interface AudioProcessingConfig {
  sampleRate: number;
}

export interface WhisperConfig {
  chunkLengthSeconds: number;
  strideLengthSeconds: number;
  language: string;
}

export interface ProcessingStatus {
  status: string;
  error?: string;
}

export type WhisperModelRef = {
  current: AutomaticSpeechRecognitionPipeline | null;
};

export type AudioRefs = {
  audioContext: AudioContext | null;
  processorNode: AudioWorkletNode | null;
  audioBuffer: number[];
};
