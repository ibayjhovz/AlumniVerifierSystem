import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { centralizedCamera } from '../../services/centralizedCamera.js';
import { decodeQRCodeFromImage } from '../../utils/qrDecoder.js';
import {
  Camera,
  SwitchCamera,
  Flashlight,
  FlashlightOff,
  AlertCircle,
  Loader2,
  Video,
  RefreshCw
} from 'lucide-react';

export interface CentralizedDeviceCameraProps {
  onScan: (scannedValue: string) => void;
  autoStart?: boolean;
  instructionText?: string;
  className?: string;
  showDeviceSelector?: boolean;
}

export const CentralizedDeviceCamera: React.FC<CentralizedDeviceCameraProps> = ({
  onScan,
  autoStart = true,
  instructionText = 'Point camera at the QR code on an official Panpacific University Alumni Card',
  className = '',
  showDeviceSelector = true
}) => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [isDecodingFile, setIsDecodingFile] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nativeCaptureInputRef = useRef<HTMLInputElement | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  // Load connected video devices
  useEffect(() => {
    let mounted = true;
    centralizedCamera.getAvailableVideoDevices().then((devs) => {
      if (mounted && devs.length > 0) {
        setDevices(devs);
      }
    });

    const handleDeviceChange = () => {
      centralizedCamera.getAvailableVideoDevices().then((devs) => {
        if (mounted) setDevices(devs);
      });
    };

    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    return () => {
      mounted = false;
      if (navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, []);

  const stopCamera = () => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    centralizedCamera.stopCurrentStream();
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsCameraStarting(false);
    setTorchOn(false);
    setTorchAvailable(false);
  };

  const startCamera = async (opts?: { deviceId?: string; mode?: 'environment' | 'user' }) => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    setCameraError(null);
    setIsCameraStarting(true);

    const targetMode = opts?.mode || facingMode;
    const targetDeviceId = opts?.deviceId !== undefined ? opts.deviceId : selectedDeviceId;

    try {
      const stream = await centralizedCamera.startStream({
        deviceId: targetDeviceId || undefined,
        facingMode: targetMode
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.muted = true;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('Video play notice:', playErr);
        }
      }

      setIsCameraActive(true);
      setIsCameraStarting(false);
      setTorchAvailable(centralizedCamera.isTorchSupported());
      setTorchOn(centralizedCamera.isTorchActive());

      // Refresh devices list
      centralizedCamera.getAvailableVideoDevices().then((devs) => {
        if (devs.length > 0) setDevices(devs);
      });

      // Begin scanning loop
      animationFrameIdRef.current = requestAnimationFrame(scanLoop);
    } catch (err: any) {
      console.warn('Centralized camera stream initialization notice:', err);
      setIsCameraStarting(false);
      setIsCameraActive(false);
      setCameraError(
        err.message || 'Camera permission not granted. Click "Open Camera" to allow access.'
      );
    }
  };

  // Video element callback ref ensures stream is attached whenever element is mounted
  const setVideoElementRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el) {
      const activeStream = centralizedCamera.getActiveStream();
      if (activeStream && el.srcObject !== activeStream) {
        el.srcObject = activeStream;
        el.setAttribute('playsinline', 'true');
        el.muted = true;
        el.play().catch((e) => console.warn('Video auto-play:', e));
      }
    }
  };

  // Auto-start camera on mount
  useEffect(() => {
    if (autoStart) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [autoStart]);

  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    setSelectedDeviceId('');
    startCamera({ mode: nextMode, deviceId: '' });
  };

  const handleDeviceSelect = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    startCamera({ deviceId });
  };

  const handleToggleTorch = async () => {
    const active = await centralizedCamera.toggleTorch();
    setTorchOn(active);
  };

  const scanLoop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      animationFrameIdRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth'
        });

        if (code && code.data && code.data.trim()) {
          const raw = code.data.trim();
          try {
            if (navigator.vibrate) navigator.vibrate(120);
          } catch {}
          stopCamera();
          onScan(raw);
          return;
        }
      }
    }

    animationFrameIdRef.current = requestAnimationFrame(scanLoop);
  };

  const handleNativeCaptureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsDecodingFile(true);
    setCameraError(null);

    try {
      const decoded = await decodeQRCodeFromImage(file);
      onScan(decoded.value);
    } catch (err: any) {
      setCameraError(err.message || 'QR code could not be detected. Please aim directly at the card QR code.');
    } finally {
      setIsDecodingFile(false);
      if (nativeCaptureInputRef.current) {
        nativeCaptureInputRef.current.value = '';
      }
    }
  };

  const handleTriggerDeviceCamera = () => {
    setCameraError(null);
    startCamera().catch(() => {
      // If live stream fails on user click, trigger native camera input
      nativeCaptureInputRef.current?.click();
    });
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Hidden native camera capture input for instant hardware fallback */}
      <input
        type="file"
        ref={nativeCaptureInputRef}
        onChange={handleNativeCaptureUpload}
        accept="image/*"
        capture="environment"
        className="hidden"
        id="centralized-native-camera-input"
      />

      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Device selector bar (if multiple cameras detected) */}
      {showDeviceSelector && devices.length > 1 && (
        <div className="flex items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs">
          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
            <Video className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Camera Source:</span>
          </div>
          <select
            value={selectedDeviceId}
            onChange={(e) => handleDeviceSelect(e.target.value)}
            className="flex-1 max-w-xs px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 font-sans focus:outline-none focus:ring-1 focus:ring-slate-900"
          >
            <option value="">Default (Rear / Primary Camera)</option>
            {devices.map((dev, idx) => (
              <option key={dev.deviceId || idx} value={dev.deviceId}>
                {dev.label || `Camera ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Camera Viewfinder Container (Always Mounted to Guarantee Immediate Stream Binding) */}
      <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-md">
        {/* Live Video Feed Element */}
        <video
          ref={setVideoElementRef}
          playsInline
          autoPlay
          muted
          onLoadedMetadata={() => {
            if (videoRef.current) {
              videoRef.current.play().catch(() => {});
            }
          }}
          className={`w-full h-64 sm:h-72 object-cover bg-black ${
            isCameraActive ? 'opacity-100' : 'opacity-0'
          } transition-opacity duration-200`}
        />

        {/* Viewfinder Targeting Overlays when Active */}
        {isCameraActive && (
          <>
            {/* Precision Targeting Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
              <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-2xl border-2 border-emerald-400/40 shadow-2xl overflow-hidden flex items-center justify-center">
                {/* Corner brackets */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

                {/* Animated Laser Scanning Line */}
                <div className="animate-scan-line bg-gradient-to-r from-transparent via-emerald-400 to-transparent h-0.5 w-full absolute shadow-[0_0_8px_rgba(52,211,153,0.8)]" />

                <span className="text-[10px] text-emerald-200/90 font-mono tracking-wider uppercase bg-black/60 px-2.5 py-0.5 rounded backdrop-blur-xs">
                  Scanning QR
                </span>
              </div>
            </div>

            {/* Top Bar Camera Status & Controls */}
            <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-auto">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-black/65 backdrop-blur-md rounded-full text-[11px] font-semibold text-emerald-300 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Camera Scanner
              </span>

              <div className="flex items-center gap-1.5">
                {torchAvailable && (
                  <button
                    type="button"
                    onClick={handleToggleTorch}
                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer backdrop-blur-md ${
                      torchOn
                        ? 'bg-amber-400 text-slate-900 border-amber-300'
                        : 'bg-black/60 hover:bg-black/80 text-white border-white/20'
                    }`}
                    title={torchOn ? 'Turn Off Flashlight' : 'Turn On Flashlight'}
                  >
                    {torchOn ? <FlashlightOff className="w-4 h-4" /> : <Flashlight className="w-4 h-4" />}
                  </button>
                )}

                <button
                  type="button"
                  onClick={toggleFacingMode}
                  className="p-1.5 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white rounded-lg border border-white/20 transition-colors cursor-pointer"
                  title="Switch Camera (Front / Back)"
                >
                  <SwitchCamera className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => startCamera()}
                  className="p-1.5 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white rounded-lg border border-white/20 transition-colors cursor-pointer"
                  title="Restart Camera"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Bottom Guidance */}
            <div className="absolute bottom-3 inset-x-3 text-center pointer-events-none">
              <p className="inline-block text-[11px] text-white/95 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full font-medium shadow-xs">
                {instructionText}
              </p>
            </div>
          </>
        )}

        {/* Loading Overlay while Starting */}
        {isCameraStarting && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-white">Opening Device Camera...</p>
              <p className="text-xs text-slate-400">Connecting to device hardware video stream...</p>
            </div>
          </div>
        )}

        {/* Decoding Image File Overlay */}
        {isDecodingFile && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-white">Decoding QR Code...</p>
              <p className="text-xs text-slate-400">Processing captured card image...</p>
            </div>
          </div>
        )}

        {/* Stopped / Permission Needed State Overlay */}
        {!isCameraActive && !isCameraStarting && !isDecodingFile && (
          <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="p-3.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full shadow-inner inline-flex">
              <Camera className="w-8 h-8" />
            </div>

            <div className="space-y-1 max-w-sm">
              <p className="text-sm font-bold text-white">
                {cameraError ? 'Camera Access Notice' : 'Device Camera Ready'}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                {cameraError
                  ? cameraError
                  : 'Tap below to activate device camera and start scanning physical alumni cards.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleTriggerDeviceCamera}
                className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold tracking-wide transition-colors shadow-md inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Open Camera Scanner</span>
              </button>

              <button
                type="button"
                onClick={() => nativeCaptureInputRef.current?.click()}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors border border-slate-700 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Take Photo</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Camera Alert / Error Banner if any */}
      {cameraError && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{cameraError}</span>
          </div>
          <button
            type="button"
            onClick={handleTriggerDeviceCamera}
            className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs shrink-0 cursor-pointer inline-flex items-center gap-1.5"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-400" />
            <span>Open Camera</span>
          </button>
        </div>
      )}
    </div>
  );
};
