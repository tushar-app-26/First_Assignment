import { useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const emptyForm = { email: "", password: "" };

function Icon({ name, size = 20 }) {
  const paths = {
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v3" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function App() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(emptyForm);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("credentials");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [profile, setProfile] = useState(null);

  const updateForm = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const resetNotice = () => { setError(""); setMessage(""); };

  async function request(path, body, options = {}) {
    const response = await fetch(path, {
      method: options.method ?? "POST",
      headers: { "Content-Type": "application/json", ...options.headers },
      ...(body && { body: JSON.stringify(body) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Something went wrong. Please try again.");
    return data;
  }

  async function handleCredentials(event) {
    event.preventDefault();
    resetNotice();
    setLoading(true);
    try {
      if (mode === "signup") {
        const data = await request("/signup", form);
        setMessage(`${data.message}. You can now sign in.`);
        setMode("login");
        setForm(emptyForm);
      } else {
        const data = await request("/login", form);
        setMessage(data.message);
        setStep("otp");
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleOtp(event) {
    event.preventDefault();
    resetNotice();
    setLoading(true);
    try {
      const data = await request("/verify-login-otp", { email: form.email, otp });
      sessionStorage.setItem("accessToken", data.token);
      const userData = await request("/profile", null, {
        method: "GET",
        headers: { Authorization: `Bearer ${data.token}` },
      });
      setProfile(userData.user);
      setStep("success");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setStep("credentials");
    setForm(emptyForm);
    resetNotice();
  }

  return (
    <main className="page-shell">
      <section className="form-panel" id="top">
        <div className="form-wrap">
          {step === "success" ? (
            <div className="success-card">
              <div className="success-icon"><Icon name="check" size={31} /></div>
              <p className="eyebrow">VERIFIED</p>
              <h2>You’re all set.</h2>
              <p>Signed in securely as <strong>{profile?.email}</strong>.</p>
              <button className="primary-button" onClick={() => { sessionStorage.removeItem("accessToken"); setProfile(null); setOtp(""); setForm(emptyForm); setStep("credentials"); }}>
                Back to sign in <Icon name="arrow" size={18} />
              </button>
            </div>
          ) : step === "otp" ? (
            <div>
              <button className="back-button" onClick={() => { setStep("credentials"); resetNotice(); }}>← Back to sign in</button>
              <p className="eyebrow">TWO-STEP VERIFICATION</p>
              <h2>Check your inbox</h2>
              <p className="intro">We sent a six-digit verification code to <strong>{form.email}</strong>.</p>
              <form onSubmit={handleOtp}>
                <label htmlFor="otp">Verification code</label>
                <input id="otp" className="otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength="6" placeholder="000000" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} required />
                {error && <p className="notice error" role="alert">{error}</p>}
                {message && <p className="notice success" role="status">{message}</p>}
                <button className="primary-button" disabled={loading || otp.length !== 6}>{loading ? "Verifying…" : <>Verify & sign in <Icon name="arrow" size={18} /></>}</button>
              </form>
              <button className="link-button" onClick={handleCredentials} disabled={loading}>Resend code</button>
            </div>
          ) : (
            <div>
              <div className="tab-list" role="tablist" aria-label="Account actions">
                <button className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")} role="tab" aria-selected={mode === "login"}>Sign in</button>
                <button className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")} role="tab" aria-selected={mode === "signup"}>Create account</button>
              </div>
              <p className="eyebrow">{mode === "login" ? "WELCOME BACK" : "GET STARTED"}</p>
              <h2>{mode === "login" ? "Sign in to your account" : "Create your account"}</h2>
              <p className="intro">{mode === "login" ? "Enter your details to continue securely." : "Use your email to create a protected account."}</p>
              <form onSubmit={handleCredentials}>
                <label htmlFor="email">Email address</label>
                <div className="input-wrap"><span><Icon name="mail" size={19} /></span><input id="email" type="email" name="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={updateForm} required /></div>
                <label htmlFor="password">Password</label>
                <div className="input-wrap"><span><Icon name="lock" size={19} /></span><input id="password" type={showPassword ? "text" : "password"} name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Enter your password" value={form.password} onChange={updateForm} minLength="6" required /><button className="show-password" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}><Icon name="eye" size={19} /></button></div>
                {error && <p className="notice error" role="alert">{error}</p>}
                {message && <p className="notice success" role="status">{message}</p>}
                <button className="primary-button" disabled={loading}>{loading ? "Please wait…" : <>{mode === "login" ? "Continue" : "Create account"} <Icon name="arrow" size={18} /></>}</button>
              </form>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
