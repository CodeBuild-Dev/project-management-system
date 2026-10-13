import { useState, FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/lib/auth/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import { LoginIllustration } from './LoginIllustration';
import { premiumInputClass as inputClass, premiumPrimaryButtonClass } from '@/lib/form-styles';

export default function Login() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast({
        title: t('auth.login.errors.emailRequiredTitle'),
        description: t('auth.login.errors.emailRequiredDesc'),
        variant: 'destructive',
      });
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      toast({
        title: t('auth.login.errors.emailInvalidTitle'),
        description: t('auth.login.errors.emailInvalidDesc'),
        variant: 'destructive',
      });
      return;
    }
    if (!password) {
      toast({
        title: t('auth.login.errors.passwordRequiredTitle'),
        description: t('auth.login.errors.passwordRequiredDesc'),
        variant: 'destructive',
      });
      return;
    }

    setBusy(true);
    try {
      await login({
        email: trimmedEmail,
        password,
        totpCode: totpRequired ? totpCode : undefined,
      });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const message = (err as Error).message;
      // Server signals 2FA by throwing UNAUTHORIZED with message "TOTP_REQUIRED".
      if (message === 'TOTP_REQUIRED') {
        setTotpRequired(true);
      } else {
        toast({
          title: t('auth.login.errors.signInFailedTitle'),
          description: message,
          variant: 'destructive',
        });
      }
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="min-h-screen bg-card grid lg:grid-cols-2">
      {/* Mobile/tablet-only gradient accent bar so the brand is visible when the illustration panel is hidden */}
      <div aria-hidden="true" className="h-1.5 bg-brand-gradient lg:hidden" />

      {/* Left: form */}
      <div className="relative flex flex-col p-5 sm:p-8 md:p-10 lg:p-16 min-h-[calc(100vh-0.375rem)] lg:min-h-screen">
        {/* Brand mark */}
        <div className="flex items-center gap-2 animate-fade-in-up">
          <div className="w-8 h-8 bg-brand-gradient rounded-lg flex items-center justify-center shadow-md shadow-primary/30">
            <span className="text-white text-sm font-bold">S</span>
          </div>
          <span className="text-sm font-semibold">Project Management</span>
        </div>

        {/* Centered content block */}
        <div className="flex-1 flex items-center">
          <div className="w-full max-w-md mx-auto py-6 sm:py-10">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight tracking-tight animate-fade-in-up delay-100">
              {t('auth.login.title')}
              <br />
              {t('auth.login.titleLine2')}
            </h1>
            <p className="text-sm text-muted-foreground mt-3 mb-6 sm:mb-8 animate-fade-in-up delay-200">
              {t('auth.login.subtitle')}
            </p>

            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5 animate-fade-in-up delay-300">
                <Label htmlFor="email" className="sr-only">
                  {t('auth.login.emailPlaceholder')}
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.login.emailPlaceholder')}
                  autoComplete="email"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5 animate-fade-in-up delay-400">
                <Label htmlFor="password" className="sr-only">
                  {t('auth.login.passwordPlaceholder')}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.login.passwordPlaceholder')}
                    autoComplete="current-password"
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {totpRequired && (
                <div className="space-y-1.5 animate-fade-in-up">
                  <Label htmlFor="totp" className="text-xs text-muted-foreground">
                    {t('auth.login.twoFactorLabel')}
                  </Label>
                  <Input
                    id="totp"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('auth.login.twoFactorPlaceholder')}
                    autoComplete="one-time-code"
                    autoFocus
                    className={inputClass}
                  />
                </div>
              )}

              <div className="pt-1 animate-fade-in-up delay-500">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                  <Checkbox
                    checked={remember}
                    onCheckedChange={(v) => setRemember(v === true)}
                    className="rounded-md"
                  />
                  {t('auth.login.rememberMe')}
                </label>
              </div>

              <div className="animate-fade-in-up delay-600">
                <Button
                  type="submit"
                  disabled={busy}
                  className={`${premiumPrimaryButtonClass} w-full mt-2`}
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  {t('auth.login.submit')}
                  {!busy && (
                    <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5" />
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>

      </div>

      {/* Right: illustration — shown only on lg+ so landscape phones and tablets get the single-column layout */}
      <div className="hidden lg:flex bg-brand-gradient-animated relative overflow-hidden items-center justify-center p-8 xl:p-12">
        <LoginIllustration />
      </div>
    </div>
  );
}
