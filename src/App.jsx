import { useState, useRef } from 'react';

function App() {
  const [status, setStatus] = useState('idle');
  const [resultBlob, setResultBlob] = useState(null);
  const [fileSize, setFileSize] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef(null);

  const loadImage = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const convertToAPNG = (pngBuffer) => {
    const png = new Uint8Array(pngBuffer);
    const acTL = new Uint8Array([
      0, 0, 0, 8, 97, 99, 84, 76,
      0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0
    ]);
    const fcTL = new Uint8Array([
      0, 0, 0, 26, 102, 99, 84, 76,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 1, 0, 100, 0, 0, 0, 0, 0, 0
    ]);
    let width = (png[16] << 24) | (png[17] << 16) | (png[18] << 8) | png[19];
    let height = (png[20] << 24) | (png[21] << 16) | (png[22] << 8) | png[23];
    fcTL[8] = (width >> 24) & 0xff; fcTL[9] = (width >> 16) & 0xff;
    fcTL[10] = (width >> 8) & 0xff; fcTL[11] = width & 0xff;
    fcTL[12] = (height >> 24) & 0xff; fcTL[13] = (height >> 16) & 0xff;
    fcTL[14] = (height >> 8) & 0xff; fcTL[15] = height & 0xff;
    const result = new Uint8Array(png.length + acTL.length + fcTL.length);
    result.set(png.subarray(0, 33), 0);
    result.set(acTL, 33);
    result.set(fcTL, 33 + acTL.length);
    result.set(png.subarray(33), 33 + acTL.length + fcTL.length);
    return result.buffer;
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'];
    if (!supportedTypes.includes(file.type)) {
      setStatus('error');
      setErrorMessage('この形式には対応していません😢');
      return;
    }
    setStatus('processing');
    setErrorMessage('');
    try {
      const img = await loadImage(file);
      let canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const MAX_SIZE = 5 * 1024 * 1024;
      let pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      while (pngBlob.size > MAX_SIZE) {
        const scale = Math.sqrt(MAX_SIZE / pngBlob.size) * 0.9;
        const newCanvas = document.createElement('canvas');
        newCanvas.width = canvas.width * scale;
        newCanvas.height = canvas.height * scale;
        const newCtx = newCanvas.getContext('2d');
        newCtx.drawImage(canvas, 0, 0, newCanvas.width, newCanvas.height);
        canvas = newCanvas;
        pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      }
      const pngBuffer = await pngBlob.arrayBuffer();
      const apngBuffer = convertToAPNG(pngBuffer);
      const blob = new Blob([apngBuffer], { type: 'image/png' });
      setResultBlob(blob);
      setFileSize(blob.size);
      setStatus('success');
    } catch (error) {
      console.error(error);
      setStatus('error');
      setErrorMessage('変換中にエラーが発生しました');
    }
  };

  const handleCopyToClipboard = async () => {
    if (!resultBlob) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': resultBlob })
      ]);
      alert('📋 クリップボードにコピーしました！');
    } catch (error) {
      console.error(error);
      alert('❌ コピーに失敗しました');
    }
  };

  const handleDownload = () => {
    if (!resultBlob) return;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `converted-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (!resultBlob || !navigator.share) return;
    try {
      await navigator.share({
        files: [new File([resultBlob], 'image.png', { type: 'image/png' })]
      });
    } catch (error) {
      console.error(error);
    }
  };

  const formatFileSize = (bytes) => {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  const resetState = () => {
    setStatus('idle');
    setResultBlob(null);
    setFileSize(0);
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF9F5] via-[#F5F3ED] to-[#EAE7DC] flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent mb-3">
            画像をAPNGに変換
          </h1>
          <p className="text-gray-600 text-lg">
            Grok編集を回避できる形式に変換します
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-8 transition-all duration-300">
          {status === 'idle' && (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="relative group cursor-pointer"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="border-3 border-dashed border-gray-300 rounded-2xl p-16 text-center transition-all duration-300 group-hover:border-gray-400 group-hover:bg-gray-50/50">
                <div className="text-7xl mb-6 transition-transform duration-300 group-hover:scale-110">
                  📸
                </div>
                <p className="text-2xl font-semibold text-gray-800 mb-2">
                  画像を選択
                </p>
                <p className="text-sm text-gray-500">
                  JPEG, PNG, WebP, GIF, BMP, TIFF対応
                </p>
              </div>
            </div>
          )}

          {status === 'processing' && (
            <div className="text-center py-16">
              <div className="text-7xl mb-6 animate-spin inline-block">
                🔄
              </div>
              <p className="text-2xl font-semibold text-gray-800">変換中...</p>
              <p className="text-sm text-gray-500 mt-2">少々お待ちください</p>
            </div>
          )}

          {status === 'success' && resultBlob && (
            <div className="text-center">
              <div className="mb-8">
                <div className="text-7xl mb-4 animate-bounce">✨</div>
                <p className="text-3xl font-bold text-gray-800 mb-2">完成！</p>
                <p className="text-lg text-gray-600">
                  {formatFileSize(fileSize)}
                </p>
              </div>

              <div className="space-y-3 mb-6">
                <button
                  onClick={handleCopyToClipboard}
                  className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5"
                >
                  📋 クリップボードにコピー
                </button>
                <button
                  onClick={handleDownload}
                  className="w-full px-6 py-4 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5"
                >
                  💾 ダウンロード
                </button>
                {navigator.share && (
                  <button
                    onClick={handleShare}
                    className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-0.5"
                  >
                    ↗️ 共有
                  </button>
                )}
              </div>

              <button
                onClick={resetState}
                className="text-gray-600 hover:text-gray-800 font-medium transition-colors"
              >
                ← 別の画像を変換
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center py-16">
              <div className="text-7xl mb-6">❌</div>
              <p className="text-2xl font-semibold text-red-600 mb-4">{errorMessage}</p>
              <button
                onClick={resetState}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors"
              >
                もう一度試す
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-gray-500">
          <p>画像は自動的に5MB以下に最適化されます</p>
        </div>
      </div>
    </div>
  );
}

export default App;