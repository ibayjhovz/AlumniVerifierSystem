import React, { useState } from 'react';
import { api } from '../../services/api.js';
import {
  Lock,
  Mail,
  KeyRound,
  AlertCircle,
  Loader2,
  ShieldCheck,
  ArrowLeft
} from 'lucide-react';

interface AdminLoginProps {
  onLoginSuccess: (user: any) => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);

    try {
      const res = await api.adminLogin(email.trim(), password);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Invalid administrator credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4">
      {/* Back to Public Portal Link */}
      <div className="w-full max-w-md mb-4 flex justify-between items-center text-xs">
        <a
          href="/"
          className="text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Public QR Scanner</span>
        </a>
        <span className="text-slate-500 font-mono text-[11px]">ADMIN CONSOLE</span>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-700/40 p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="space-y-1">
            <h1 className="font-serif text-xl font-bold uppercase tracking-wider text-slate-900">
              Panpacific University
            </h1>
            <p className="text-xs uppercase tracking-[0.2em] font-semibold text-emerald-800">
              Administrative Portal
            </p>
            <p className="text-[11px] text-slate-600">
              Official University Registrar & Alumni Registry Systems
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-800">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Credentials Form with strictly EMAIL and PASSWORD placeholders & autofill removed */}
        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
          {/* Hidden decoy fields to thwart browser autofill */}
          <input
            type="text"
            style={{ display: 'none' }}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />
          <input
            type="password"
            style={{ display: 'none' }}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />

          <div className="space-y-1">
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-600 absolute left-3 top-3 pointer-events-none" />
              <input
                type="email"
                required
                name="pu_admin_identifier_no_fill"
                id="pu_admin_identifier"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="EMAIL"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-600 absolute left-3 top-3 pointer-events-none" />
              <input
                type="password"
                required
                name="pu_admin_secret_no_fill"
                id="pu_admin_secret"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="PASSWORD"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Sign In to Admin Console</span>
              </>
            )}
          </button>
        </form>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 space-y-1">
          <div className="flex items-center gap-1 font-semibold text-slate-700">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Authorized Personnel Notice</span>
          </div>
          <p>
            Access is restricted to verified university registrar personnel. Credentials can be managed from within the administrative portal after logging in.
          </p>
        </div>
      </div>
    </div>
  );
};
