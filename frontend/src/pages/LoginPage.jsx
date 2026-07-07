import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import { setToken, setUser } from '../utils/auth';
import api from '../utils/api';

// 
function EyeIcon({ open }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

// 
function LoginForm({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return toast.error('Please fill in all fields');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      setToken(res.data.token);
      setUser(res.data.user);
      toast.success(`Welcome back, ${res.data.user.name}! 👋`);
      setTimeout(onSuccess, 600);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full bg-slate-900/60 border border-slate-600/50 text-slate-100 rounded-xl px-4 py-3 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
        <div className="relative">
          <input
            id="login-password"
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-slate-900/60 border border-slate-600/50 text-slate-100 rounded-xl px-4 py-3 pr-11 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
          />
          <button
            type="button"
            onClick={() => setShowPw((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <EyeIcon open={showPw} />
          </button>
        </div>
      </div>
      <button
        id="login-submit"
        type="submit"
        disabled={loading}
        className="w-full bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white font-semibold rounded-xl px-5 py-3 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900 flex items-center justify-center gap-2 mt-2"
      >
        {loading ? (
          <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Signing in...</>
        ) : 'Sign In'}
      </button>
    </form>
  );
}

// 
function RegisterForm({ onSuccess }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !password || !confirm) return toast.error('Please fill in all fields');
    if (password.length < 6) return toast.error('Password must be at least 6 characters');
    if (password !== confirm) return toast.error('Passwords do not match');
    setLoading(true);
    try {
      const res = await api.post('/auth/register', { name, email, password });
      setToken(res.data.token);
      setUser(res.data.user);
      toast.success(`Welcome, ${res.data.user.name}! 🎉`);
      setTimeout(onSuccess, 600);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
        <input
          id="reg-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="John Doe"
          className="w-full bg-slate-900/60 border border-slate-600/50 text-slate-100 rounded-xl px-4 py-3 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
        <input
          id="reg-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full bg-slate-900/60 border border-slate-600/50 text-slate-100 rounded-xl px-4 py-3 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
        <div className="relative">
          <input
            id="reg-password"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 6 characters"
            className="w-full bg-slate-900/60 border border-slate-600/50 text-slate-100 rounded-xl px-4 py-3 pr-11 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
          />
          <button
            type="button"
            onClick={() => setShowPw((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <EyeIcon open={showPw} />
          </button>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm Password</label>
        <input
          id="reg-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          className="w-full bg-slate-900/60 border border-slate-600/50 text-slate-100 rounded-xl px-4 py-3 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
        />
      </div>
      <button
        id="reg-submit"
        type="submit"
        disabled={loading}
        className="w-full bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white font-semibold rounded-xl px-5 py-3 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900 flex items-center justify-center gap-2 mt-2"
      >
        {loading ? (
          <><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Creating account...</>
        ) : 'Create Account'}
      </button>
    </form>
  );
}

// 
export default function LoginPage() {
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  const navigate = useNavigate();

  const onSuccess = () => navigate('/', { replace: true });

  return (
    <div className="min-h-screen min-h-dvh bg-[#0f172a] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <Toaster
        position="top-center"
        toastOptions={{
          style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155', borderRadius: '12px' },
          success: { iconTheme: { primary: '#10b981', secondary: '#f1f5f9' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#f1f5f9' } }
        }}
      />

      {/* Ambient glow blobs */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative z-10 animate-[loginEnter_0.5s_cubic-bezier(0.34,1.56,0.64,1)_both]">

        {/* Logo / Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 mb-4 backdrop-blur-sm">
            <span className="text-3xl">🕐</span>
          </div>
          <h1 className="text-2xl font-bold text-white">ExpiryAlert <span className="text-emerald-400">AI</span></h1>
          <p className="text-slate-400 text-sm mt-1">Smart expiry tracking for your home</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 shadow-2xl">

          {/* Tab switcher */}
          <div className="flex bg-slate-900/60 rounded-xl p-1 mb-6">
            {['login', 'register'].map((t) => (
              <button
                key={t}
                id={`tab-${t}`}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                  tab === t
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          {/* Form area with crossfade */}
          <div key={tab} className="animate-[loginEnter_0.3s_ease_both]">
            {tab === 'login'
              ? <LoginForm onSuccess={onSuccess} />
              : <RegisterForm onSuccess={onSuccess} />
            }
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-500 text-xs mt-6">
          Never miss an expiry date again ✅
        </p>
      </div>

      <style>{`
        @keyframes loginEnter {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
