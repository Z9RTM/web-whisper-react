export const AUDIO_CONFIG = {
  sampleRate: 16000, // Whisperの要求サンプルレート
} as const;

export const WHISPER_CONFIG = {
  chunkLengthSeconds: 30,
  strideLengthSeconds: 5,
  language: 'japanese',
  modelId: 'onnx-community/whisper-small',
  useWebGPU: false, // デフォルトはfalse
} as const;

export const STATUS_MESSAGES = {
  INITIAL: 'モデル読み込み中...',
  LOADING: 'Whisperモデルを読み込み中...',
  READY: '準備完了',
  RECORDING: '録音中...',
  WAITING: '待機中',
  DEFAULT_TRANSCRIPT: '録音を開始すると、ここに文字起こしが表示されます',
} as const;

export const ERROR_MESSAGES = {
  MODEL_LOAD: 'Whisperモデルの読み込みに失敗しました',
  AUDIO_INIT: '音声処理の初期化に失敗しました',
  MODEL_NOT_INITIALIZED: 'Whisperモデルが初期化されていません',
  AUDIO_PROCESSING: '音声処理中にエラーが発生しました',
  RECORDING_START: '録音の開始に失敗しました',
} as const;
