import { useState, useEffect, useRef } from 'react';
import { Folder, File, ArrowLeft, Upload, Trash2, FolderUp } from 'lucide-react';
import { apiGet, apiPost } from './api';
import './Maintenance.css';

export default function Maintenance() {
  const [currentPath, setCurrentPath] = useState('');
  const [directories, setDirectories] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const fetchFiles = (path) => {
    setLoading(true);
    setError(null);
    apiGet(`/api/maintenance/files/?path=${encodeURIComponent(path)}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch files. Ensure you are an Admin.');
        return res.json();
      })
      .then(data => {
        if (data.error) throw new Error(data.error);
        setCurrentPath(data.current_path || '');
        setDirectories(data.directories || []);
        setFiles(data.files || []);
      })
      .catch(err => {
        console.error('Fetch error:', err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFiles('');
  }, []);

  const handleNavigate = (path) => {
    fetchFiles(path);
  };

  const handleGoUp = () => {
    if (!currentPath) return; // already at root
    const parts = currentPath.split('/');
    parts.pop(); // remove last part
    fetchFiles(parts.join('/'));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check if it's a valid type (gpkg)
    if (!file.name.toLowerCase().endsWith('.gpkg')) {
       alert("Only .gpkg files are supported for CAD and PIM maps.");
       return;
    }

    if (!currentPath) {
      alert("Please navigate into CAD or PIM folders before uploading a file.");
      return;
    }

    const formData = new FormData();
    formData.append('path', currentPath);
    formData.append('file', file);

    setUploading(true);
    // Since we are uploading FormData, we should use a standard fetch with token
    // apiPost stringifies json, so we use a custom fetch for formdata
    
    const token = localStorage.getItem('access');
    fetch('http://localhost:8000/api/maintenance/files/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        alert('File uploaded successfully!');
        fetchFiles(currentPath); // refresh current directory
      })
      .catch(err => {
        console.error('Upload Error:', err);
        alert(err.message || 'Error occurred while uploading.');
      })
      .finally(() => {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
  };

  const handleDelete = (filePath, fileName) => {
    if (!window.confirm(`Are you sure you want to delete ${fileName}? This action cannot be undone.`)) {
      return;
    }

    const token = localStorage.getItem('access');
    
    const formData = new FormData();
    formData.append('filepath', filePath);
    
    fetch('http://localhost:8000/api/maintenance/delete/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        alert(`${fileName} deleted successfully.`);
        fetchFiles(currentPath); // refresh Directory
      })
      .catch(err => {
        console.error('Delete Error:', err);
        alert(`Failed to delete: ${err.message}`);
      });
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="maintenance-page">
      <div className="maintenance-header">
        <h2>🛠️ Maintenance</h2>
        <p>Manage CAD and PIM map files. Upload new GeoPackage (.gpkg) files or remove outdated ones.</p>
      </div>

      <div className="fm-container">
        
        <div className="fm-toolbar">
          <div className="fm-breadcrumbs">
            <span className="fm-path-root" onClick={() => handleNavigate('')}>ROOT</span>
            {currentPath.split('/').map((part, index, arr) => {
              if (!part) return null;
              const subPath = arr.slice(0, index + 1).join('/');
              return (
                <span key={index} className="fm-path-part">
                  {' / '}
                  <span onClick={() => handleNavigate(subPath)}>{part}</span>
                </span>
              );
            })}
          </div>
          
          <div className="fm-actions">
            {currentPath && (
              <button className="fm-btn secondary" onClick={handleGoUp}>
                <FolderUp size={16} /> Up One Level
              </button>
            )}
            <input 
              type="file" 
              accept=".gpkg" 
              style={{ display: 'none' }} 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
            />
            <button 
              className="fm-btn primary" 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !currentPath}
              title={!currentPath ? 'Navigate into a folder to upload' : 'Upload .gpkg file'}
            >
              <Upload size={16} /> 
              {uploading ? 'Uploading...' : 'Upload .gpkg'}
            </button>
          </div>
        </div>

        {error && <div className="fm-error-banner">{error}</div>}

        <div className="fm-file-list">
          {loading ? (
            <div className="fm-loading">Loading files...</div>
          ) : directories.length === 0 && files.length === 0 ? (
            <div className="fm-empty">This folder is empty.</div>
          ) : (
            <table className="fm-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th className="fm-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* Directories */}
                {directories.map(dir => (
                  <tr key={dir.path} className="fm-row fm-dir-row" onClick={() => handleNavigate(dir.path)}>
                    <td>
                      <div className="fm-name-col">
                        <Folder className="fm-icon-folder" size={20} />
                        <span>{dir.name}</span>
                      </div>
                    </td>
                    <td>—</td>
                    <td className="fm-center"></td>
                  </tr>
                ))}
                
                {/* Files */}
                {files.map(file => (
                  <tr key={file.path} className="fm-row">
                    <td>
                      <div className="fm-name-col">
                        <File className="fm-icon-file" size={20} />
                        <span>{file.name}</span>
                      </div>
                    </td>
                    <td>{formatSize(file.size)}</td>
                    <td className="fm-center">
                      <button 
                        className="fm-icon-btn danger" 
                        onClick={(e) => { e.stopPropagation(); handleDelete(file.path, file.name); }}
                        title="Delete file"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        
      </div>
    </div>
  );
}
