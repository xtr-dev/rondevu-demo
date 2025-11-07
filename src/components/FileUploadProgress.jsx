function FileUploadProgress({ fileName, progress, onCancel }) {
  return (
    <div className="file-upload-progress">
      <div className="file-upload-header">
        <span className="file-upload-name">{fileName}</span>
        <button className="file-upload-cancel" onClick={onCancel}>×</button>
      </div>
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }}>
          <span className="progress-text">{progress}%</span>
        </div>
      </div>
    </div>
  );
}

export default FileUploadProgress;
