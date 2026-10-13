import React, { useState } from 'react';
import { api } from '../../services/api.js';
import {
  KeyRound,
  Mail,
  Lock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldAlert,
  Server,
  UserCheck
} from 'lucide-react';

interface AdminSettingsProps {
  user: any;
  onUpdateUser?: (user: any) => void;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({
  user,
  onUpdateUser
}) => {
  const [email, setEmail] = useState(user?.email || 'admin@panpacificu.edu.ph');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentPassword) {
      setError('Please enter your current security password to authenticate this change.');
      return;
    }

    if (!email.trim()) {
      setError('Administrator email cannot be blank.');
      return;
    }

    if (newPassword) {
      if (newPassword.length < 5) {
        setError('New password must be at least 5 characters long.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('The new password and confirmation password do not match.');
        return;
      }
    }

    setLoading(true);

    try {
      const res = await api.updateAdminCredentials(
        currentPassword.trim(),
        email.trim(),
        newPassword ? newPassword.trim() : undefined
      );

      setSuccess('Administrator login credentials updated successfully! Changes are synced with the central cloud database.');
      if (onUpdateUser && res.user) {
        onUpdateUser(res.user);
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update credentials. Please verify your current password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-800">
              <KeyRound className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              Admin Portal Security & Credentials
            </h1>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Manage administrative authentication credentials and console access keys.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-semibold self-start sm:self-auto">
          <Server className="w-3.5 h-3.5" />
          <span>Central Cloud Sync: Active</span>
        </div>
      </div>

      {/* Main Settings Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-sm font-bold text-slate-900">
              Update Administrator Login Credentials
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Change the email address and password required to sign in to the administrative portal.
            </p>
          </div>

          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
            {/* Hidden decoy fields to defeat browser autofill */}
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

            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Administrator Login Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="EMAIL"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg text-xs text-slate-900 font-medium focus:outline-none transition-colors"
                />
              </div>
              <span className="text-[11px] text-slate-500 block">
                This email is used to log in on any device across the university network.
              </span>
            </div>

            {/* Current Password Field */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-700">
                  Current Password <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-amber-700 font-medium">
                  Verification Required
                </span>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="PASSWORD"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg text-xs text-slate-900 focus:outline-none transition-colors"
                />
              </div>
              <span className="text-[11px] text-slate-500 block">
                Enter your existing password to authorize updating the login credentials.
              </span>
            </div>

            {/* New Password Fields */}
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  New Password <span className="text-slate-400 font-normal">(optional, leave blank to keep current)</span>
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password (min. 5 characters)"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg text-xs text-slate-900 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {newPassword && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Confirm New Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="password"
                      required={!!newPassword}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg text-xs text-slate-900 focus:outline-none transition-colors"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Submit button */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving Credentials...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Save New Credentials</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Security Information */}
        <div className="space-y-6">
          {/* Current Session Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-xs uppercase tracking-wider border-b border-slate-100 pb-2">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>Active Session</span>
            </div>

            <div className="space-y-2 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Administrator Name</span>
                <span className="font-semibold text-slate-900">{user?.name || 'Administrator'}</span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Current Login Email</span>
                <span className="font-mono font-semibold text-amber-700 break-all">
                  {user?.email || 'admin@panpacificu.edu.ph'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Access Role</span>
                <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">
                  SUPER_ADMIN (Registrar & Alumni)
                </span>
              </div>
            </div>
          </div>

          {/* Central Database Sync Note */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
              <Server className="w-4 h-4" />
              <span>Multi-Device Database</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              When you change credentials here, the updates are immediately committed to the central cloud Firestore database. Any new browser session or device must sign in using the updated credentials.
            </p>
          </div>

          {/* Security Best Practices */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-2.5 text-xs text-amber-900">
            <div className="flex items-center gap-1.5 font-bold text-amber-800">
              <ShieldAlert className="w-4 h-4" />
              <span>Security Advisory</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800/90 leading-normal">
              <li>Use a strong password with letters, numbers, and symbols.</li>
              <li>Credentials are never exposed to the public verification portal.</li>
              <li>All credential modification events are written to the audit log.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
