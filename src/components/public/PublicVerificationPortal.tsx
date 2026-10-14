import React, { useState, useEffect } from 'react';
import { VerificationResultView } from './VerificationResultView.js';
import { PublicVerificationResponse } from '../../types/alumni.js';
import { api } from '../../services/api.js';
import { extractVerificationToken } from '../../utils/qrDecoder.js';
import { CentralizedDeviceCamera } from '../camera/CentralizedDeviceCamera.js';
import { centralizedCamera } from '../../services/centralizedCamera.js';
import {
  QrCode,
  AlertCircle,
  Loader2,
  ShieldCheck,
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

  // Auto-verify if initialToken is provided in URL
  useEffect(() => {
    if (initialToken) {
      setTokenInput(initialToken);
      performVerification(initialToken);
    }
  }, [initialToken]);

  // Clean up centralized camera hardware on unmount
  useEffect(() => {
    return () => {
      centralizedCamera.stopCurrentStream();
    };
  }, []);

  const performVerification = async (rawCode: string) => {
    const token = extractVerificationToken(rawCode);
    if (!token) {
      setErrorMessage('Please provide a valid alumni card QR code or verification identifier.');
      return;
    }

    centralizedCamera.stopCurrentStream();
    setLoading(true);
    setErrorMessage(null);
    setTokenInput(token);

    try {
      const response = await api.verifyToken(token);
      setVerificationResult(response);
      const targetUrl = `/verify/${encodeURIComponent(token)}`;
      if (window.location.pathname !== targetUrl) {
        window.history.pushState({}, '', targetUrl);
      }
    } catch (err: any) {
      setVerificationResult({
        result: 'ERROR',
        verification_reference: 'VER-SYS-ERR',
        verified_at: new Date().toISOString(),
        message: err.message || 'We are unable to verify this card at the moment. Please try again later.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = idInput.trim();
    if (!cleanId) return;
    performVerification(cleanId);
  };

  const handleReset = () => {
    centralizedCamera.stopCurrentStream();
    setVerificationResult(null);
    setTokenInput('');
    setIdInput('');
    setErrorMessage(null);
    if (window.location.pathname.startsWith('/verify')) {
      window.history.pushState({}, '', '/');
    }
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

            {/* Centralized Device Camera Scanner */}
            <div className="space-y-4">
              <CentralizedDeviceCamera
                onScan={(code) => performVerification(code)}
                autoStart={true}
                instructionText="Point camera at alumni card QR code to scan"
                showDeviceSelector={true}
              />
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
