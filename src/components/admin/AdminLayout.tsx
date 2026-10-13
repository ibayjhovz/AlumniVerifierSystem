import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  CreditCard,
  QrCode,
  FileCheck,
  History as HistoryIcon,
  LogOut,
  Shield,
  KeyRound,
  Lock,
  Mail,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X
} from 'lucide-react';
import { api } from '../../services/api.js';

export type AdminTab =
  | 'dashboard'
  | 'alumni-list'
  | 'alumni-add'
  | 'alumni-detail'
  | 'cards'
  | 'qr-codes'
  | 'verification-logs'
  | 'activity-logs'
  | 'settings';

interface AdminLayoutProps {
  currentTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onLogout: () => void;
  user: any;
  onUpdateUser?: (user: any) => void;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentTab,
  onTabChange,
  onLogout,
  user,
  onUpdateUser,
  children
}) => {
  const [showCredsModal, setShowCredsModal] = useState(false);
  const [newEmail, setNewEmail] = useState(user?.email || 'admin@panpacificu.edu.ph');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [credsLoading, setCredsLoading] = useState(false);
  const [credsError, setCredsError] = useState<string | null>(null);
  const [credsSuccess, setCredsSuccess] = useState<string | null>(null);

  const navItems: { id: AdminTab; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'alumni-list', label: 'Alumni Directory', icon: Users },
    { id: 'alumni-add', label: 'Add Alumni', icon: UserPlus },
    { id: 'cards', label: 'Card Management', icon: CreditCard },
    { id: 'qr-codes', label: 'QR Codes', icon: QrCode },
    { id: 'verification-logs', label: 'Verification Logs', icon: FileCheck },
    { id: 'activity-logs', label: 'Activity Logs', icon: HistoryIcon },
    { id: 'settings', label: 'Admin Security', icon: KeyRound }
  ];

  const handleOpenCredsModal = () => {
    setNewEmail(user?.email || 'admin@panpacificu.edu.ph');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setCredsError(null);
    setCredsSuccess(null);
    setShowCredsModal(true);
  };

  const handleUpdateCredsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setCredsError('Please enter your current security password to authenticate.');
      return;
    }

    if (!newEmail.trim()) {
      setCredsError('Administrator email cannot be empty.');
      return;
    }

    if (newPassword) {
      if (newPassword.length < 5) {
        setCredsError('New password must be at least 5 characters long.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setCredsError('The new password and confirmation password do not match.');
        return;
      }
    }

    setCredsLoading(true);
    setCredsError(null);
    setCredsSuccess(null);

    try {
      const res = await api.updateAdminCredentials(
        currentPassword,
        newEmail.trim(),
        newPassword ? newPassword.trim() : undefined
      );

      setCredsSuccess('Administrator credentials updated successfully! Changes are active immediately.');
      if (onUpdateUser && res.user) {
        onUpdateUser(res.user);
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setCredsError(err.message || 'Failed to update credentials. Please verify your current password.');
    } finally {
      setCredsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Admin Top Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand */}
          <button
            onClick={() => onTabChange('dashboard')}
            className="flex items-center gap-2 text-left cursor-pointer group"
            title="Go to Dashboard"
          >
            <div className="space-y-0.5">
              <span className="font-serif text-sm sm:text-base font-bold tracking-wider uppercase block text-emerald-400 group-hover:text-emerald-300 transition-colors">
                Panpacific University
              </span>
              <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-medium">
                Alumni Registry Administration
              </span>
            </div>
          </button>

          {/* Central Cloud Database Connection Status */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-slate-800/80 rounded-full border border-slate-700/80">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-medium text-slate-300">
              Central Cloud DB: <strong className="text-emerald-400 font-semibold">Online</strong> (Multi-Device Shared)
            </span>
          </div>

          {/* User profile & Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-200">
                {user?.name || 'Administrator'}
              </span>
              <span className="text-[10px] text-amber-400 font-mono">
                {user?.email || 'admin@panpacificu.edu.ph'}
              </span>
            </div>

            <div className="h-6 w-px bg-slate-700 hidden sm:block" />

            {/* Change Credentials Button */}
            <button
              onClick={handleOpenCredsModal}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-amber-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-amber-500/40 rounded-lg transition-colors cursor-pointer shadow-xs"
              title="Change administrator login email or password"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Change Credentials</span>
              <span className="sm:hidden">Creds</span>
            </button>

            {/* Logout button */}
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              title="Sign out of administrative console"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Horizontal Navigation Bar for Fast Switching */}
        <div className="bg-slate-950/80 border-t border-slate-800/80 px-4 sm:px-6 lg:px-8 overflow-x-auto scrollbar-none">
          <div className="max-w-7xl mx-auto flex items-center gap-1 py-1.5 min-w-max">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                currentTab === item.id ||
                (item.id === 'alumni-list' && currentTab === 'alumni-detail');
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>

      {/* Credentials Modal */}
      {showCredsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    Change Login Credentials
                  </h3>
                </div>
                <p className="text-xs text-slate-600">
                  Update the administrator email and security password for this console.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCredsModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {credsError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-800">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{credsError}</span>
              </div>
            )}

            {credsSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{credsSuccess}</span>
              </div>
            )}

            <form onSubmit={handleUpdateCredsSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Administrator Login Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="EMAIL"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg text-xs text-slate-900 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-semibold text-slate-700">
                    Current Password <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-500">Required for verification</span>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg text-xs text-slate-900 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 space-y-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    New Password <span className="text-slate-400 font-normal">(optional, leave blank to keep current)</span>
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min. 5 characters)"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg text-xs text-slate-900 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {newPassword && (
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="password"
                        required={!!newPassword}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-lg text-xs text-slate-900 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCredsModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={credsLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors shadow-xs cursor-pointer"
                >
                  {credsLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Credentials</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-600">
        <p>
          Panpacific University · Integrated Alumni Management System (Admin Console v2.6)
        </p>
      </footer>
    </div>
  );
};
