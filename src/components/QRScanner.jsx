import { useRef, useEffect } from 'react';
import { BrowserQRCodeReader } from '@zxing/library';

function QRScanner({ onScan, onCancel, log }) {
  const videoRef = useRef(null);
  const scannerRef = useRef(null);

  useEffect(() => {
    startScanning();
    return () => {
      stopScanning();
    };
  }, []);

  const startScanning = async () => {
    try {
      scannerRef.current = new BrowserQRCodeReader();
      log('Starting QR scanner...', 'info');

      const videoInputDevices = await scannerRef.current.listVideoInputDevices();

      if (videoInputDevices.length === 0) {
        log('No camera found', 'error');
        return;
      }

      // Prefer back camera (environment-facing)
      let selectedDeviceId = videoInputDevices[0].deviceId;
      const backCamera = videoInputDevices.find(device =>
        device.label.toLowerCase().includes('back') ||
        device.label.toLowerCase().includes('rear') ||
        device.label.toLowerCase().includes('environment')
      );

      if (backCamera) {
        selectedDeviceId = backCamera.deviceId;
        log('Using back camera', 'info');
      } else {
        log('Back camera not found, using default', 'info');
      }

      scannerRef.current.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current,
        (result, err) => {
          if (result) {
            const scannedId = result.getText();
            log(`Scanned: ${scannedId}`, 'success');
            stopScanning();
            onScan(scannedId);
          }
        }
      );
    } catch (error) {
      log(`Scanner error: ${error.message}`, 'error');
    }
  };

  const stopScanning = () => {
    if (scannerRef.current) {
      scannerRef.current.reset();
      log('Scanner stopped', 'info');
    }
  };

  return (
    <div className="scanner-container">
      <video ref={videoRef} className="scanner-video" />
      <button className="back-button" onClick={onCancel}>← Cancel</button>
    </div>
  );
}

export default QRScanner;
