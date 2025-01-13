// @ts-check
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /** @type {Float32Array} */
    this.buffer = new Float32Array();
    /** @type {number} */
    this.sampleRate = 16000;
    /** @type {number} */
    this.processCounter = 0;
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

    // 約1秒分のデータが集まったら送信（16kHzで16000サンプル）
    if (this.buffer.length >= this.sampleRate) {
      this.port.postMessage({
        audio: this.buffer,
        timestamp: currentTime
      });
      this.buffer = new Float32Array();
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
