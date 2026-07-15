import React, { useState, useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize, Download, RotateCcw, X } from 'lucide-react';
import gadcPoster from './assets/GADC_POSTER.jpg';

const GadcPosterModal = ({ isOpen, onClose }) => {
    const [zoom, setZoom] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const modalRef = useRef(null);

    if (!isOpen) return null;

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 4));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
    const handleReset = () => setZoom(1);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            modalRef.current.requestFullscreen().catch(err => {
                alert(`Error attempting to enable full-screen mode: ${err.message}`);
            });
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = gadcPoster;
        link.download = 'GADC_POSTER.jpg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div
            className={`poster-modal-overlay ${isFullscreen ? 'is-fullscreen' : ''}`}
            ref={modalRef}
            onClick={onClose}
        >
            <div className="poster-modal-content" onClick={e => e.stopPropagation()}>
                <button className="poster-close-top" onClick={onClose} title="Close">
                    <X size={24} />
                </button>

                <div className="poster-viewer-container">
                    <img
                        src={gadcPoster}
                        alt="GADC Poster"
                        style={{ transform: `scale(${zoom})` }}
                        className="poster-viewer-img"
                    />
                </div>

                <div className="poster-chronicle-toolbar">
                    <div className="toolbar-inner">
                        <button className="toolbar-btn" onClick={handleZoomIn} title="Zoom In">
                            <ZoomIn size={20} />
                        </button>
                        <button className="toolbar-btn" onClick={handleZoomOut} title="Zoom Out">
                            <ZoomOut size={20} />
                        </button>
                        <button className="toolbar-btn" onClick={handleReset} title="Reset Zoom">
                            <RotateCcw size={20} />
                        </button>

                        <div className="toolbar-divider"></div>

                        <button className="toolbar-btn" onClick={toggleFullscreen} title="Toggle Fullscreen">
                            <Maximize size={20} />
                        </button>

                        <div className="toolbar-divider"></div>

                        <button className="toolbar-btn download-accent" onClick={handleDownload} title="Download Poster">
                            <Download size={20} />
                            <span>Download</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GadcPosterModal;
