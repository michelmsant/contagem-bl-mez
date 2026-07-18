// ============================================================
// CAMERA.JS - Leitura de códigos de barras e QR Code
// ============================================================

const Camera = {
    codeReader: null,
    isOpen: false,
    continuousMode: false,
    
    async open(videoElement, onScanCallback) {
        if (this.isOpen) return;
        this.isOpen = true;
        
        if (typeof ZXing === 'undefined') {
            Utils.showToast('Biblioteca ZXing não carregada.', 'error');
            this.close();
            return;
        }
        
        try {
            this.codeReader = new ZXing.BrowserMultiFormatReader();
            const hints = new Map();
            hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
                ZXing.BarcodeFormat.EAN_13,
                ZXing.BarcodeFormat.EAN_8,
                ZXing.BarcodeFormat.CODE_128,
                ZXing.BarcodeFormat.CODE_39,
                ZXing.BarcodeFormat.QR_CODE,
                ZXing.BarcodeFormat.ITF
            ]);
            
            await this.codeReader.decodeFromVideoDevice(null, videoElement, (result, err) => {
                if (result) {
                    onScanCallback(result.text);
                    if (!this.continuousMode) {
                        this.close();
                    }
                }
            });
        } catch (err) {
            console.error('Erro ao abrir câmera:', err);
            Utils.showToast('Erro ao acessar a câmera.', 'error');
            this.close();
        }
    },
    
    close() {
        if (this.codeReader) {
            this.codeReader.reset();
            this.codeReader = null;
        }
        this.isOpen = false;
    },
    
    toggleContinuous() {
        this.continuousMode = !this.continuousMode;
        return this.continuousMode;
    }
};