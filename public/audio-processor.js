// @ts-check

class AudioProcessor extends globalThis.AudioWorkletProcessor {
  constructor() {
    super();
    /** @type {Float32Array} */
    this.buffer = new Float32Array();
    /** @type {number} */
    this.sampleRate = 16000;
    /** @type {number} */
    this.processCounter = 0;
    /** @type {number} */
    this.silenceThreshold = 0.01; // 無音判定のしきい値
  }

  /**
   * バッファ内の音声レベルをチェックし、無音かどうかを判定
   * @param {Float32Array} buffer
   * @returns {boolean}
   */
  isSilent(buffer) {
    // RMSレベルを計算
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / buffer.length);
    return rms < this.silenceThreshold;
  }

  /**
   * @param {Float32Array[][]} inputs
   * @param {Float32Array[][]} outputs
   * @param {Record<string, Float32Array>} parameters
   * @returns {boolean}
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0][0];
    if (!input) return true;

    // 新しいバッファを作成して既存のデータと新しいデータを結合
    const newBuffer = new Float32Array(this.buffer.length + input.length);
    newBuffer.set(this.buffer);
    newBuffer.set(input, this.buffer.length);
    this.buffer = newBuffer;

    // 約1秒分のデータが集まったら処理（16kHzで16000サンプル）
    if (this.buffer.length >= this.sampleRate) {
      // 無音でない場合のみ送信
      if (!this.isSilent(this.buffer)) {
        this.port.postMessage({
          audio: this.buffer,
          timestamp: globalThis.currentTime
        });
      }
      this.buffer = new Float32Array();
    }

    return true;
  }
}

globalThis.registerProcessor('audio-processor', AudioProcessor);
