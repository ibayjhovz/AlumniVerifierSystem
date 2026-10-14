import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { VerificationResultView } from './VerificationResultView.js';
import { PublicVerificationResponse } from '../../types/alumni.js';
import { api } from '../../services/api.js';
import { decodeQRCodeFromImage, extractVerificationToken } from '../../utils/qrDecoder.js';
import {
  QrCode,
  Camera,
  AlertCircle,
  Loader2,
  ShieldCheck,
  SwitchCamera,
  Search,
  X
} from 'lucide-react';

interface PublicVerificationPortalProps {
  initialToken?: string;
  embedded?: boolean;
}

export const PublicVerificationPortal: React.FC<PublicVerificationPortalProps> = ({
  initialToken = '',
  embedded = false
}) => {
  const [tokenInput, setTokenInput] = useState(initialToken);
  const [idInput, setIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<PublicVerificationResponse | null>(null);
  const [isDecodingQR, setIsDecodingQR] = useState(false);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const cameraCaptureInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  // Auto-verify if initialToken is provided in URL
  useEffect(() => {
    if (initialToken) {
      setTokenInput(initialToken);
      performVerification(initialToken);
    }
  }, [initialToken]);

  const stopCamera = () => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsCameraStarting(false);
  };

  const startCamera = async (mode: 'environment' | 'user' = facingMode) => {
    stopCamera();
    setCameraError(null);
    setIsCameraStarting(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser.');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
      } catch (e1) {
        // Fallback 1: basic facingMode
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: mode }
          });
        } catch (e2) {
          // Fallback 2: generic video
          stream = await navigator.mediaDevices.getUserMedia({
            video: true
          });
        }
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }
      setIsCameraActive(true);
      setIsCameraStarting(false);
      animationFrameIdRef.current = requestAnimationFrame(scanQRCodeLoop);
    } catch (err: any) {
      console.warn('Camera stream error, falling back to camera capture:', err);
      setIsCameraStarting(false);
      setIsCameraActive(false);

      // Auto-fallback: directly trigger native device camera capture
      try {
        if (cameraCaptureInputRef.current) {
          cameraCaptureInputRef.current.click();
          return;
        }
      } catch {}

      setCameraError('Camera access was not granted. Tap "Open Camera" to scan.');
    }
  };

  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const scanQRCodeLoop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      animationFrameIdRef.current = requestAnimationFrame(scanQRCodeLoop);
      return;
    }

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
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
          const rawScanned = code.data.trim();
          try {
            if (navigator.vibrate) navigator.vibrate(100);
          } catch {}
          stopCamera();
          setTokenInput(rawScanned);
          performVerification(rawScanned);
          return;
        }
      }
    }

    animationFrameIdRef.current = requestAnimationFrame(scanQRCodeLoop);
  };

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Automatically open the camera of the device on mount
  useEffect(() => {
    if (!initialToken) {
      startCamera();
    }
  }, [initialToken]);

  const performVerification = async (rawCode: string) => {
    const token = extractVerificationToken(rawCode);
    if (!token) {
      setErrorMessage('Please provide a valid alumni card QR code or verification identifier.');
      return;
    }

    stopCamera();
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.verifyToken(token);
      setVerificationResult(response);
      // Update browser URL without reloading if not already there
      const targetUrl = `/verify/${encodeURIComponent(token)}`;
      if (window.location.pathname !== targetUrl) {
        window.history.pushState({}, '', targetUrl);
      }
    } catch (err: any) {
      // If error returned is 500 or network failure, render graceful system error state
      setVerificationResult({
        result: 'ERROR',
        verification_reference: 'VER-SYS-ERR',
        verified_at: new Date().toISOString(),
        message: err.message || 'We are unable to verify this QR code at the moment. Please try again later.'
      });
    } finally {
      setLoading(false);
    }
  };


  const handleCameraCaptureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsDecodingQR(true);
    setErrorMessage(null);

    try {
      const decoded = await decodeQRCodeFromImage(file);
      setTokenInput(decoded.value);
      await performVerification(decoded.value);
    } catch (err: any) {
      setErrorMessage(err.message || 'QR code could not be detected. Please point camera directly at the QR code.');
    } finally {
      setIsDecodingQR(false);
      if (cameraCaptureInputRef.current) {
        cameraCaptureInputRef.current.value = '';
      }
    }
  };

  const handleOpenDeviceCamera = async () => {
    setErrorMessage(null);
    if (cameraError) {
      cameraCaptureInputRef.current?.click();
      return;
    }
    await startCamera(facingMode);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = idInput.trim();
    if (!cleanId) return;
    stopCamera();
    setTokenInput(cleanId);
    performVerification(cleanId);
  };

  const handleReset = () => {
    stopCamera();
    setVerificationResult(null);
    setTokenInput('');
    setIdInput('');
    setErrorMessage(null);
    setCameraError(null);
    if (window.location.pathname.startsWith('/verify')) {
      window.history.pushState({}, '', '/');
    }
    // Automatically re-open the camera for the next scan
    startCamera();
  };

  const verificationContent = (
    <>
      {loading ? (
        <div className="bg-white p-10 rounded-2xl border border-slate-200 shadow-sm text-center space-y-4 max-w-md w-full mx-auto">
          <Loader2 className="w-10 h-10 text-slate-800 animate-spin mx-auto" />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">Querying Official Registry...</h2>
            <p className="text-xs text-slate-600">
              Performing live database verification of alumni card credentials.
            </p>
          </div>
        </div>
      ) : verificationResult ? (
        <VerificationResultView data={verificationResult} onReset={handleReset} />
      ) : (
        <div className="w-full max-w-xl mx-auto space-y-6">
            {/* Verification Card */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-6 sm:p-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center mx-auto">
                  <QrCode className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  Verify Alumni Card
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
                  Scan the QR code with your device camera or enter an Alumni ID number to authenticate membership status.
                </p>
              </div>

              {errorMessage && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Verification Notice</p>
                    <p>{errorMessage}</p>
                  </div>
                </div>
              )}

              {/* Unified Camera Scanner (Automatically Opens Device Camera) */}
              <div className="space-y-4">
                {/* Hidden native camera capture input (bypasses browser permission issues) */}
                <input
                  type="file"
                  ref={cameraCaptureInputRef}
                  onChange={handleCameraCaptureUpload}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  id="qr-camera-capture-input"
                />

                {cameraError && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{cameraError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => cameraCaptureInputRef.current?.click()}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold text-xs shrink-0 cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Open Camera</span>
                    </button>
                  </div>
                )}

                {isCameraActive ? (
                  <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-md">
                    {/* Live Camera Viewfinder Video */}
                    <video
                      ref={videoRef}
                      playsInline
                      autoPlay
                      muted
                      className="w-full h-64 sm:h-72 object-cover"
                    />

                    {/* Targeting Viewfinder Overlay */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                      <div className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-2xl border-2 border-emerald-400/40 shadow-2xl overflow-hidden flex items-center justify-center">
                        {/* Targeting corner brackets */}
                        <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                        <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

                        {/* Animated laser scan line */}
                        <div className="animate-scan-line bg-gradient-to-r from-transparent via-emerald-400 to-transparent h-0.5 w-full absolute shadow-[0_0_8px_rgba(52,211,153,0.8)]" />

                        <span className="text-[10px] text-emerald-200/90 font-mono tracking-wider uppercase bg-black/50 px-2 py-0.5 rounded backdrop-blur-xs">
                          Targeting QR
                        </span>
                      </div>
                    </div>

                    {/* Top Bar Camera Controls */}
                    <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-auto">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-full text-[11px] font-semibold text-emerald-300 border border-emerald-500/30">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Camera Active
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={toggleFacingMode}
                          className="p-1.5 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white rounded-lg border border-white/20 transition-colors cursor-pointer"
                          title="Flip camera"
                        >
                          <SwitchCamera className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="p-1.5 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white rounded-lg border border-white/20 transition-colors cursor-pointer"
                          title="Close camera"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Bottom Guidance Label */}
                    <div className="absolute bottom-3 inset-x-3 text-center pointer-events-none">
                      <p className="inline-block text-[11px] text-white/95 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full font-medium shadow-xs">
                        Point camera at alumni card QR code to scan
                      </p>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={handleOpenDeviceCamera}
                    className="border-2 border-dashed border-slate-300 hover:border-emerald-600 bg-slate-50/70 hover:bg-emerald-50/30 rounded-2xl p-6 sm:p-8 text-center space-y-4 transition-all cursor-pointer group"
                  >
                    <div className="p-3.5 bg-emerald-50 group-hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full shadow-xs inline-flex transition-colors">
                      {isCameraStarting ? (
                        <Loader2 className="w-7 h-7 text-emerald-800 animate-spin" />
                      ) : (
                        <Camera className="w-7 h-7 text-emerald-700" />
                      )}
                    </div>

                    <div className="space-y-1 max-w-sm mx-auto">
                      <span className="text-sm font-bold text-slate-900 block">
                        {isCameraStarting ? 'Opening Device Camera...' : 'Tap to Open Camera'}
                      </span>
                      <span className="text-xs text-slate-600 block leading-relaxed">
                        {isCameraStarting
                          ? 'Initializing device camera scanner...'
                          : 'Point your device camera at the QR code on the physical alumni card to verify.'}
                      </span>
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDeviceCamera();
                        }}
                        disabled={isCameraStarting}
                        className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold tracking-wide transition-colors shadow-xs inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isCameraStarting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                            <span>Opening Camera...</span>
                          </>
                        ) : (
                          <>
                            <Camera className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Open Camera</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Hidden canvas element for live camera frame processing */}
                <canvas ref={canvasRef} className="hidden" />
              </div>

              {/* Divider */}
              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-slate-500 font-medium tracking-wide">
                    or input ID number
                  </span>
                </div>
              </div>

              {/* ID Number Direct Verification Form */}
              <div className="space-y-2">
                <label htmlFor="alumni-id-input" className="block text-xs font-semibold text-slate-700">
                  Alumni ID or Card Number
                </label>
                <form onSubmit={handleManualSubmit} className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Search className="w-4 h-4" />
                    </div>
                    <input
                      id="alumni-id-input"
                      type="text"
                      value={idInput}
                      onChange={(e) => setIdInput(e.target.value)}
                      placeholder="e.g. PU-2024-00123 or AC-2024-00123"
                      className="w-full pl-9.5 pr-8 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-all font-mono uppercase placeholder:font-sans placeholder:normal-case placeholder:text-slate-400"
                    />
                    {idInput && (
                      <button
                        type="button"
                        onClick={() => setIdInput('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md cursor-pointer"
                        title="Clear input"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={!idInput.trim() || loading}
                    className="px-4 sm:px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>Verify ID</span>
                  </button>
                </form>
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>Direct registry check by official ID</span>
                  <span className="hidden sm:inline text-slate-600 font-mono">Format: PU-YYYY-XXXXX</span>
                </div>
              </div>
            </div>

            {/* University Registry Notice */}
            <div className="p-4 bg-white/60 border border-slate-200 rounded-xl space-y-1.5 text-xs text-slate-600">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>Authoritative University Registry</span>
              </div>
              <p className="leading-relaxed text-[11px]">
                Every scan performs a real-time cryptographic verification directly with the Panpacific University central alumni database to validate current membership and active card status.
              </p>
            </div>
          </div>
        )}
    </>
  );

  if (embedded) {
    return (
      <div className="w-full flex items-center justify-center">
        {verificationContent}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between font-sans">
      {/* Official Header */}
      <header className="bg-white border-b border-slate-200 py-6 px-4 shadow-xs">
        <div className="max-w-4xl mx-auto flex flex-col items-center justify-center text-center space-y-1">
          <h1 className="font-serif tracking-widest text-xl sm:text-2xl font-bold uppercase text-slate-900">
            Panpacific University
          </h1>
          <p className="text-xs uppercase tracking-[0.25em] font-semibold text-emerald-800">
            OFFICIAL ALUMNI VERIFICATION
          </p>
          <p className="text-[11px] text-slate-600">
            Official University Registrar & Alumni Registry Services
          </p>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8 flex items-center justify-center">
        {verificationContent}
      </main>

      {/* Official Institutional Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 px-4 text-center space-y-1.5">
        <p className="text-xs text-slate-700 font-medium">
          Panpacific University · Office of the University Registrar & Alumni Affairs
        </p>
        <p className="text-[11px] text-slate-600">
          Official University Verification Portal · All verifications are cryptographically logged for audit integrity.
        </p>
      </footer>
    </div>
  );
};
