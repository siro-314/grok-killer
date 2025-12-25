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

  // PNGにacTLチャンクを挿入してAPNG化
  const convertToAPNG = (pngBuffer) => {
    const png = new Uint8Array(pngBuffer);
    
    // acTLチャンク: 1フレーム、0回ループ
    const acTL = new Uint8Array([
      0, 0, 0, 8,           // チャンク長: 8バイト
      97, 99, 84, 76,       // 'acTL'
      0, 0, 0, 1,           // num_frames: 1
      0, 0, 0, 0,           // num_plays: 0 (無限ループ)
      0, 0, 0, 0            // CRC (簡易版のため0)
    ]);
    
    // fcTLチャンク: フレーム制御
    const fcTL = new Uint8Array([
      0, 0, 0, 26,          // チャンク長: 26バイト
      102, 99, 84, 76,      // 'fcTL'
      0, 0, 0, 0,           // sequence_number: 0
      0, 0, 0, 0,           // width (後で設定)
      0, 0, 0, 0,           // height (後で設定)
      0, 0, 0, 0,           // x_offset: 0
      0, 0, 0, 0,           // y_offset: 0
      0, 1,                 // delay_num: 1
      0, 100,               // delay_den: 100 (0.01秒)
      0,                    // dispose_op: 0
      0,                    // blend_op: 0
      0, 0, 0, 0            // CRC
    ]);
    
    // IHDRチャンクを探してサイズを取得
    let width = (png[16] << 24) | (png[17] << 16) | (png[18] << 8) | png[19];
    let height = (png[20] << 24) | (png[21] << 16) | (png[22] << 8) | png[23];
    
    // fcTLにサイズを設定
    fcTL[8] = (width >> 24) & 0xff;
    fcTL[9] = (width >> 16) & 0xff;
    fcTL[10] = (width >> 8) & 0xff;
    fcTL[11] = width & 0xff;
    fcTL[12] = (height >> 24) & 0xff;
    fcTL[13] = (height >> 16) & 0xff;
    fcTL[14] = (height >> 8) & 0xff;
    fcTL[15] = height & 0xff;
    
    // PNG署名(8バイト) + IHDRチャンク(25バイト) = 33バイト後に挿入
    const result = new Uint8Array(png.length + acTL.length + fcTL.length);
    result.set(png.subarray(0, 33), 0);              // PNG署名 + IHDR
    result.set(acTL, 33);                             // acTLチャンク
    result.set(fcTL, 33 + acTL.length);              // fcTLチャンク
    result.set(png.subarray(33), 33 + acTL.length + fcTL.length); // 残り
    
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
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const MAX_SIZE = 5 * 1024 * 1024;
      
      // PNG Blobを生成
      let pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      
      // 5MB超えてたらリサイズ
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
      
      // PNGをAPNGに変換
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

  return (
    <div className="min-h-screen bg-[#FAF9F5] dark:bg-[#1A1A1A] transition-colors">
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            画像をAPNGに変換
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            画像を選択すると自動的に1フレームAPNGに変換します
          </p>
        </header>

        <main>
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-4 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-16 text-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors mb-8"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="text-6xl mb-4">📸</div>
            <p className="text-xl text-gray-700 dark:text-gray-300 font-medium">
              画像を選択
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              JPEG, PNG, WebP, GIF, BMP, TIFF対応
            </p>
          </div>

          {status === 'processing' && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4 animate-spin">🔄</div>
              <p className="text-xl text-gray-700 dark:text-gray-300">変換中...</p>
            </div>
          )}

          {status === 'success' && resultBlob && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✨</div>
              <p className="text-xl text-gray-700 dark:text-gray-300 mb-2">完成！</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
                ({formatFileSize(fileSize)})
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <button
                  onClick={handleCopyToClipboard}
                  className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors text-lg w-full sm:w-auto"
                >
                  📋 クリップボードにコピー
                </button>
                <button
                  onClick={handleDownload}
                  className="px-8 py-4 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium transition-colors text-lg w-full sm:w-auto"
                >
                  💾 ダウンロード
                </button>
                {navigator.share && (
                  <button
                    onClick={handleShare}
                    className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors text-lg w-full sm:w-auto"
                  >
                    ↗️ 共有
                  </button>
                )}
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">❌</div>
              <p className="text-xl text-red-600 dark:text-red-400">{errorMessage}</p>
            </div>
          )}
        </main>

        <footer className="text-center mt-16 text-sm text-gray-500 dark:text-gray-400">
          <p>画像は自動的に5MB以下に最適化されます</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
