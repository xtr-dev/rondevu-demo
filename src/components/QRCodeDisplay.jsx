function QRCodeDisplay({ qrCodeUrl, connectionId }) {
  if (!qrCodeUrl) return null;

  return (
    <div className="qr-code-container">
      <p className="qr-label">Scan to connect:</p>
      <img src={qrCodeUrl} alt="Connection QR Code" className="qr-code" />
      <p className="connection-id-display">{connectionId}</p>
    </div>
  );
}

export default QRCodeDisplay;
